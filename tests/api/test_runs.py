import pytest
from fastapi.testclient import TestClient

from .conftest import wait_until_idle


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
    wait_until_idle(client)
    r2 = client.get("/policies/p/runs")
    assert r2.status_code == 200
    assert any(x["run_id"] == rid for x in r2.json())
