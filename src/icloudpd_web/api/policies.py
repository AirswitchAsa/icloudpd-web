from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError, ValidationError
from icloudpd_web.runner.runner import Runner
from icloudpd_web.scheduler.scheduler import Scheduler
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


def _summary(p: Policy, scheduler: Scheduler, runner: Runner, data_dir: Path) -> dict:
    data = p.model_dump(mode="json")
    if p.enabled:
        data["next_run_at"] = scheduler.next_run_at(p, after=datetime.now(UTC)).isoformat()
    else:
        data["next_run_at"] = None
    data["is_running"] = runner.is_running(p.name)
    last_run = _load_last_run(p.name, data_dir)
    data["last_run"] = last_run.model_dump(mode="json") if last_run is not None else None
    return data


@router.get("")
def list_policies(request: Request) -> list[dict]:
    store = request.app.state.policy_store
    scheduler = request.app.state.scheduler
    runner = request.app.state.runner
    data_dir: Path = request.app.state.data_dir
    return [_summary(p, scheduler, runner, data_dir) for p in store.all()]


@router.get("/{name}")
def get_policy(name: str, request: Request) -> dict:
    store = request.app.state.policy_store
    p = store.get(name)
    if p is None:
        raise ApiError("Policy not found", status_code=404)
    return _summary(
        p, request.app.state.scheduler, request.app.state.runner, request.app.state.data_dir
    )


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
    return _summary(
        policy, request.app.state.scheduler, request.app.state.runner, request.app.state.data_dir
    )


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
