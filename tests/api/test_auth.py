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
        session_secret="test-secret-very-long",
    )
    return TestClient(app)


def test_status_unauthenticated(client: TestClient) -> None:
    r = client.get("/auth/status")
    assert r.status_code == 200
    assert r.json() == {"authenticated": False, "auth_required": True}


def test_login_wrong_password(client: TestClient) -> None:
    r = client.post("/auth/login", json={"password": "nope"})
    assert r.status_code == 401


def test_login_ok_then_status(client: TestClient) -> None:
    assert client.post("/auth/login", json={"password": "pw"}).status_code == 200
    assert client.get("/auth/status").json() == {"authenticated": True, "auth_required": True}


def test_logout(client: TestClient) -> None:
    client.post("/auth/login", json={"password": "pw"})
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/status").json() == {"authenticated": False, "auth_required": True}


def test_status_passwordless(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
    )
    with TestClient(app) as c:
        r = c.get("/auth/status")
        assert r.json() == {"authenticated": True, "auth_required": False}


def test_status_with_password(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    with TestClient(app) as c:
        r = c.get("/auth/status")
        assert r.json() == {"authenticated": False, "auth_required": True}


def test_login_rejected_in_passwordless(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
    )
    with TestClient(app) as c:
        r = c.post("/auth/login", json={"password": "anything"})
        assert r.status_code == 400
