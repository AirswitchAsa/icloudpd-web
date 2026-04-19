import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "fake_icloudpd.py"


def _argv(cfg_path: Path) -> list[str]:
    return [sys.executable, str(FIXTURE), "--config-file", str(cfg_path)]


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "2")
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
        icloudpd_argv=_argv,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    c.put(
        "/policies/p",
        json={
            "name": "p",
            "username": "u@icloud.com",
            "directory": "/tmp/p",
            "cron": "0 * * * *",
            "enabled": True,
            "icloudpd": {},
            "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": None,
        },
    )
    return c


def test_start_run(client: TestClient) -> None:
    r = client.post("/policies/p/runs")
    assert r.status_code == 200
    body = r.json()
    assert body["run_id"].startswith("p-")


def test_conflict_when_already_running(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")
    r = client.post("/policies/p/runs")
    assert r.status_code == 200
    r2 = client.post("/policies/p/runs")
    assert r2.status_code == 409


def test_list_runs_shows_completed(client: TestClient) -> None:
    r = client.post("/policies/p/runs")
    rid = r.json()["run_id"]
    for _ in range(50):
        if client.get("/policies/p").json()["is_running"] is False:
            break
        time.sleep(0.05)
    r2 = client.get("/policies/p/runs")
    assert r2.status_code == 200
    assert any(x["run_id"] == rid for x in r2.json())
