import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


FIXTURE = Path(__file__).resolve().parent / "fixtures" / "fake_icloudpd.py"


def _argv(argv_tail: list[str]) -> list[str]:
    return [sys.executable, str(FIXTURE), *argv_tail]


@pytest.mark.smoke
def test_end_to_end(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

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
        # Set a policy password; required since icloudpd reads it via stdin.
        c.post("/policies/p/password", json={"password": "testpw"})
        start = c.post("/policies/p/runs")
        assert start.status_code == 200, (start.status_code, start.text)
        rid = start.json()["run_id"]
        for _ in range(100):
            if c.get("/policies/p").json()["is_running"] is False:
                break
            time.sleep(0.05)
        runs = c.get("/policies/p/runs").json()
        assert any(r["run_id"] == rid for r in runs)
        log = c.get(f"/runs/{rid}/log").text
        assert "Downloading 1 of 3" in log
