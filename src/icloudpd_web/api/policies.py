from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import tomli_w
import tomllib
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError, ValidationError
from icloudpd_web.store.models import Policy, RunSummary


router = APIRouter(
    prefix="/policies",
    tags=["policies"],
    dependencies=[Depends(require_auth)],
)


class PasswordBody(BaseModel):
    password: str


def _load_last_run(policy_name: str, data_dir: Path) -> RunSummary | None:
    """Load the most recent run sidecar for *policy_name*, or return None."""
    runs_dir = data_dir / "runs" / policy_name
    if not runs_dir.is_dir():
        return None
    sidecars = list(runs_dir.glob("*.meta.json"))
    if not sidecars:
        return None
    # Pick the one with the greatest ended_at string (ISO timestamps sort lexicographically).
    best: dict | None = None
    for path in sidecars:
        try:
            meta = json.loads(path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if best is None or (meta.get("ended_at") or "") > (best.get("ended_at") or ""):
            best = meta
    if best is None:
        return None
    try:
        return RunSummary(
            run_id=best["run_id"],
            started_at=best["started_at"],
            ended_at=best.get("ended_at"),
            status=best["status"],
            exit_code=best.get("exit_code"),
            error_id=best.get("error_id"),
        )
    except Exception:
        return None


def _summary(p: Policy, request: Request) -> dict:
    scheduler = request.app.state.scheduler
    runner = request.app.state.runner
    data_dir: Path = request.app.state.data_dir
    secret_store = request.app.state.secret_store
    data = p.model_dump(mode="json")
    if p.enabled:
        data["next_run_at"] = scheduler.next_run_at(p, after=datetime.now(UTC)).isoformat()
    else:
        data["next_run_at"] = None
    data["is_running"] = runner.is_running(p.name)
    active = runner._active.get(p.name)  # noqa: SLF001
    data["active_run_id"] = (
        active.run_id if active is not None and active.status != "success" else None
    )
    last_run = _load_last_run(p.name, data_dir)
    data["last_run"] = last_run.model_dump(mode="json") if last_run is not None else None
    data["has_password"] = secret_store.get(p.name) is not None
    return data


@router.get("")
def list_policies(request: Request) -> list[dict]:
    store = request.app.state.policy_store
    return [_summary(p, request) for p in store.all()]


@router.get("/export")
def export_policies(request: Request) -> Response:
    """Return all policies bundled as a single TOML document.

    Format: top-level `[[policy]]` array, one entry per policy, each using
    the same shape as the on-disk per-policy TOML files. Round-trips
    through the import endpoint without loss.
    """
    store = request.app.state.policy_store
    bundle = {"policy": [p.to_toml_dict() for p in store.all()]}
    body = tomli_w.dumps(bundle)
    return Response(
        content=body,
        media_type="application/toml",
        headers={
            "Content-Disposition": 'attachment; filename="icloudpd-web-policies.toml"',
        },
    )


@router.post("/import")
async def import_policies(request: Request) -> dict:
    """Create policies from a TOML upload.

    Accepts either a single-policy document (same shape as the on-disk
    files) or a bundle with a top-level `[[policy]]` array. Unknown fields
    are ignored (Pydantic's default) and unknown keys inside `icloudpd`
    are stripped by the Policy validator. Existing policy names are
    rejected rather than silently overwritten.
    """
    store = request.app.state.policy_store
    body_bytes = await request.body()
    if not body_bytes:
        raise ApiError("Empty body", status_code=400)
    try:
        data = tomllib.loads(body_bytes.decode("utf-8"))
    except UnicodeDecodeError:
        raise ApiError("TOML must be valid UTF-8", status_code=400) from None
    except tomllib.TOMLDecodeError as e:
        raise ApiError(f"Invalid TOML: {e}", status_code=400) from None

    entries_raw = data.get("policy")
    entries: list[dict] = (
        entries_raw if isinstance(entries_raw, list) else [data]  # single-policy form
    )

    created: list[str] = []
    errors: list[dict] = []
    for entry in entries:
        if not isinstance(entry, dict):
            errors.append({"name": None, "error": "entry is not a table"})
            continue
        name = entry.get("name")
        try:
            policy = Policy(**entry)
        except PydanticValidationError as e:
            first = e.errors()[0]
            errors.append({"name": name, "error": first["msg"]})
            continue
        if store.get(policy.name) is not None:
            errors.append({"name": policy.name, "error": "already exists"})
            continue
        store.put(policy)
        created.append(policy.name)
    return {"created": created, "errors": errors}


@router.get("/{name}")
def get_policy(name: str, request: Request) -> dict:
    store = request.app.state.policy_store
    p = store.get(name)
    if p is None:
        raise ApiError("Policy not found", status_code=404)
    return _summary(p, request)


@router.put("/{name}")
def put_policy(name: str, body: dict, request: Request) -> dict:
    if body.get("name") != name:
        raise ValidationError("name in URL must match body.name", field="name")
    try:
        policy = Policy(**body)
    except PydanticValidationError as e:
        first = e.errors()[0]
        field = ".".join(str(x) for x in first["loc"])
        raise ValidationError(first["msg"], field=field) from None
    request.app.state.policy_store.put(policy)
    return _summary(policy, request)


@router.delete("/{name}")
def delete_policy(name: str, request: Request) -> dict:
    ok = request.app.state.policy_store.delete(name)
    if not ok:
        raise ApiError("Policy not found", status_code=404)
    request.app.state.secret_store.delete(name)
    return {"ok": True}


@router.post("/{name}/password", status_code=204)
def set_password(name: str, body: PasswordBody, request: Request) -> Response:
    if request.app.state.policy_store.get(name) is None:
        raise ApiError("Policy not found", status_code=404)
    request.app.state.secret_store.set(name, body.password)
    return Response(status_code=204)


@router.delete("/{name}/password", status_code=204)
def delete_password(name: str, request: Request) -> Response:
    request.app.state.secret_store.delete(name)
    return Response(status_code=204)


@router.post("/{name}/libraries/discover")
async def discover_libraries(name: str, request: Request) -> dict:
    store = request.app.state.policy_store
    policy = store.get(name)
    if policy is None:
        raise ApiError("Policy not found", status_code=404)
    password = request.app.state.secret_store.get(name)
    if password is None:
        raise ApiError("Set a password for this policy first", status_code=400, field="password")
    runner = request.app.state.runner
    try:
        names = await runner.discover_libraries(policy, password=password)
    except RuntimeError as e:
        raise ApiError(str(e), status_code=500) from None
    return {"libraries": names}
