# icloudpd-web Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hermetic test suite that proves the icloudpd-web wrapper works end-to-end against a fake `icloudpd` binary, with coverage gates that prevent regression.

**Architecture:** Five layers — backend unit (existing, expand), backend integration via `TestClient` driving the real FastAPI app + fake binary, thin patched boundaries for apprise/S3, two tiny frontend unit files, one manual upstream-smoke script. Every test is hermetic: no network, no real Apple credentials, no real `icloudpd`.

**Tech Stack:** pytest, pytest-asyncio, pytest-cov, FastAPI `TestClient` (starlette), httpx, vitest, `@vitest/coverage-v8`, existing `tests/fixtures/fake_icloudpd.py`.

**Spec:** `docs/superpowers/specs/2026-04-19-icloudpd-web-testing-design.md`

---

## Shared context (read once)

- App factory: `create_app(*, data_dir, authenticator, session_secret, icloudpd_argv, static_dir=None)` in `src/icloudpd_web/app.py`. Attaches `policy_store`, `secret_store`, `settings_store`, `notifier`, `mfa_registry`, `runner`, `scheduler` to `app.state`.
- Runner: `src/icloudpd_web/runner/runner.py` — `Runner(*, runs_base, icloudpd_argv, retention, on_run_event)`. `icloudpd_argv` is `Callable[[Path], list[str]]` receiving the cfg file path.
- Scheduler: `src/icloudpd_web/scheduler/scheduler.py:46` — `tick(now: datetime)` is synchronous and queues matches to `self._pending`; `_drain_pending()` is the async drain.
- Routes we exercise:
  - `POST /auth/login {"password": "..."}`
  - `GET  /auth/status`
  - `POST /auth/logout`
  - `PUT  /policies/{name}` (body = full `PolicyView` JSON)
  - `GET  /policies`
  - `GET  /policies/{name}`
  - `DELETE /policies/{name}`
  - `POST /policies/{name}/password {"password": "..."}`
  - `DELETE /policies/{name}/password`
  - `POST /policies/{name}/runs` → `{run_id}`
  - `GET  /policies/{name}/runs`
  - `GET  /runs/{run_id}/log` (plain text)
  - `DELETE /runs/{run_id}`
  - `GET  /runs/{run_id}/events` (SSE)
  - `GET  /policies/stream` (SSE)
  - `POST /policies/{name}/mfa {"code": "..."}`
  - `GET  /policies/{name}/mfa/status`
  - `GET  /settings` / `PUT /settings`
- Fake binary: `tests/fixtures/fake_icloudpd.py`. Modes via env vars — `FAKE_ICLOUDPD_MODE` ∈ {`success`,`fail`,`slow`,`mfa`}, `FAKE_ICLOUDPD_TOTAL` (int), `FAKE_ICLOUDPD_SLEEP` (float), `FAKE_ICLOUDPD_MFA_CALLBACK` (path whose contents become the provided code).
- SSE parsing helper already exists in `tests/api/test_streams.py:47`; promote to shared.
- Existing integration test entry pattern (reference — do not duplicate): `tests/api/test_streams.py:19-44`.

---

## Task 1: Wire pytest-cov + baseline Make targets

**Why:** Establish coverage measurement before writing more tests. No gates yet — just measurement so later tasks can see progress.

**Files:**
- Modify: `pyproject.toml`
- Modify: `Makefile`

- [ ] **Step 1: Add pytest-cov to dev deps**

Append to the `dev` group in `pyproject.toml` (locate existing `[dependency-groups]` or `[tool.uv]` / `[project.optional-dependencies]`; add to the existing dev group — do not create a new one):

```toml
# under the existing dev dependency group
"pytest-cov>=5.0",
```

Run:

```bash
uv sync --all-groups
```

- [ ] **Step 2: Add coverage config to pyproject.toml**

Append these sections (if `[tool.pytest.ini_options]` already exists, merge `addopts`; do not create a duplicate section):

```toml
[tool.pytest.ini_options]
addopts = "--cov=src/icloudpd_web --cov-report=term-missing --cov-report=xml --cov-branch"

[tool.coverage.run]
branch = true
source = ["src/icloudpd_web"]
omit = ["src/icloudpd_web/web_dist/*"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
]
```

- [ ] **Step 3: Verify tests still pass with coverage active**

Run: `uv run pytest -q`
Expected: `98 passed` (or current baseline) and a final `TOTAL` coverage line is printed. Record the baseline percentage in the commit message.

- [ ] **Step 4: Add Makefile test/coverage targets**

Edit `Makefile`. Keep any existing `test` / `coverage` targets; replace their bodies with these:

```make
.PHONY: test test-backend test-frontend coverage check-upstream

test: test-backend test-frontend

test-backend:
	uv run pytest -q

test-frontend:
	cd web && npm run -s test -- --run

coverage:
	uv run pytest --cov-report=term --cov-report=html:.coverage-html

check-upstream:
	uv run python scripts/check_upstream.py
```

Verify `make test-backend` runs. Frontend target may fail if vitest script isn't `test` — check `web/package.json` and adjust to the actual script name (the existing `web/package.json` `test` script is correct per sub-project 2).

