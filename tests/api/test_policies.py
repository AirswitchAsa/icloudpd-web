from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    return c


def _policy_body(name: str = "a") -> dict:
    return {
        "name": name,
        "username": "u@icloud.com",
        "directory": "/tmp/a",
        "cron": "0 * * * *",
        "enabled": True,
        "icloudpd": {"album": "All Photos"},
        "notifications": {"on_start": False, "on_success": True, "on_failure": True},
        "aws": None,
    }


def test_list_empty(client: TestClient) -> None:
    r = client.get("/policies")
    assert r.status_code == 200
    assert r.json() == []


def test_put_then_get(client: TestClient) -> None:
    r = client.put("/policies/a", json=_policy_body())
    assert r.status_code == 200
    r2 = client.get("/policies/a")
    assert r2.json()["username"] == "u@icloud.com"


def test_put_invalid_cron(client: TestClient) -> None:
    body = _policy_body()
    body["cron"] = "bogus"
    r = client.put("/policies/a", json=body)
    assert r.status_code == 422


def test_put_name_mismatch_rejected(client: TestClient) -> None:
    body = _policy_body(name="a")
    r = client.put("/policies/b", json=body)
    assert r.status_code == 422


def test_delete(client: TestClient) -> None:
    client.put("/policies/a", json=_policy_body())
    r = client.delete("/policies/a")
    assert r.status_code == 200
    assert client.get("/policies/a").status_code == 404


def test_set_and_delete_password(client: TestClient) -> None:
    client.put("/policies/a", json=_policy_body())
    r = client.post("/policies/a/password", json={"password": "hunter2"})
    assert r.status_code == 204
    r2 = client.delete("/policies/a/password")
    assert r2.status_code == 204


def test_requires_auth(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    c = TestClient(app)
    r = c.get("/policies")
    assert r.status_code == 401
