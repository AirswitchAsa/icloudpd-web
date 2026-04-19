from __future__ import annotations

from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from icloudpd_web.auth import Authenticator, install_session_middleware, require_auth
from icloudpd_web.errors import install_handlers


def test_verify_password_ok() -> None:
    a = Authenticator(password_hash=Authenticator.hash("secret"))
    assert a.verify("secret") is True
    assert a.verify("other") is False


def test_authenticator_none_hash_disables_auth() -> None:
    a = Authenticator(password_hash=None)
    assert a.auth_required is False
    assert a.verify("anything") is True


def test_authenticator_empty_hash_treated_as_none() -> None:
    a = Authenticator(password_hash="")
    assert a.auth_required is False
    b = Authenticator(password_hash="   ")
    assert b.auth_required is False


def _make_app(authenticator: Authenticator | None = None) -> FastAPI:
    app = FastAPI()
    install_handlers(app)
    install_session_middleware(app, secret="test-session-key")
    app.state.authenticator = authenticator or Authenticator(
        password_hash=Authenticator.hash("pw"),
    )

    @app.post("/fake-login")
    def fake_login(request: Request) -> dict:
        request.session["authed"] = True
        return {"ok": True}

    @app.get("/secret")
    def secret(_: bool = Depends(require_auth)) -> dict:
        return {"ok": True}

    return app


def test_require_auth_blocks_unauthed() -> None:
    client = TestClient(_make_app())
    r = client.get("/secret")
    assert r.status_code == 401


def test_login_then_access() -> None:
    client = TestClient(_make_app())
    assert client.post("/fake-login").status_code == 200
    assert client.get("/secret").status_code == 200


def test_verify_malformed_hash_returns_false() -> None:
    """A hash that cannot be split into scheme$salt$h returns False."""
    a = Authenticator(password_hash="not-a-valid-hash")
    assert a.verify("anything") is False


def test_verify_wrong_scheme_returns_false() -> None:
    """A hash with the wrong scheme prefix returns False."""
    a = Authenticator(password_hash="md5$somesalt$somehash")
    assert a.verify("anything") is False