Run: `make test-backend`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml Makefile uv.lock
git commit -m "test: wire pytest-cov and consolidate Make targets"
```

---

## Task 2: Shared API integration conftest

**Why:** `tests/api/test_runs.py` and `tests/api/test_streams.py` duplicate the client fixture. We're adding ~8 more workflow tests — share the fixtures once.

**Files:**
- Create: `tests/api/conftest.py`
- Modify: `tests/api/test_runs.py` (replace local fixture with shared)
- Modify: `tests/api/test_streams.py` (replace local fixture with shared)

- [ ] **Step 1: Write the shared conftest**

Create `tests/api/conftest.py`:

```python
from __future__ import annotations

import sys
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
    import time
    for _ in range(attempts):
        body = client.get(f"/policies/{name}").json()
        if not body.get("is_running"):
            return
        time.sleep(0.05)
    raise AssertionError(f"policy {name} still running after {attempts} polls")
```

- [ ] **Step 2: Replace local fixtures in existing integration tests**

Edit `tests/api/test_runs.py` — delete the module-level `FIXTURE`, `_argv`, and `client` fixture; replace the import block with:

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
```

Delete `test_list_runs_shows_completed`'s inline `time.sleep` loop; replace with `wait_until_idle(client)` imported from conftest:

```python
from .conftest import wait_until_idle
```

Similarly for `tests/api/test_streams.py` — delete local `FIXTURE`, `_argv`, `_parse_sse`, `client`. Import `parse_sse` and `wait_until_idle` from `.conftest`.

- [ ] **Step 3: Run existing tests**

Run: `uv run pytest tests/api -q`
Expected: same count as before, all pass. Parsing and client fixture behavior is unchanged.

- [ ] **Step 4: Commit**

```bash
git add tests/api/
git commit -m "test: extract shared API integration conftest"
```

---

## Task 3: WF-1 Happy path (full lifecycle + SSE content)

**Why:** Prove the end-to-end happy path and establish the pattern the other WF tests will copy.

**Files:**
- Create: `tests/api/test_workflows.py`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_workflows.py`:

```python
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

    # History lists this run as successful.
    runs = client.get("/policies/p/runs").json()
    mine = next(r for r in runs if r["run_id"] == run_id)
    assert mine["status"] == "success"

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
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_workflows.py::test_wf1_happy_path -v`
Expected: PASS (backend already supports this; test is new documentation of the contract). If it FAILS, inspect the emitted assertion; the most likely causes are that `run_id` is returned under a different key or `status` spelling differs — read the actual response body and adjust the test accordingly (the backend shape is authoritative, the spec/test must match).

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py
git commit -m "test: add WF-1 happy path workflow test"
```

---

## Task 4: WF-2 MFA flow

**Files:**
- Modify: `tests/api/test_workflows.py`

- [ ] **Step 1: Add the failing test**

Append to `tests/api/test_workflows.py`:

```python
import time


def test_wf2_mfa_flow(
    app_factory,
    monkeypatch,
    tmp_path,
) -> None:
    # Fake will wait for a file to appear holding the MFA code; the MfaRegistry
    # writes that file when /mfa is POSTed. We point the fake at the registry's
    # callback path by exporting the env var the fake reads.
    cb = tmp_path / "mfa-callback.txt"
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "mfa")
    monkeypatch.setenv("FAKE_ICLOUDPD_MFA_CALLBACK", str(cb))
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")

    app = app_factory()
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put("/policies/p", json={
            "name": "p", "username": "u@icloud.com", "directory": "/tmp/p",
            "cron": "0 * * * *", "enabled": True, "timezone": None,
            "icloudpd": {}, "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": None,
        })
        run_id = c.post("/policies/p/runs").json()["run_id"]

        # Poll until fake is waiting for MFA (callback file does not yet exist).
        for _ in range(100):
            if c.get("/policies/p/mfa/status").json().get("awaiting"):
                break
            time.sleep(0.05)
        else:
            raise AssertionError("fake never reported awaiting MFA")

        # Provide the code — backend writes it to the callback file the fake polls.
        r = c.post("/policies/p/mfa", json={"code": "123456"})
        assert r.status_code == 200

        # Wait for the run to finish.
        for _ in range(200):
            runs = c.get("/policies/p/runs").json()
            mine = next((x for x in runs if x["run_id"] == run_id), None)
            if mine and mine["status"] in ("success", "failed"):
                break
            time.sleep(0.05)
        else:
            raise AssertionError("run did not finish after MFA provided")

        assert mine["status"] == "success"
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_workflows.py::test_wf2_mfa_flow -v`

Expected: **may FAIL** if `MfaRegistry.provide()` doesn't write a file the fake can read. In that case, inspect `src/icloudpd_web/runner/mfa.py` to see how it propagates the code to the subprocess. If it uses a different IPC mechanism (e.g., writing to the run's working directory or via stdin), update either:
  - the test's `FAKE_ICLOUDPD_MFA_CALLBACK` to point at the actual path the registry writes, or
  - the fake binary (`tests/fixtures/fake_icloudpd.py`) to read from wherever the real one does.

