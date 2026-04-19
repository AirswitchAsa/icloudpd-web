import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from icloudpd_web.errors import (
    ApiError,
    ValidationError,
    install_handlers,
    new_error_id,
)


def test_new_error_id_prefix() -> None:
    eid = new_error_id()
    assert eid.startswith("srv-")
    assert len(eid) > 4


def test_api_error_response_shape() -> None:
    app = FastAPI()
    install_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise ApiError("nope", status_code=400, error_id=None)

    r = TestClient(app).get("/boom")
    assert r.status_code == 400
    assert r.json() == {"error": "nope", "error_id": None, "field": None}


def test_validation_error_has_field() -> None:
    app = FastAPI()
    install_handlers(app)

    @app.get("/v")
    def v() -> None:
        raise ValidationError("bad cron", field="cron")

    r = TestClient(app).get("/v")
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "bad cron"
    assert body["field"] == "cron"


def test_unhandled_exception_gets_srv_error_id(caplog: pytest.LogCaptureFixture) -> None:
    app = FastAPI()
    install_handlers(app)

    @app.get("/crash")
    def crash() -> None:
        raise RuntimeError("kaboom")

    r = TestClient(app, raise_server_exceptions=False).get("/crash")
    assert r.status_code == 500
    body = r.json()
    assert body["error_id"].startswith("srv-")
    assert body["error"].startswith("Server error")
