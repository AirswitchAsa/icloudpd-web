from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError, ValidationError
from icloudpd_web.store.models import Policy


router = APIRouter(
    prefix="/policies",
    tags=["policies"],
    dependencies=[Depends(require_auth)],
)


class PasswordBody(BaseModel):
    password: str


def _summary(p: Policy, scheduler: object, runner: object) -> dict:
    data = p.model_dump(mode="json")
    if p.enabled:
        data["next_run_at"] = scheduler.next_run_at(p, after=datetime.now(UTC)).isoformat()
    else:
        data["next_run_at"] = None
    data["is_running"] = runner.is_running(p.name)
    return data


@router.get("")
def list_policies(request: Request) -> list[dict]:
    store = request.app.state.policy_store
    scheduler = request.app.state.scheduler
    runner = request.app.state.runner
    return [_summary(p, scheduler, runner) for p in store.all()]


@router.get("/{name}")
def get_policy(name: str, request: Request) -> dict:
    store = request.app.state.policy_store
    p = store.get(name)
    if p is None:
        raise ApiError("Policy not found", status_code=404)
    return _summary(p, request.app.state.scheduler, request.app.state.runner)


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
    return _summary(policy, request.app.state.scheduler, request.app.state.runner)


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