Do **not** change backend behavior to match the test; make the test reflect reality.

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py tests/fixtures/fake_icloudpd.py
git commit -m "test: add WF-2 MFA flow workflow test"
```

---

## Task 5: WF-3 Failure path

**Files:**
- Modify: `tests/api/test_workflows.py`

- [ ] **Step 1: Add the failing test**

Append:

```python
def test_wf3_failure_path(app_factory, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "fail")
    app = app_factory()
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put("/policies/p", json={
            "name": "p", "username": "u@icloud.com", "directory": "/tmp/p",
            "cron": "0 * * * *", "enabled": True, "timezone": None,
            "icloudpd": {},
            "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": None,
        })
        run_id = c.post("/policies/p/runs").json()["run_id"]

        # Wait for completion
        for _ in range(100):
            runs = c.get("/policies/p/runs").json()
            mine = next((r for r in runs if r["run_id"] == run_id), None)
            if mine and mine["status"] in ("success", "failed"):
                break
            time.sleep(0.05)

        assert mine["status"] == "failed"
        log = c.get(f"/runs/{run_id}/log").text
        assert "something went wrong" in log
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_workflows.py::test_wf3_failure_path -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py
git commit -m "test: add WF-3 failure workflow test"
```

---

## Task 6: WF-4 Interrupt mid-run

**Files:**
- Modify: `tests/api/test_workflows.py`

- [ ] **Step 1: Add the failing test**

Append:

```python
def test_wf4_interrupt_midrun(app_factory, monkeypatch) -> None:
    # slow mode pauses between each progress line; large total keeps it busy
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")
    monkeypatch.setenv("FAKE_ICLOUDPD_SLEEP", "0.2")
    app = app_factory()
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put("/policies/p", json={
            "name": "p", "username": "u@icloud.com", "directory": "/tmp/p",
            "cron": "0 * * * *", "enabled": True, "timezone": None,
            "icloudpd": {},
            "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": None,
        })
        run_id = c.post("/policies/p/runs").json()["run_id"]

        # Give it ~400 ms to start and emit a line
        time.sleep(0.4)

        # Stop it
        r = c.delete(f"/runs/{run_id}")
        assert r.status_code in (200, 204)

        # Wait for the runner to observe termination
        for _ in range(100):
            if not c.get("/policies/p").json()["is_running"]:
                break
            time.sleep(0.05)

        runs = c.get("/policies/p/runs").json()
        mine = next(r for r in runs if r["run_id"] == run_id)
        # backend terminal statuses for an interrupted run: "failed" or "stopped"
        assert mine["status"] in ("stopped", "failed")
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_workflows.py::test_wf4_interrupt_midrun -v`
Expected: PASS. If the test fails because `status` is neither `stopped` nor `failed`, inspect `Run` in `src/icloudpd_web/runner/run.py` for the actual terminal status written on SIGTERM, and widen the assertion to include it. Record the discovery in the commit message.

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py
git commit -m "test: add WF-4 interrupt mid-run workflow test"
```

---

## Task 7: WF-5 SSE resume via Last-Event-ID

**Files:**
- Modify: `tests/api/test_workflows.py`

- [ ] **Step 1: Add the failing test**

Append:

```python
def test_wf5_sse_resume(app_factory, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "5")
    monkeypatch.setenv("FAKE_ICLOUDPD_SLEEP", "0.02")
    app = app_factory()
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put("/policies/p", json={
            "name": "p", "username": "u@icloud.com", "directory": "/tmp/p",
            "cron": "0 * * * *", "enabled": True, "timezone": None,
            "icloudpd": {},
            "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": None,
        })
        run_id = c.post("/policies/p/runs").json()["run_id"]
        wait_until_idle(c)

        # Full replay
        all_events = parse_sse(c.get(f"/runs/{run_id}/events").text)
        # Find an id partway through
        ids = [int(e["id"]) for e in all_events if "id" in e]
        assert len(ids) >= 3, ids
        cut = ids[len(ids) // 2]

        # Resume from that id; expect only events with id > cut
        resumed = parse_sse(
            c.get(
                f"/runs/{run_id}/events",
                headers={"Last-Event-ID": str(cut)},
            ).text
        )
        resumed_ids = [int(e["id"]) for e in resumed if "id" in e]
        assert all(i > cut for i in resumed_ids), (cut, resumed_ids)
        # The union covers everything
        assert set(ids) == {i for i in ids if i <= cut} | set(resumed_ids)
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_workflows.py::test_wf5_sse_resume -v`
Expected: PASS if `Run.subscribe(since=...)` is correctly implemented. If it FAILS with duplicates, that's a real backend bug in the `since` filter — fix it in `src/icloudpd_web/runner/run.py` before proceeding (the test is the spec). Document the fix in the commit.

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py src/icloudpd_web/runner/run.py
git commit -m "test: add WF-5 SSE resume workflow test"
```

---

## Task 8: WF-6 Auth gate + passwordless mode

**Files:**
- Modify: `tests/api/test_workflows.py`

- [ ] **Step 1: Add the failing tests**

Append:

```python
def test_wf6a_auth_required(app_factory) -> None:
    app = app_factory()  # default password "pw"
    with TestClient(app) as c:
        r = c.get("/policies")
        assert r.status_code == 401
        body = r.json()
        assert "error" in body
        assert "error_id" in body


