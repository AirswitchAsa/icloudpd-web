# icloudpd-web Testing Design

**Date:** 2026-04-19
**Sub-project:** 3a — Testing
**Related:** sub-project 1 (backend redesign), sub-project 2 (frontend redesign), sub-project 3b (CI/CD — separate spec, follows this one)

## Goal

Lock in a test suite that proves the wrapper works end-to-end against `icloudpd` without needing real Apple credentials, and that flags upstream CLI breakage before release. Developer iCloud credentials never appear in tests.

## Non-Goals

- Browser-level E2E (no Playwright).
- Component render tests or MSW on the frontend.
- Load, performance, or fuzz testing.
- Running real `icloudpd` against a real iCloud account in CI.
- Testing behavior that's a thin delegate to a well-tested library (e.g., asserting `Apprise.notify` actually sends a message).

## Baseline

- 98 backend tests pass (`uv run pytest`) across `tests/api`, `tests/runner`, `tests/scheduler`, `tests/store`, `tests/integrations`, plus top-level `test_auth`, `test_cli`, `test_config`, `test_errors`, `test_lifespan`, `test_static`, `test_smoke`.
- `tests/fixtures/fake_icloudpd.py` implements a stub CLI with modes `success`, `fail`, `slow`, `mfa` driven by env vars (`FAKE_ICLOUDPD_MODE`, `FAKE_ICLOUDPD_TOTAL`, `FAKE_ICLOUDPD_SLEEP`, `FAKE_ICLOUDPD_MFA_CALLBACK`).
- No frontend tests exist yet; `vitest` is installed from sub-project 2.
- No coverage tool is wired.

This spec is gap-closing on top of that baseline.

## Architecture

Five layers:

### 1. Backend unit tests (existing, expand)

Scope: individual modules with their own concerns — auth, static SPA guard, TOML policy store, secret handling, config builder, errors, scheduler core logic.

Framework: `pytest`, plain asserts, fixtures in `conftest.py`.

No subprocess, no network.

### 2. Backend integration tests (expand)

Scope: full FastAPI app lifted in-process, driven by `httpx.AsyncClient` against the ASGI app. Each test covers a complete user-facing workflow (add policy → start run → stream SSE → …).

The fake `icloudpd` binary is injected via the `Runner`'s `icloudpd_argv: Callable[[Path], list[str]]` constructor argument (see `src/icloudpd_web/runner/runner.py:23`). Integration tests build the app with an argv callable that returns `[sys.executable, "tests/fixtures/fake_icloudpd.py", ...]`. No test ever shells out to real `icloudpd`.

SSE is consumed by reading the response body as a stream and parsing `event:` / `data:` / `id:` lines — no extra client library.

### 3. Integration boundaries (keep, verify completeness)

`apprise` and AWS S3 sync are tested by patching at the Python library surface:
- `apprise.Apprise.add` / `.notify` patched, assert called with expected payload.
- `boto3.client("s3").upload_file` patched, assert called per downloaded file.

No real HTTP is mocked; we assume those libraries are tested upstream.

### 4. Frontend unit tests (new, small)

Two files, that's it:

- `web/src/lib/policyMapping.test.ts` — pure function tests for `toFormPolicy` and `toBackendPolicy`. Covers: all top-level meta fields routed correctly, all `icloudpd` dict fields preserved, optional fields omitted when absent, roundtrip stability (`toBackend(toForm(x)) === x` for canonical shapes).
- `web/src/api/client.test.ts` — `apiFetch` error handling: asserts `ApiError` extracts `error`, `error_id`, `field`, `status` from response bodies matching `{error, error_id, field}`. Uses `fetch` stubbed with a minimal Response mock, no MSW.

Framework: `vitest` (already installed). No React Testing Library required.

Everything else on the frontend (hooks, stores, components) is covered transitively by the backend integration tests asserting the wire contract.

### 5. Upstream compatibility smoke (new, manual-only)

`make check-upstream` runs the real installed `icloudpd` (the version pinned in `pyproject.toml`) and asserts:

- `icloudpd --version` matches the pin.
- `icloudpd --help` output contains every long flag that `config_builder.py` emits.
- A small flag-to-regex table in `scripts/check_upstream.py` is the source of truth.

Failure means upstream changed a flag; bump or adjust the mapping before releasing a new pin.

This script is **never** run in CI. It's a pre-release gate for the human bumping the pin.

## Workflow matrix (integration tests)

Each row is one `pytest.mark.asyncio` test in `tests/api/test_workflows.py`, driving the real FastAPI app with the fake binary. All tests run in-process; none block on real wall-clock time beyond ~1 second.

