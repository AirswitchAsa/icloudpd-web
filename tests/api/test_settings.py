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


def test_get_defaults(client: TestClient) -> None:
    r = client.get("/settings")
    assert r.status_code == 200
    body = r.json()
    assert body["apprise"]["urls"] == []
    assert body["retention_runs"] == 10


def test_put_roundtrip(client: TestClient) -> None:
    body = {
        "apprise": {
            "urls": ["mailto://x"],
            "on_start": False,
            "on_success": True,
            "on_failure": True,
        },
        "retention_runs": 5,
    }
    r = client.put("/settings", json=body)
    assert r.status_code == 200
    assert client.get("/settings").json()["retention_runs"] == 5
