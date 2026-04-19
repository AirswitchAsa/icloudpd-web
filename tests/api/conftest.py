from __future__ import annotations

import sys
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


FAKE_BIN = Path(__file__).resolve().parent.parent / "fixtures" / "fake_icloudpd.py"


def fake_argv(cfg_path: Path) -> list[str]:
    return [sys.executable, str(FAKE_BIN), "--config-file", str(cfg_path)]


def make_policy_body(
    name: str = "p",
    *,
    cron: str = "0 * * * *",
    enabled: bool = True,
    aws: dict | None = None,
    notifications: dict | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "username": "u@icloud.com",
        "directory": f"/tmp/{name}",
        "cron": cron,
        "enabled": enabled,
        "timezone": None,
        "icloudpd": {},
        "notifications": notifications
        or {"on_start": False, "on_success": True, "on_failure": True},
        "aws": aws,
    }


@pytest.fixture
def app_factory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Callable[..., FastAPI]:
    """Build a fresh FastAPI app; caller may override argv / auth.

    Defaults the fake to success mode with a tiny total so happy-path tests finish fast.
    Tests that need other modes override FAKE_ICLOUDPD_MODE via monkeypatch before use.
    """
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "2")
    monkeypatch.setenv("FAKE_ICLOUDPD_SLEEP", "0.005")

    def build(
        *,
        password: str | None = "pw",
        icloudpd_argv: Callable[[Path], list[str]] = fake_argv,
    ) -> FastAPI:
        auth = Authenticator(
            password_hash=Authenticator.hash(password) if password else None,
        )
        return create_app(
            data_dir=tmp_path,
            authenticator=auth,
            session_secret="s" * 32,
            icloudpd_argv=icloudpd_argv,
        )

    return build


@pytest.fixture
def client(app_factory: Callable[..., FastAPI]) -> Iterator[TestClient]:
    app = app_factory()
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put("/policies/p", json=make_policy_body("p"))
        yield c


def parse_sse(text: str) -> list[dict[str, str]]:
    """Parse an SSE response body into a list of {id?, event, data} dicts."""
    events: list[dict[str, str]] = []
    cur: dict[str, str] = {}
    for line in text.splitlines():
        if not line:
            if cur:
                events.append(cur)
                cur = {}
            continue
        key, _, value = line.partition(": ")
        cur[key] = value
    if cur:
        events.append(cur)
    return events


def wait_until_idle(client: TestClient, name: str = "p", *, attempts: int = 100) -> None:
    """Poll until the policy is no longer running, or raise after `attempts`."""
    for _ in range(attempts):
        body = client.get(f"/policies/{name}").json()
        if not body.get("is_running"):
            return
        time.sleep(0.05)
    raise AssertionError(f"policy {name} still running after {attempts} polls")
