from __future__ import annotations

import re
from collections.abc import Callable

from fastapi import FastAPI
from fastapi.testclient import TestClient

from .conftest import make_policy_body


# error_id format when present: "srv-" or "run-" followed by 8 hex chars.
# (from errors.new_error_id which uses secrets.token_hex(4) = 8 hex chars)
SRV_RE = re.compile(r"^srv-[0-9a-f]{8}$")
RUN_RE = re.compile(r"^run-[0-9a-f]{8}$")


def _assert_error_shape(body: dict) -> None:
    """Assert the body has the standard error envelope shape.

    error_id may be None for ApiError responses where no ID was assigned,
    or a properly-prefixed string (srv-xxx / run-xxx) for 500s and run errors.
    """
    assert "error" in body, body
    assert isinstance(body["error"], str), body
    assert "error_id" in body, body
    eid = body["error_id"]
    # error_id is None for most ApiError raises; only unhandled exceptions assign an ID.
    assert eid is None or SRV_RE.match(eid) or RUN_RE.match(eid), f"bad error_id: {eid!r}"
    if "field" in body and body["field"] is not None:
        assert isinstance(body["field"], str)


def test_errors_unauthenticated_shape(app_factory: Callable[..., FastAPI]) -> None:
    app = app_factory()
    with TestClient(app) as c:
        r = c.get("/policies")
        assert r.status_code == 401
        _assert_error_shape(r.json())


def test_errors_missing_policy(client: TestClient) -> None:
    r = client.get("/policies/does-not-exist")
    assert r.status_code == 404
    _assert_error_shape(r.json())


def test_errors_missing_run_log(client: TestClient) -> None:
    r = client.get("/runs/does-not-exist/log")
    assert r.status_code in (404, 422)
    _assert_error_shape(r.json())


def test_errors_validation_field_populated(client: TestClient) -> None:
    bad = make_policy_body("bad")
    bad["cron"] = "not a cron"
    r = client.put("/policies/bad", json=bad)
    assert r.status_code in (400, 422)
    body = r.json()
    _assert_error_shape(body)
    assert body.get("field") is not None


def test_errors_unhandled_exception_has_srv_id() -> None:
    """Unhandled 500 errors must always carry a prefixed error_id."""
    from fastapi import FastAPI

    from icloudpd_web.errors import install_handlers

    app = FastAPI()
    install_handlers(app)

    @app.get("/crash")
    def _crash() -> None:
        raise RuntimeError("kaboom")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/crash")
        assert r.status_code == 500
        body = r.json()
        _assert_error_shape(body)
        eid = body["error_id"]
        assert eid is not None, "500 errors must have a non-None error_id"
        assert SRV_RE.match(eid), f"500 error_id must match srv-xxxxxxxx, got: {eid!r}"