| ID | Workflow | Fake mode | What it asserts |
|---|---|---|---|
| WF-1 | Happy path | `success` | Create policy → start run → SSE streams progress events → SSE sends `status=success` → GET run history shows it → GET log file returns captured stdout |
| WF-2 | MFA flow | `mfa` | SSE emits `status=awaiting_mfa` → POST `/mfa/{run_id}` with code → fake reads callback file → SSE resumes → `status=success` |
| WF-3 | Failure | `fail` | SSE `status=failed` → run history records failure → log contains stderr line |
| WF-4 | Interrupt | `slow` | Start run → POST stop mid-run → SSE terminates with `status=stopped` → process no longer in run registry |
| WF-5 | SSE resume | `slow` | Open SSE, receive N events, close → reconnect with `Last-Event-ID: N` → no duplicate events, stream continues |
| WF-6 | Auth gate | — | Unauthenticated request returns 401 with error shape → login → succeeds. Separate test: server started with no password hash → `/auth/status` reports `auth_required: false`, requests succeed without cookie |
| WF-7 | Scheduler tick | `success` | Policy with cron fires → run starts automatically → second tick during run does not start overlapping run (overlap=skip) |
| WF-8 | Apprise dispatch | `success` + `apprise.Apprise.notify` patched | Run completes → `notify` called once with expected title/body |
| WF-9 | S3 sync | `success` + `boto3` patched | Per-policy S3 config → run completes → `upload_file` called for each downloaded file |

Fixtures live in `tests/conftest.py` and `tests/api/conftest.py`:

- `app` — builds FastAPI app with `data_dir=tmp_path`, static dir empty.
- `authed_client` — AsyncClient with cookie session established.
- `fake_bin` — path to `tests/fixtures/fake_icloudpd.py` made executable.
- `with_mode(mode, **kwargs)` — context manager that sets fake env vars for the next run.

## Coverage

Wire `pytest-cov` via `pyproject.toml`:

```toml
[tool.pytest.ini_options]
addopts = "--cov=src/icloudpd_web --cov-report=term-missing --cov-fail-under=90"

[tool.coverage.run]
branch = true
source = ["src/icloudpd_web"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
]
```

Module-level gates (enforced by a helper in a dedicated test that reads `.coverage`):

- `auth.py` — 100%
- `static.py` — 100%
- `errors.py` — 100%
- `runner/config_builder.py` — 100%

Other modules: 90% line coverage floor via `--cov-fail-under=90`.

Frontend: `vitest run --coverage` with threshold 95% for `src/lib/policyMapping.ts` only. No floor on other files.

## Error-shape enforcement

A single test (`tests/api/test_error_contract.py`) loops through every error-producing route and asserts responses always include `{error, error_id, field?}` with `error_id` matching `^srv-[0-9a-f]{8}$` or `^run-[0-9a-f]{8}$`. Prevents drift.

## Make targets

Consolidate in the existing `Makefile`:

```
make test           # pytest + vitest
make test-backend   # pytest
make test-frontend  # vitest run
make coverage       # pytest with coverage report
make check-upstream # manual pre-release; runs real icloudpd --help
```

`make test` is the dev loop; runs in under 30 seconds.

## File layout

```
tests/
  conftest.py                    # app, tmp_path, auth fixtures
  fixtures/
    fake_icloudpd.py             # existing
    __init__.py
  api/
    conftest.py                  # authed_client, fake_bin, with_mode
    test_workflows.py            # NEW — WF-1..WF-9
    test_error_contract.py       # NEW — error shape sweep
    test_auth.py                 # existing
    test_mfa.py                  # existing; trim duplicates covered by WF-2
    test_policies.py, test_runs.py, test_settings.py, test_streams.py, test_wiring.py
  runner/                        # existing unit tests
  scheduler/                     # existing unit tests
  store/                         # existing unit tests
  integrations/                  # existing unit tests
  test_auth.py, test_cli.py, test_config.py, test_errors.py,
  test_lifespan.py, test_smoke.py, test_static.py
  test_coverage_gates.py         # NEW — per-module floors

web/src/
  lib/policyMapping.test.ts      # NEW
  api/client.test.ts             # NEW

scripts/
  check_upstream.py              # NEW

Makefile                         # add test/coverage/check-upstream targets
pyproject.toml                   # add pytest-cov config + dev dep
```

## Dependencies added

- `pytest-cov` (backend dev dep)
- `httpx` (already a FastAPI dep, confirm in dev deps)
- `pytest-asyncio` (already present)
- `@vitest/coverage-v8` (frontend dev dep)

Nothing else.

## Open risks

- **SSE resume semantics (WF-5):** Relies on the backend's `Last-Event-ID` handling from sub-project 1. If resume was implemented but not tested, WF-5 may surface real bugs. That's a feature, not a risk — just flag the test as where regressions would land.
- **Scheduler timing (WF-7):** Tests call `Scheduler.tick(now)` directly (see `src/icloudpd_web/scheduler/scheduler.py:46`) with synthesized `datetime` values instead of waiting for the 1 Hz loop, keeping WF-7 deterministic and sub-second.
- **Fake binary fidelity:** If real `icloudpd` changes output format, backend parsers may break while tests still pass. `make check-upstream` is the guard against this; it's a manual gate, not a CI gate, and we accept that.

## Success criteria

1. `make test` passes in under 30 seconds on a dev machine.
2. Backend line coverage ≥ 90% overall; named modules at 100%.
3. Frontend `policyMapping` coverage ≥ 95%.
4. Every row of the workflow matrix has one passing test.
5. `make check-upstream` runs green against the currently pinned `icloudpd` version.
6. No test imports real Apple credentials or requires network access.
