"""Integration test: end-to-end MFA flow through the API."""

from __future__ import annotations

import time
from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from .conftest import make_policy_body, wait_until_idle


def _poll_mfa_awaiting(client: TestClient, name: str = "p", *, attempts: int = 100) -> None:
    """Poll until MFA status reports awaiting=true, or raise after `attempts`."""
    for _ in range(attempts):
        r = client.get(f"/policies/{name}/mfa/status")
        if r.status_code == 200 and r.json().get("awaiting"):
            return
        time.sleep(0.05)
    raise AssertionError(f"MFA for policy {name} never entered awaiting state")


def test_mfa_workflow_end_to_end(
    app_factory: Callable[..., FastAPI],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Full MFA flow: run starts, blocks on MFA, code is submitted, run succeeds."""
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "mfa")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")

    app = app_factory()
    with TestClient(app) as client:
        client.post("/auth/login", json={"password": "pw"})
        client.put("/policies/p", json=make_policy_body("p"))

        # Start the run.
        start = client.post("/policies/p/runs")
        assert start.status_code == 200
        run_id = start.json()["run_id"]

        # Wait until the run is awaiting MFA.
        _poll_mfa_awaiting(client, "p")

        # Verify the status endpoint reports awaiting=true.
        status = client.get("/policies/p/mfa/status")
        assert status.json()["awaiting"] is True

        # Submit the MFA code.
        r = client.post("/policies/p/mfa", json={"code": "123456"})
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # Wait for the run to complete.
        wait_until_idle(client)

        # Verify the run succeeded.
        runs = client.get("/policies/p/runs").json()
        mine = next((x for x in runs if x["run_id"] == run_id), None)
        assert mine is not None, f"run {run_id} not found in history"
        assert mine["status"] == "success", f"Expected success, got {mine['status']}"

        # MFA registry should be cleaned up after run completes.
        post_status = client.get("/policies/p/mfa/status")
        assert post_status.json()["awaiting"] is False
