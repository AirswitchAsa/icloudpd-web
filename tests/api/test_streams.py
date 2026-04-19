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
    with TestClient(app) as c:
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
        yield c


def _parse_sse(text: str) -> list[dict]:
    events = []
    cur: dict = {}
    for line in text.splitlines():
        if not line:
            if cur:
                events.append(cur)
                cur = {}
            continue
        k, _, v = line.partition(": ")
        cur[k] = v
    if cur:
        events.append(cur)
    return events


def test_run_events_stream(client: TestClient) -> None:
    rid = client.post("/policies/p/runs").json()["run_id"]
    for _ in range(100):
        if client.get("/policies/p").json()["is_running"] is False:
            break
        time.sleep(0.05)
    r = client.get(f"/runs/{rid}/events")
    assert r.status_code == 200
    events = _parse_sse(r.text)
    kinds = [e["event"] for e in events if "event" in e]
    assert "log" in kinds
    assert "status" in kinds
