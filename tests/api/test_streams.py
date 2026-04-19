from fastapi.testclient import TestClient

from .conftest import parse_sse, wait_until_idle


def test_run_events_stream(client: TestClient) -> None:
    rid = client.post("/policies/p/runs").json()["run_id"]
    wait_until_idle(client)
    r = client.get(f"/runs/{rid}/events")
    assert r.status_code == 200
    events = parse_sse(r.text)
    kinds = [e["event"] for e in events if "event" in e]
    assert "log" in kinds
    assert "status" in kinds
