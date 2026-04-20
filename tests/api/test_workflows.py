from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from icloudpd_web.integrations.aws_sync import AwsSyncResult

from .conftest import parse_sse, set_policy_password, wait_until_idle


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

    # Once the run has terminated, active_run_id must be cleared so the
    # frontend stops subscribing to a dead stream.
    assert summary["active_run_id"] is None
    assert summary["is_running"] is False

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
                "aws": None,
            },
        )
        set_policy_password(c)
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


def test_wf4_interrupt_midrun(
    app_factory: Callable[..., FastAPI], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")
    monkeypatch.setenv("FAKE_ICLOUDPD_SLEEP", "0.2")
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
                "aws": None,
            },
        )
        set_policy_password(c)
        run_id = c.post("/policies/p/runs").json()["run_id"]

        # Give ~400ms to start and emit at least one progress line
        time.sleep(0.4)

        r = c.delete(f"/runs/{run_id}")
        assert r.status_code in (200, 204)

        # Wait for runner to observe termination
        for _ in range(100):
            if not c.get("/policies/p").json()["is_running"]:
                break
            time.sleep(0.05)

        runs = c.get("/policies/p/runs").json()
        mine = next(r for r in runs if r["run_id"] == run_id)
        assert mine.get("status") in ("stopped", "failed")


def test_wf5_sse_resume(
    app_factory: Callable[..., FastAPI], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "5")
    monkeypatch.setenv("FAKE_ICLOUDPD_SLEEP", "0.02")
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
                "aws": None,
            },
        )
        set_policy_password(c)
        run_id = c.post("/policies/p/runs").json()["run_id"]
        wait_until_idle(c)

        all_events = parse_sse(c.get(f"/runs/{run_id}/events").text)
        ids = [int(e["id"]) for e in all_events if "id" in e]
        assert len(ids) >= 3, ids
        cut = ids[len(ids) // 2]

        resumed = parse_sse(
            c.get(
                f"/runs/{run_id}/events",
                headers={"Last-Event-ID": str(cut)},
            ).text
        )
        resumed_ids = [int(e["id"]) for e in resumed if "id" in e]
        assert all(i > cut for i in resumed_ids), (cut, resumed_ids)
        assert set(ids) == {i for i in ids if i <= cut} | set(resumed_ids)


def test_wf6a_auth_required(app_factory: Callable[..., FastAPI]) -> None:
    app = app_factory()  # default password "pw"
    with TestClient(app) as c:
        r = c.get("/policies")
        assert r.status_code == 401
        body = r.json()
        assert "error" in body
        assert "error_id" in body


def test_wf6b_passwordless_mode(app_factory: Callable[..., FastAPI]) -> None:
    app = app_factory(password=None)
    with TestClient(app) as c:
        status = c.get("/auth/status").json()
        assert status["authenticated"] is True
        assert status["auth_required"] is False
        r = c.get("/policies")
        assert r.status_code == 200


def test_wf7_scheduler_cron_tick(
    app_factory: Callable[..., FastAPI], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")
    app = app_factory()
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put(
            "/policies/p",
            json={
                "name": "p",
                "username": "u@icloud.com",
                "directory": "/tmp/p",
                "cron": "* * * * *",
                "enabled": True,
                "timezone": None,
                "icloudpd": {},
                "aws": None,
            },
        )
        set_policy_password(c)

        scheduler = app.state.scheduler
        scheduler.tick(datetime.now(UTC))

        # TestClient owns the app's event loop via an anyio blocking portal.
        # Use c.portal.call() to run _drain_pending on the *same* loop so that
        # runner tasks (start, drain, on_complete) all share a single event loop.
        c.portal.call(scheduler._drain_pending)

        wait_until_idle(c)
        runs = c.get("/policies/p/runs").json()
        assert len(runs) == 1
        assert runs[0]["status"] == "success"

        # Second tick in same minute must not re-enqueue
        scheduler.tick(datetime.now(UTC))
        assert scheduler._pending == []


def test_wf8_apprise_emitted_on_completion(
    app_factory: Callable[..., FastAPI], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")
    app = app_factory()

    calls: list[tuple[str, str, str]] = []

    def spy(event: str, *, policy_name: str, summary: str) -> None:
        calls.append((event, policy_name, summary))

    app.state.notifier.emit = spy  # type: ignore[method-assign]

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
                "aws": None,
            },
        )
        set_policy_password(c)
        c.post("/policies/p/runs")
        wait_until_idle(c)

    assert any(ev == "success" and name == "p" for ev, name, _ in calls), calls


def test_wf9_aws_sync_invoked_on_success(
    app_factory: Callable[..., FastAPI], monkeypatch: pytest.MonkeyPatch
) -> None:
    from pathlib import Path

    from icloudpd_web.store.models import AwsConfig

    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")
    app = app_factory()

    invocations: list[tuple[AwsConfig, Path]] = []

    async def spy(cfg: AwsConfig, *, source: Path) -> AwsSyncResult:
        invocations.append((cfg, source))
        return AwsSyncResult(skipped=False, exit_code=0, output="ok")

    app.state.aws_sync.run = spy  # type: ignore[method-assign]

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
                "aws": {
                    "enabled": True,
                    "bucket": "b",
                    "prefix": "x",
                    "region": "us-east-1",
                },
            },
        )
        set_policy_password(c)
        c.post("/policies/p/runs")
        wait_until_idle(c)
        time.sleep(0.2)  # Allow the background AWS task to run

    assert len(invocations) == 1
    cfg, src = invocations[0]
    assert cfg.bucket == "b"
    assert str(src) == "/tmp/p"


def test_wf10_filter_lines_in_log(
    app_factory: Callable[..., FastAPI],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: pytest.TempPathFactory,
) -> None:
    """WF-10: Policy with filters → filter keep/delete lines appear in run log."""
    import sys
    from pathlib import Path

    target_dir = Path(str(tmp_path)) / "photos"
    target_dir.mkdir()

    fake_bin = Path(__file__).resolve().parent.parent / "fixtures" / "fake_icloudpd.py"

    def fake_argv(argv_tail: list[str]) -> list[str]:
        return [sys.executable, str(fake_bin), *argv_tail]

    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "filter_demo")
    monkeypatch.setenv("FAKE_ICLOUDPD_DIR", str(target_dir))

    app = app_factory(icloudpd_argv=fake_argv)
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put(
            "/policies/p",
            json={
                "name": "p",
                "username": "u@icloud.com",
                "directory": str(target_dir),
                "cron": "0 * * * *",
                "enabled": True,
                "timezone": None,
                "icloudpd": {},
                "aws": None,
                "filters": {
                    "file_suffixes": [".heic"],
                    "match_patterns": [],
                    "device_makes": ["Apple"],
                    "device_models": [],
                },
            },
        )
        set_policy_password(c)
        run_id = c.post("/policies/p/runs").json()["run_id"]
        wait_until_idle(c)

        log = c.get(f"/runs/{run_id}/log").text
        assert "Filter: kept" in log, f"Expected 'Filter: kept' in log, got:\n{log}"
        assert "Filter: deleted" in log, f"Expected 'Filter: deleted' in log, got:\n{log}"
        assert "Filter summary:" in log, f"Expected 'Filter summary:' in log, got:\n{log}"

    # Confirm the apple heic is kept and others deleted.
    assert (target_dir / "img_apple.heic").exists()
    assert not (target_dir / "img_samsung.jpg").exists()
    assert not (target_dir / "other.png").exists()