def test_wf6b_passwordless_mode(app_factory) -> None:
    app = app_factory(password=None)
    with TestClient(app) as c:
        status = c.get("/auth/status").json()
        assert status["authenticated"] is True
        assert status["auth_required"] is False
        # Protected routes work without login
        r = c.get("/policies")
        assert r.status_code == 200
```

- [ ] **Step 2: Run them**

Run: `uv run pytest tests/api/test_workflows.py::test_wf6a_auth_required tests/api/test_workflows.py::test_wf6b_passwordless_mode -v`
Expected: PASS. If WF-6b fails because passwordless status reports `authenticated: false`, read `src/icloudpd_web/api/auth.py` and adjust the assertion to match the contract (the sub-project 2 compact summary described the contract as `{authenticated, auth_required}` with `authenticated: true` in passwordless — verify before editing).

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py
git commit -m "test: add WF-6 auth gate and passwordless workflow tests"
```

---

## Task 9: WF-7 Scheduler cron tick fires a run

**Files:**
- Modify: `tests/api/test_workflows.py`

- [ ] **Step 1: Add the failing test**

Append:

```python
import asyncio
from datetime import datetime, timezone


def test_wf7_scheduler_cron_tick(app_factory, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")
    app = app_factory()
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        # Cron that matches any minute — "* * * * *"
        c.put("/policies/p", json={
            "name": "p", "username": "u@icloud.com", "directory": "/tmp/p",
            "cron": "* * * * *", "enabled": True, "timezone": None,
            "icloudpd": {},
            "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": None,
        })

        scheduler = app.state.scheduler
        # Drive scheduler deterministically — matches any minute
        scheduler.tick(datetime.now(timezone.utc))
        # Drain pending on the app's event loop
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(scheduler._drain_pending())
        finally:
            loop.close()

        # A scheduled run should now exist in history
        wait_until_idle(c)
        runs = c.get("/policies/p/runs").json()
        assert len(runs) == 1
        assert runs[0]["status"] == "success"

        # Second tick in same minute must not spawn another run (dedupe)
        scheduler.tick(datetime.now(timezone.utc))
        assert scheduler._pending == []
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_workflows.py::test_wf7_scheduler_cron_tick -v`
Expected: PASS. Note that calling `scheduler._drain_pending()` on a new event loop while the app's own loop is running is safe here because `TestClient` manages its own loop and `Runner.start` doesn't capture the scheduler's loop. If it fails with "attached to different event loop", switch to running the drain via the app's loop — the simplest fix is to use `asyncio.run_coroutine_threadsafe` or just `POST /policies/p/runs` directly instead of driving the scheduler (but then you're retesting WF-1; prefer fixing the loop issue).

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py
git commit -m "test: add WF-7 scheduler cron tick workflow test"
```

---

## Task 10: WF-8 Apprise dispatch on completion

**Files:**
- Modify: `tests/api/test_workflows.py`

- [ ] **Step 1: Add the failing test**

Append:

```python
def test_wf8_apprise_emitted_on_completion(app_factory, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")
    app = app_factory()

    calls: list[tuple[str, str, str]] = []

    def spy(event, *, policy_name, summary):
        calls.append((event, policy_name, summary))

    # Replace notifier.emit with a spy before kicking off the run
    app.state.notifier.emit = spy  # type: ignore[method-assign]

    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put("/policies/p", json={
            "name": "p", "username": "u@icloud.com", "directory": "/tmp/p",
            "cron": "0 * * * *", "enabled": True, "timezone": None,
            "icloudpd": {},
            "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": None,
        })
        c.post("/policies/p/runs")
        wait_until_idle(c)

    assert any(ev == "success" and name == "p" for ev, name, _ in calls), calls
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_workflows.py::test_wf8_apprise_emitted_on_completion -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py
git commit -m "test: add WF-8 apprise dispatch workflow test"
```

---

## Task 11: Wire AwsSync into run completion

**Why:** `AwsSync` exists but is not called anywhere. Sub-project 1 left this un-wired. The user's brief says "make sure the additional functions we built are easy, correct and working" — this one isn't working yet. Wire it, then test it.

**Files:**
- Modify: `src/icloudpd_web/app.py`
- Test: `tests/api/test_workflows.py` (follows in Task 12)

- [ ] **Step 1: Read current wiring**

Read `src/icloudpd_web/app.py` around the `_on_run_event` function (lines 70-90 in current source). Notice notifier is called there but AWS is not.

- [ ] **Step 2: Modify app to call AwsSync on success**

Add at the top of `app.py`:

```python
from icloudpd_web.integrations.aws_sync import AwsSync
```

Instantiate once inside `create_app`, before `_on_run_event`:

```python
    aws_sync = AwsSync()
    app.state.aws_sync = aws_sync
```

Extend `_on_run_event` to invoke AWS after a successful run:

```python
    def _on_run_event(run: Run, event: str) -> None:
        policy_store.bump()
        if event != "completed":
            return
        summary = _summarize(run)
        if run.status == "success":
            notifier.emit("success", policy_name=run.policy_name, summary=summary)
            policy = policy_store.get(run.policy_name)
            if policy is not None and policy.aws is not None and policy.aws.enabled:
                asyncio.create_task(
                    aws_sync.run(policy.aws, source=Path(policy.directory))
                )
        elif run.status == "failed":
            notifier.emit("failure", policy_name=run.policy_name, summary=summary)
```

(The exact line ranges will differ slightly from the sketch above — preserve any notifier behavior that exists for other statuses; the goal is: on `completed` + `success`, also fire the AWS sync if configured.)

- [ ] **Step 3: Run existing tests**

Run: `uv run pytest -q`
Expected: all existing tests still pass (no policy in existing tests has an AWS config, so the new branch is inert).

- [ ] **Step 4: Commit**

```bash
git add src/icloudpd_web/app.py
git commit -m "feat: wire AwsSync into run completion handler"
```

---

## Task 12: WF-9 AWS sync invocation

**Files:**
- Modify: `tests/api/test_workflows.py`

- [ ] **Step 1: Add the failing test**

Append:

```python
from pathlib import Path as _P
from icloudpd_web.integrations.aws_sync import AwsSyncResult
from icloudpd_web.store.models import AwsConfig


def test_wf9_aws_sync_invoked_on_success(app_factory, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")
    app = app_factory()

    invocations: list[tuple[AwsConfig, _P]] = []

    async def spy(cfg, *, source):
        invocations.append((cfg, source))
        return AwsSyncResult(skipped=False, exit_code=0, output="ok")

    app.state.aws_sync.run = spy  # type: ignore[method-assign]

    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put("/policies/p", json={
            "name": "p", "username": "u@icloud.com", "directory": "/tmp/p",
            "cron": "0 * * * *", "enabled": True, "timezone": None,
            "icloudpd": {},
            "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": {
                "enabled": True,
                "bucket": "b",
                "prefix": "x",
                "region": "us-east-1",
            },
        })
        c.post("/policies/p/runs")
        wait_until_idle(c)
        # Allow the background AWS task a tick to run
        time.sleep(0.1)

    assert len(invocations) == 1
    cfg, src = invocations[0]
    assert cfg.bucket == "b"
    assert str(src) == "/tmp/p"
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_workflows.py::test_wf9_aws_sync_invoked_on_success -v`
Expected: PASS. If the spy isn't called, the most common reason is that the background `asyncio.create_task` hasn't had a chance to run before the `TestClient` context exits — increase the `time.sleep(0.1)` to `0.3`.

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_workflows.py
git commit -m "test: add WF-9 AWS sync invocation workflow test"
```

---

## Task 13: Error contract sweep

**Why:** Guarantee every error response matches `{error, error_id, field?}` with a properly-prefixed ID.

**Files:**
- Create: `tests/api/test_error_contract.py`

- [ ] **Step 1: Write the test**

Create `tests/api/test_error_contract.py`:

```python
from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from .conftest import make_policy_body


SRV_RE = re.compile(r"^srv-[0-9a-f]{8}$")
RUN_RE = re.compile(r"^run-[0-9a-f]{8}$")


def _assert_error_shape(body: dict) -> None:
    assert "error" in body and isinstance(body["error"], str)
    assert "error_id" in body
    eid = body["error_id"]
    assert SRV_RE.match(eid) or RUN_RE.match(eid), eid
    if "field" in body:
        assert isinstance(body["field"], str) or body["field"] is None


@pytest.mark.parametrize(
    "method,path,body,expected_status",
    [
        ("GET", "/policies", None, 401),  # unauth
        ("GET", "/policies/nonexistent", None, 401),  # unauth
    ],
)
def test_errors_unauthenticated(app_factory, method, path, body, expected_status):
    app = app_factory()
    with TestClient(app) as c:
        r = c.request(method, path, json=body)
        assert r.status_code == expected_status
        _assert_error_shape(r.json())


def test_errors_authenticated_paths(client: TestClient):
    # 404 on missing policy
    r = client.get("/policies/does-not-exist")
    assert r.status_code == 404
    _assert_error_shape(r.json())

    # 404 on missing run
    r = client.get("/runs/does-not-exist/log")
    assert r.status_code in (404, 422)
    _assert_error_shape(r.json())

    # Validation error on bad cron (field should be populated)
    bad = make_policy_body("bad")
    bad["cron"] = "not a cron"
    r = client.put("/policies/bad", json=bad)
    assert r.status_code in (400, 422)
    body = r.json()
    _assert_error_shape(body)
    assert body.get("field") is not None
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/api/test_error_contract.py -v`
Expected: PASS. If any endpoint returns an error body without the shape, that's a real bug — fix it in the handler (likely missing a raise of `ApiError` or `ValidationError`). The spec names these IDs as `srv-xxx` / `run-xxx`; if actual IDs use a different prefix, update the regexes to match reality and record the discovery in the commit.

- [ ] **Step 3: Commit**

```bash
git add tests/api/test_error_contract.py
git commit -m "test: add error contract sweep"
```

---

## Task 14: Per-module coverage gates

**Why:** Floor global coverage at 90 % and pin the named modules at 100 % (`auth.py`, `static.py`, `errors.py`, `runner/config_builder.py`).

**Files:**
- Modify: `pyproject.toml`
- Create: `tests/test_coverage_gates.py`

- [ ] **Step 1: Run coverage and inspect current numbers**

Run: `uv run pytest --cov=src/icloudpd_web --cov-report=term-missing -q`
Record: total percentage, and the per-file percentages for the four named modules. If any named module is below 100 %, identify the uncovered lines from the report.

- [ ] **Step 2: Add targeted unit tests for any gaps in the named modules**

For each named module below 100 %, add (or extend) a unit test file with the minimum test that covers the missing lines. Do not add defensive code just to cover a branch — if a branch is genuinely unreachable, add `# pragma: no cover`.

Suggested locations: extend the existing `tests/test_auth.py`, `tests/test_static.py`, `tests/test_errors.py`, `tests/runner/test_config_builder.py`.

Run: `uv run pytest --cov=src/icloudpd_web --cov-report=term-missing -q` — the four named modules should now all be 100 %.

- [ ] **Step 3: Add fail-under gate**

In `pyproject.toml`, extend `addopts`:

```toml
[tool.pytest.ini_options]
addopts = "--cov=src/icloudpd_web --cov-report=term-missing --cov-branch --cov-fail-under=90"
```

- [ ] **Step 4: Add per-module gate test**

Create `tests/test_coverage_gates.py`:

```python
"""Per-module coverage floors.

Re-asserts that specific modules never drop below 100 % line coverage.
Reads the `.coverage` sqlite DB produced by the current pytest run.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


NAMED_MODULES = {
    "src/icloudpd_web/auth.py": 100,
    "src/icloudpd_web/static.py": 100,
    "src/icloudpd_web/errors.py": 100,
    "src/icloudpd_web/runner/config_builder.py": 100,
}


def _coverage_percent(db: Path, relative_path: str) -> float:
    # Coverage.py 7.x schema: `file` table + `line_bits` table.
    conn = sqlite3.connect(db)
    try:
        row = conn.execute(
            "SELECT id, numbits FROM file f LEFT JOIN line_bits lb ON lb.file_id = f.id "
            "WHERE f.path LIKE ?",
            (f"%{relative_path}",),
        ).fetchone()
        if row is None:
            raise pytest.skip.Exception(f"{relative_path} not measured")
        # If this accessor becomes brittle, fall back to running `uv run coverage
        # json -o - | jq` in a shell step. For now, coverage.py exposes a
        # stable Python API:
    finally:
        conn.close()
    from coverage import Coverage
    cov = Coverage(data_file=str(db))
    cov.load()
    analysis = cov.analysis2(str(Path(relative_path).resolve()))
    executable, _, missing, _ = analysis[1], analysis[2], analysis[3], analysis[4]
    if not executable:
        return 100.0
    return 100.0 * (1 - len(missing) / len(executable))


@pytest.mark.parametrize("module,floor", list(NAMED_MODULES.items()))
def test_module_coverage_floor(module: str, floor: int) -> None:
    db = Path(".coverage")
    if not db.exists():
        pytest.skip(".coverage not present; run under pytest-cov")
    pct = _coverage_percent(db, module)
    assert pct >= floor, f"{module}: {pct:.1f}% < {floor}%"
```

(Note: the sqlite query above is only used to check that the file is measured; the real percentage comes from `coverage.Coverage.analysis2`, which is stable across coverage.py 7.x. If this test becomes flaky, simplify it to `Coverage().analysis2(module)` and drop the sqlite step.)

- [ ] **Step 5: Verify**

Run: `uv run pytest -q`
Expected: everything passes. `--cov-fail-under=90` fails the run if total falls below 90 %.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml tests/test_coverage_gates.py tests/test_*.py tests/runner/test_config_builder.py
git commit -m "test: enforce coverage floors (90% global, 100% named modules)"
```

---

## Task 15: Frontend policyMapping tests

**Files:**
- Create: `web/src/lib/policyMapping.test.ts`
- Modify: `web/package.json` (add `@vitest/coverage-v8`)
- Modify: `web/vite.config.ts` (enable coverage threshold for policyMapping)

- [ ] **Step 1: Install coverage plugin**

```bash
cd web && npm install --save-dev @vitest/coverage-v8
```

- [ ] **Step 2: Write the tests**

Create `web/src/lib/policyMapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  defaultFormPolicy,
  fromPolicyView,
  toBackendPolicy,
  type FormPolicy,
} from "./policyMapping";
import type { PolicyView } from "@/types/api";

const baseView: PolicyView = {
  name: "p",
  username: "u@example.com",
  directory: "/tmp/p",
  cron: "0 * * * *",
  enabled: true,
  timezone: null,
  icloudpd: {},
  notifications: { on_start: false, on_success: true, on_failure: true },
  aws: null,
  has_password: false,
  is_running: false,
  last_run: null,
  next_run_at: null,
};

describe("defaultFormPolicy", () => {
  it("returns object with all required meta fields populated", () => {
    const f = defaultFormPolicy();
    expect(f.name).toBe("");
    expect(f.cron).toBe("0 * * * *");
    expect(f.enabled).toBe(true);
  });
});

describe("fromPolicyView", () => {
  it("copies meta fields", () => {
    const f = fromPolicyView(baseView);
    expect(f.name).toBe("p");
    expect(f.username).toBe("u@example.com");
    expect(f.cron).toBe("0 * * * *");
  });

  it("routes icloudpd dict values onto the form flat shape", () => {
    const f = fromPolicyView({
      ...baseView,
      icloudpd: { album: "Favorites", skip_videos: true, size: ["medium"] },
    });
    expect(f.album).toBe("Favorites");
    expect(f.skip_videos).toBe(true);
    expect(f.size).toEqual(["medium"]);
  });

  it("populates AWS fields when aws present", () => {
    const f = fromPolicyView({
      ...baseView,
      aws: {
        enabled: true,
        bucket: "b",
        prefix: "x",
        region: "us-east-1",
        access_key_id: "AKIA",
        secret_access_key: "sek",
      },
    });
    expect(f.upload_to_aws_s3).toBe(true);
    expect(f.aws_bucket).toBe("b");
    expect(f.aws_prefix).toBe("x");
    expect(f.aws_access_key_id).toBe("AKIA");
  });

  it("notification booleans come through with the new key names", () => {
    const f = fromPolicyView({
      ...baseView,
      notifications: { on_start: true, on_success: false, on_failure: true },
    });
    expect(f.on_start_notify).toBe(true);
    expect(f.on_success_notify).toBe(false);
    expect(f.on_failure_notify).toBe(true);
  });
});

describe("toBackendPolicy", () => {
  it("splits icloudpd fields from meta", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      album: "Favorites",
      skip_videos: true,
    };
    const out = toBackendPolicy(form);
    expect(out.name).toBe("p");
    expect(out.icloudpd).toMatchObject({ album: "Favorites", skip_videos: true });
    expect("album" in out).toBe(false);
  });

  it("drops nullish, empty-string, and empty-array values from icloudpd", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      recent: null,
      album: "",
      size: [],
    };
    const out = toBackendPolicy(form);
    expect("recent" in out.icloudpd).toBe(false);
    expect("album" in out.icloudpd).toBe(false);
    expect("size" in out.icloudpd).toBe(false);
  });

  it("emits aws=null when upload_to_aws_s3 is false", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      upload_to_aws_s3: false,
      aws_bucket: "ignored",
    };
    expect(toBackendPolicy(form).aws).toBeNull();
  });

  it("emits aws block when upload_to_aws_s3 is true", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      upload_to_aws_s3: true,
      aws_bucket: "b",
      aws_region: "us-east-1",
    };
    const out = toBackendPolicy(form);
    expect(out.aws).toMatchObject({ bucket: "b", region: "us-east-1" });
  });

  it("roundtrip stability: toBackend(fromPolicyView(view)) preserves meta + icloudpd", () => {
    const view: PolicyView = {
      ...baseView,
      icloudpd: { album: "Favorites", skip_videos: true },
    };
    const out = toBackendPolicy(fromPolicyView(view));
    expect(out.name).toBe(view.name);
    expect(out.cron).toBe(view.cron);
    expect(out.icloudpd).toMatchObject(view.icloudpd);
  });
});
```

- [ ] **Step 3: Add coverage config to vite.config.ts**

In `web/vite.config.ts`, extend the `test` section:

```ts
test: {
  // existing config...
  coverage: {
    provider: "v8",
    reporter: ["text", "html"],
    include: ["src/lib/policyMapping.ts", "src/api/client.ts"],
    thresholds: {
      "src/lib/policyMapping.ts": {
        lines: 95,
        branches: 95,
        functions: 95,
        statements: 95,
      },
    },
  },
},
```

- [ ] **Step 4: Run tests**

```bash
cd web && npm run test -- --run
```

Expected: all tests pass.

Then: `npm run test -- --run --coverage`
Expected: `policyMapping.ts` ≥ 95 % lines.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/src/lib/policyMapping.test.ts web/vite.config.ts
git commit -m "test: add policyMapping unit tests + vitest coverage plugin"
```

---

## Task 16: Frontend api client error tests

**Files:**
- Create: `web/src/api/client.test.ts`

- [ ] **Step 1: Write the tests**

Create `web/src/api/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./client";

function mockFetch(response: Partial<Response> & { body: string }) {
  const headers = new Headers(response.headers);
  const r = new Response(response.body, {
    status: response.status ?? 200,
    headers,
  });
  vi.stubGlobal("fetch", vi.fn(async () => r));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch success", () => {
  it("returns parsed JSON for 200", async () => {
    mockFetch({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    const result = await apiFetch<{ ok: boolean }>("/x");
    expect(result).toEqual({ ok: true });
  });

  it("returns undefined for 204", async () => {
    mockFetch({
      status: 204,
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    const result = await apiFetch("/x");
    expect(result).toBeUndefined();
  });

  it("returns text body when Content-Type is not JSON", async () => {
    mockFetch({
      status: 200,
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });
    const result = await apiFetch<string>("/x");
    expect(result).toBe("hello");
  });
});

describe("apiFetch errors", () => {
  it("throws ApiError with parsed body for JSON error response", async () => {
    mockFetch({
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Invalid cron",
        error_id: "srv-deadbeef",
        field: "cron",
      }),
    });
    await expect(apiFetch("/x")).rejects.toMatchObject({
      name: "ApiError",
      message: "Invalid cron",
      status: 400,
      errorId: "srv-deadbeef",
      field: "cron",
    });
  });

  it("falls back to statusText when error body is not JSON", async () => {
    mockFetch({
      status: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Internal Server Error",
    });
    const err = await apiFetch("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.errorId).toBeNull();
    expect(err.field).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd web && npm run test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add web/src/api/client.test.ts
git commit -m "test: add api client error parsing tests"
```

---

## Task 17: Upstream compatibility smoke script

**Files:**
- Create: `scripts/check_upstream.py`
- Modify: `Makefile` (already added target in Task 1)

- [ ] **Step 1: Identify the set of icloudpd flags the config builder emits**

Read `src/icloudpd_web/runner/config_builder.py` and extract every long-option name (`--foo-bar`) it writes into the config.toml it hands to `icloudpd --config-file`. Note these as the list below.

- [ ] **Step 2: Write the script**

Create `scripts/check_upstream.py`:

```python
"""Pre-release upstream-compatibility smoke test.

Runs the installed `icloudpd --version` and `icloudpd --help` and asserts every
long flag we emit via `config_builder.build_config` still appears in `--help`.

Never run this in CI — it shells out to the real icloudpd binary, which is what
we deliberately avoid in the test suite. Run it manually before bumping the pin.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path


# Long flags we depend on — source of truth is runner/config_builder.py.
# Update this list when config_builder.py changes.
REQUIRED_FLAGS = [
    "--config-file",
    "--username",
    "--directory",
    "--folder-structure",
    "--size",
    "--live-photo-size",
    "--live-photo-mov-filename-policy",
    "--file-match-policy",
    "--album",
    "--library",
    "--recent",
    "--until-found",
    "--skip-videos",
    "--skip-live-photos",
    "--file-suffixes",
    "--device-make",
    "--device-model",
    "--match-pattern",
    "--created-after",
    "--created-before",
    "--added-after",
    "--added-before",
    "--auto-delete",
    "--keep-icloud-recent-days",
    "--dry-run",
    "--log-level",
    "--domain",
    # (Keep this list aligned with config_builder.py. Add / remove when that changes.)
]


def main() -> int:
    bin_path = shutil.which("icloudpd")
    if not bin_path:
        print("icloudpd not found on PATH — install the pinned version first", file=sys.stderr)
        return 2

    # Capture --version and --help
    version = subprocess.run([bin_path, "--version"], capture_output=True, text=True, timeout=10)
    help_out = subprocess.run([bin_path, "--help"], capture_output=True, text=True, timeout=10)

    print("icloudpd --version:", version.stdout.strip() or version.stderr.strip())

    missing = [f for f in REQUIRED_FLAGS if not re.search(rf"(^|\s){re.escape(f)}\b", help_out.stdout)]
    if missing:
        print("\nFLAGS MISSING from icloudpd --help:", file=sys.stderr)
        for f in missing:
            print(f"  {f}", file=sys.stderr)
        print(
            "\nUpstream has renamed or removed these. Update config_builder.py and this script.",
            file=sys.stderr,
        )
        return 1

    print(f"\nAll {len(REQUIRED_FLAGS)} flags still present. Safe to bump the pin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Reconcile the `REQUIRED_FLAGS` list with the actual long options emitted by `src/icloudpd_web/runner/config_builder.py`: grep the file for `--` occurrences, plus the key names written into the config dict that icloudpd reads as flags. The listed set above is plausible but must be verified against the actual config_builder.

- [ ] **Step 3: Run the script**

```bash
uv run python scripts/check_upstream.py
```

Expected: exits 0 against the pinned icloudpd version. If some flag is missing, update the list or the config builder (whichever is wrong) and record the change.

- [ ] **Step 4: Commit**

```bash
git add scripts/check_upstream.py
git commit -m "test: add upstream compatibility smoke script"
```

---

## Final verification

- [ ] **Step 1: Run the full suite**

```bash
make test
```

Expected: backend passes with `--cov-fail-under=90`; frontend passes.

- [ ] **Step 2: Run coverage report**

```bash
make coverage
```

Expected: HTML report in `.coverage-html/` with no module below its floor.

- [ ] **Step 3: Run upstream smoke**

```bash
make check-upstream
```

Expected: PASS.

- [ ] **Step 4: Clean up**

Delete any tmp files, confirm `.gitignore` covers `.coverage`, `.coverage-html/`, `coverage.xml`, and verify `web/coverage/` is ignored.

```bash
git status
# If .coverage or .coverage-html/ show up untracked, add to .gitignore.
git add .gitignore
git commit -m "chore: ignore coverage outputs"
```

---

## Out of scope (explicitly not in this plan)

- GitHub Actions / CI (sub-project 3b — separate spec).
- Docker packaging (sub-project 3b).
- PyPI release workflow (sub-project 3b).
- Browser E2E (Playwright) — explicitly declined in spec.
- Component render tests, MSW — explicitly declined.
- Load / perf / fuzz testing.

## Success criteria

1. `make test` passes in < 30 s on a dev machine.
2. `--cov-fail-under=90` enforces global backend floor.
3. Named modules at 100 % via `test_coverage_gates.py`.
4. `policyMapping.ts` ≥ 95 % via vitest coverage config.
5. All nine workflow rows have a passing test.
6. `make check-upstream` passes against pinned `icloudpd`.
7. No test requires real Apple credentials or network access.
