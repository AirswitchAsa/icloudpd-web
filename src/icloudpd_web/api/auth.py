from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from icloudpd_web.auth import Authenticator
from icloudpd_web.errors import ApiError


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str


@router.get("/status")
def status(request: Request) -> dict[str, bool]:
    a: Authenticator = request.app.state.authenticator
    if not a.auth_required:
        return {"authenticated": True, "auth_required": False}
    return {
        "authenticated": bool(request.session.get("authed")),
        "auth_required": True,
    }


@router.post("/login")
def login(body: LoginBody, request: Request) -> dict[str, bool]:
    a: Authenticator = request.app.state.authenticator
    if not a.auth_required:
        raise ApiError("Authentication is disabled on this server", status_code=400)
    if not a.verify(body.password):
        raise ApiError("Invalid password", status_code=401)
    request.session["authed"] = True
    return {"ok": True}


@router.post("/logout")
def logout(request: Request) -> dict:  # type: ignore[type-arg]
    request.session.clear()
    return {"ok": True}
