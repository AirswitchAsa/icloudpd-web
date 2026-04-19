from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import FastAPI, Request
from starlette.middleware.sessions import SessionMiddleware

from icloudpd_web.errors import ApiError


class Authenticator:
    def __init__(self, password_hash: str) -> None:
        self._hash = password_hash

    @staticmethod
    def hash(password: str) -> str:
        salt = secrets.token_hex(16)
        h = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return f"scrypt${salt}${h}"

    def verify(self, password: str) -> bool:
        try:
            scheme, salt, h = self._hash.split("$")
            assert scheme == "scrypt"
        except Exception:
            return False
        got = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(got, h)


def install_session_middleware(app: FastAPI, *, secret: str) -> None:
    app.add_middleware(
        SessionMiddleware,
        secret_key=secret,
        session_cookie="icloudpd_web",
        max_age=60 * 60 * 24 * 28,  # 4 weeks
        same_site="lax",
        https_only=False,
    )


def require_auth(request: Request) -> bool:
    if not request.session.get("authed"):
        raise ApiError("Not authenticated", status_code=401)
    return True
