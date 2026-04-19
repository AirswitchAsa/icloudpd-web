"""Integration tests for run history with status sidecar."""

from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import wait_until_idle


def test_list_runs_has_status(client: TestClient) -> None:
    r = client.post("/policies/p/runs")
    assert r.status_code == 200
    rid = r.json()["run_id"]
    wait_until_idle(client)

    r2 = client.get("/policies/p/runs")
    assert r2.status_code == 200
    runs = r2.json()
    entry = next((x for x in runs if x["run_id"] == rid), None)
    assert entry is not None, f"run {rid} not found in history"
    assert entry["status"] == "success"
    assert entry["started_at"] is not None
    assert entry["ended_at"] is not None


def test_policy_last_run_populated(client: TestClient) -> None:
    r = client.post("/policies/p/runs")
    assert r.status_code == 200
    rid = r.json()["run_id"]
    wait_until_idle(client)

    policy = client.get("/policies/p").json()
    last_run = policy.get("last_run")
    assert last_run is not None, "policy.last_run should be populated after a run"
    assert last_run["status"] == "success"
    assert last_run["run_id"] == rid
