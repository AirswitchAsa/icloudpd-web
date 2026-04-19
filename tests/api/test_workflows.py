from __future__ import annotations

import json
import time
from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from .conftest import parse_sse, wait_until_idle


def test_wf1_happy_path(client: TestClient) -> None:
    # Start a run.
    start = client.post("/policies/p/runs")
    assert start.status_code == 200
    run_id = start.json()["run_id"]

    # Wait for completion.
    wait_until_idle(client)

    # History lists this run as successful.
    runs = client.get("/policies/p/runs").json()
    mine = next(r for r in runs if r["run_id"] == run_id)
    assert mine["status"] == "success"

    # Policy summary surfaces last_run with status.
    summary = client.get("/policies/p").json()
    assert summary["last_run"]["run_id"] == run_id
    assert summary["last_run"]["status"] == "success"

    # Persisted log contains the fake binary's progress lines.
    log = client.get(f"/runs/{run_id}/log")
    assert log.status_code == 200
    assert "Downloading 1 of 2" in log.text
    assert "Downloading 2 of 2" in log.text

    # SSE stream (after completion) replays recorded events ending with a status.
    sse = client.get(f"/runs/{run_id}/events")
    assert sse.status_code == 200
    events = parse_sse(sse.text)
    kinds = [e["event"] for e in events if "event" in e]
    assert "log" in kinds
    assert kinds[-1] == "status"
    final = json.loads(events[-1]["data"])
    assert final["status"] == "success"


def test_wf3_failure_path(
    app_factory: Callable[..., FastAPI], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "fail")
    app = app_factory()
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
                "timezone": None,
                "icloudpd": {},
                "notifications": {"on_start": False, "on_success": True, "on_failure": True},
                "aws": None,
            },
        )
        run_id = c.post("/policies/p/runs").json()["run_id"]

        # Wait for completion
        for _ in range(100):
            runs = c.get("/policies/p/runs").json()
            mine = next((r for r in runs if r["run_id"] == run_id), None)
            if mine and mine.get("status") in ("success", "failed"):
                break
            time.sleep(0.05)

        assert mine is not None
        assert mine.get("status") == "failed"
        log = c.get(f"/runs/{run_id}/log").text
        assert "something went wrong" in log
