from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError


router = APIRouter(
    prefix="/policies",
    tags=["mfa"],
    dependencies=[Depends(require_auth)],
)


class CodeBody(BaseModel):
    code: str


@router.post("/{name}/mfa")
def mfa_provide(name: str, body: CodeBody, request: Request) -> dict:
    reg = request.app.state.mfa_registry
    try:
        reg.provide(name, body.code)
    except KeyError:
        raise ApiError("No MFA pending for this policy", status_code=404) from None
    return {"ok": True}
