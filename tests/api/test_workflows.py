from __future__ import annotations

import json

from fastapi.testclient import TestClient

from .conftest import parse_sse, wait_until_idle


def test_wf1_happy_path(client: TestClient) -> None:
    # Start a run.
    start = client.post("/policies/p/runs")
    assert start.status_code == 200
    run_id = start.json()["run_id"]

    # Wait for completion.
    wait_until_idle(client)

    # History lists this run.
    runs = client.get("/policies/p/runs").json()
    mine = next(r for r in runs if r["run_id"] == run_id)
    assert mine["run_id"] == run_id

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
