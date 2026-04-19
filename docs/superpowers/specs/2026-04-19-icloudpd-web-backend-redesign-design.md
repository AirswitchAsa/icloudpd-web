# icloudpd-web Backend Redesign — Design

**Date:** 2026-04-19
**Scope:** Sub-project 1 of 3. Full backend rewrite. Frontend (Sub-project 2) and packaging (Sub-project 3) are separate specs.

## Goals

Address five recurring failures reported against the current implementation:

1. Policies disappearing (in-memory state stomping; non-atomic TOML writes).
2. Runs failing with no actionable reason (generic error messages, swallowed tracebacks).
3. Logs inconsistent / interleaved (shared global logger handlers).
4. Integrations broken (Apprise errors crash runs).
5. Cron not firing reliably (polling loop racing policy mutations).

The redesign replaces the backend wholesale with a simpler architecture: icloudpd is run as an opaque subprocess instead of imported as a library; policies live in per-file TOML; runs are isolated, stream their own logs, and cannot contaminate each other; error handling always produces either a specific message or a traceable `error_id`.

## Non-goals

- Frontend UI changes (separate sub-project; Vite SPA replaces Next.js).
- Backwards compatibility with the current websocket event model or the single-file `policies.toml` — this is a breaking change. No migration tool.
- Multi-user / role-based auth. Single-user only.
- Deep re-implementation of icloudpd features. We forward options and trust upstream.

## Scope decision: subprocess, not library

The current wrapper imports `icloudpd.base`, `icloudpd.autodelete`, `icloudpd.filename_policies`, and friends. This coupling is the root cause of most of the complexity and the "god object" in `app.py`. Treating icloudpd as an opaque subprocess is the single largest simplification in this redesign:

- Upstream `icloudpd` 1.32 has first-class multi-user config-file support. It is already designed to run as a daemon.
- Upstream has native resume (1.30), re-auth on error (1.28.2), cookie reuse (1.28.2). We do not reimplement any of it.
- Stop a run = SIGTERM. Next run = resume. Zero wrapper code.
- Log isolation becomes trivial (one subprocess → one stdout → one file).
- Upstream bumps become `uv lock --upgrade-package icloudpd` + smoke test.

Cost: fine-grained progress is limited to what we can parse from log lines. Acceptable for a UI.

## Language / runtime

Python 3.12, FastAPI, asyncio. icloudpd as a pinned pypi dependency (currently 1.32.2). No vendored submodule.

Python is retained (despite the subprocess pivot removing the main argument for it) because the **distribution story is materially better**: `pipx install icloudpd-web` pulls icloudpd transitively, one runtime on the user's machine. A TypeScript backend would require Python anyway (for icloudpd) plus Node.

## Architecture

Single FastAPI process. Three long-lived asyncio components owned by the app:

- **`PolicyStore`** — loads/persists `~/.icloudpd-web/policies/*.toml`, one file per policy. Atomic writes (temp + fsync + rename). In-memory dict + monotonically increasing `generation` counter, bumped on any mutation.
- **`Scheduler`** — single asyncio task, 1 Hz tick. Consults `PolicyStore`; for policies whose cron matches the current minute and that are not already running, dispatches to `Runner`. Overlap = skip.
- **`Runner`** — manages subprocess-backed runs. For each run: generates a transient icloudpd config file, spawns `icloudpd --config-file ...` via `asyncio.subprocess`, streams stdout/stderr into `runs/{policy}/{run_id}.log` and an in-memory ring buffer, parses best-effort progress, fires integrations on completion, prunes old logs (keep 10 newest per policy).

**2FA** via icloudpd's MFA provider mechanism. A small local callback (unix socket or loopback) is queried by the MFA provider script; the server UI POSTs the code; the callback returns it.

**HTTP layer:** plain FastAPI routers. REST for reads/mutations. Two SSE endpoints:
- `/policies/stream` — emits generation-diff events; UI re-fetches changed policies.
- `/runs/{run_id}/events` — log lines + progress + status; resumable via `Last-Event-ID`.

**Auth:** single server password, set via env var or config file. Cookie session on login. No UI to change the password.

**No per-client server state.** The old per-client handler concept is gone. Server state is canonical; frontend is a view of it.

## Data model

### Policy (on disk: `policies/{name}.toml`, one file per policy)

```toml
name = "family-photos"
username = "user@icloud.com"
directory = "/data/family-photos"
cron = "0 */6 * * *"
enabled = true
timezone = "Europe/Berlin"   # optional; defaults to server local

[icloudpd]                    # forwarded verbatim to icloudpd config
album = "All Photos"
size = ["original"]
recent = 1000

[notifications]
on_start = false
on_success = true
on_failure = true

[aws]
enabled = false
bucket = "..."
prefix = "..."
region = "..."
```

The `[icloudpd]` table is a passthrough. Whatever keys icloudpd's config format accepts, we accept. We validate only what we own: `name`, `username`, `directory`, `cron`, `enabled`, `timezone`.

### Policy (in memory — pydantic)

```python
class Policy:
    name: str
    username: str
    directory: Path
    cron: str                    # validated via croniter
    enabled: bool
    timezone: str | None
    icloudpd: dict[str, Any]     # opaque
    notifications: NotificationConfig
    aws: AwsConfig | None
    # derived, not on disk:
    next_run_at: datetime | None
    last_run: RunSummary | None
```

### Run (in-memory while active; persisted only as the log file)

```python
class Run:
    run_id: str                  # "{policy}-{utc_iso_compact}"  e.g. "family-photos-20260419T143022Z"
    policy_name: str
    started_at: datetime
    ended_at: datetime | None
    status: Literal["running", "success", "failed", "stopped"]
    exit_code: int | None
    error_id: str | None         # links to log file when failed
    progress: {downloaded: int, total: int | None}
```

No structured run records are persisted. On app restart, `last_run` is reconstructed per policy by inspecting the newest log file (first/last lines + an exit-status marker written by the runner). This trades a tiny parse cost at startup for zero state-sync bugs.

### Generation counter

Single `int` on `PolicyStore`, bumped on any policy mutation (create / edit / delete / enable toggle) **and** on any run state transition. SSE clients subscribe with a `since` generation and receive the list of policy names that changed since then.

### Secrets

Stored at `~/.icloudpd-web/secrets/{policy_name}.password`, file-mode 0600. Not in policy TOML. Ingested via `POST /policies/{name}/password`; never returned to the client. icloudpd's own cookie jar at `~/.pyicloud/` is left alone.

## HTTP API

All routes behind session cookie except `POST /auth/login`.

### Auth
- `POST /auth/login` `{password}` → sets cookie, returns `{ok: true}`.
- `POST /auth/logout` → clears cookie.
- `GET /auth/status` → `{authenticated: bool}`.

### Policies
- `GET /policies` → `[PolicySummary]` (name, username, enabled, cron, next_run_at, last_run, is_running).
- `GET /policies/{name}` → full `Policy`.
- `PUT /policies/{name}` (body = policy as JSON) → create or replace, atomic write, generation bump.
- `DELETE /policies/{name}` → remove file, stop active run if any.
- `POST /policies/{name}/password` `{password}` → write secrets file (204).
- `DELETE /policies/{name}/password` → remove secrets file.
- `POST /policies/import` (multipart TOML) / `GET /policies/export` (combined TOML).

### Runs
- `POST /policies/{name}/runs` → start now; 409 if already running; returns `{run_id}`. Ignores `enabled`.
- `DELETE /runs/{run_id}` → SIGTERM.
- `GET /policies/{name}/runs` → list `RunSummary` for retained logs.
- `GET /runs/{run_id}/log` → `text/plain` download.

### MFA
- `POST /policies/{name}/mfa` `{code}` → unblocks MFA callback.
- `GET /policies/{name}/mfa/status` → `{awaiting: bool}`.

### Streams (SSE)
- `GET /policies/stream` → `{generation, changed: [name, ...]}`; resumable via `Last-Event-ID`.
- `GET /runs/{run_id}/events` → log + progress + status events; resumable via `Last-Event-ID` (event seq).

### Settings
- `GET /settings` / `PUT /settings` → server-wide: Apprise URLs + event toggles, default AWS config, log retention N (default 10).

### Error shape

All 4xx/5xx responses:
```json
{ "error": "friendly message", "error_id": "run-xxx" | "srv-xxx" | null }
```
Stack traces never on the wire. `error_id` references either a run log file (for run failures) or a server log entry (for unexpected server errors). For validation errors, `error_id` is `null` and the message is self-sufficient, optionally with a `field` key.

### SSE event format (runs)

```
id: 42
event: log
data: {"ts": "2026-04-19T14:30:22Z", "line": "..."}

id: 43
event: progress
data: {"downloaded": 317, "total": 5000}

id: 44
event: status
data: {"status": "success", "exit_code": 0}
```

## Scheduler

Single asyncio task, 1 Hz tick:

```
loop:
    await sleep(1)
    now = utc_now()
    for policy in policy_store.all():
        if not policy.enabled or not policy.cron: continue
        if runner.is_running(policy.name): continue         # overlap = skip
        local_now = now in policy.timezone or server local
        if not croniter.match(policy.cron, local_now, second=0): continue
        if last_fired.get(policy.name) == local_now.replace(second=0): continue
        last_fired[policy.name] = local_now.replace(second=0)
        await runner.start(policy, trigger="cron")
```

- **Resolution:** per-minute (cron's max). We poll at 1 Hz and dedupe by minute.
- **Edits:** scheduler reads fresh policy each tick; no precomputed `next_run_at` to invalidate.
- **`next_run_at` display:** computed on demand via `croniter(cron, now).get_next()`.
- **Timezone / DST:** `croniter` handles DST. Per-policy `timezone` (IANA) field; default = server local.
- **Missed on restart:** no catch-up. Matches the skip philosophy.
- **`enabled = false`:** scheduler skips. Manual `POST …/runs` still works (explicit user intent overrides).

## Runner and run logs

Per run, the `Runner` owns:
1. A log file at `runs/{policy}/{run_id}.log`.
2. An in-memory ring buffer (`collections.deque`, cap ~2000 entries).
3. Monotonic sequence counter for SSE event IDs.
4. A broadcast channel (per-subscriber `asyncio.Queue`) for live tails.

Two asyncio tasks read `stdout` / `stderr` line by line. Each line is timestamped, written to file (line-buffered), pushed to the ring buffer with a new seq, and broadcast.

### SSE resume semantics

Client opens `/runs/{run_id}/events` with optional `Last-Event-ID: N`.

- `N` in ring buffer → replay from `N+1`, then tail live.
- `N` older than the ring → replay from file, then join live.
- Run already ended → replay remainder from file, emit final `status` event, close.
- No `Last-Event-ID` → replay entire ring, then tail.

### Progress parsing (defensive)

- **Run status comes from the subprocess exit code.** Not from log parsing. Always reliable.
- **Progress regex is best-effort.** Matches icloudpd's "Downloading X of Y" shape. If upstream changes the phrasing and the regex stops matching, progress silently disappears; runs still work, logs still stream, status still decides via exit code.
- **Upstream contribution (follow-up, non-blocking):** propose `--log-format=json` to icloudpd. Once landed, swap the regex for `json.loads`. Tracked as an enhancement, not a dependency of this project.

### Log retention

On run completion, list `runs/{policy}/*.log` sorted by mtime desc, delete beyond N (default 10). Runs synchronously after integrations fire.

### No shared loggers

The subprocess's stdout is the only source of run log lines. No Python `logging` handlers attached per-run to any shared logger. This is what eliminates the interleaving bug.

### Server log

Separate: `~/.icloudpd-web/server.log`, standard rotating file handler, not streamed to clients. Captures the server's own logs, including tracebacks for 500s tagged with their `error_id`.

## Error handling

Three categories; every error response is traceable.

**1. Validation / 4xx.** Handled at endpoints. Response: `{error: "Invalid cron expression…", field: "cron", error_id: null}`. Self-sufficient message.

**2. Run failures.** `Runner` captures exit code, reads last ~20 lines of the run log, picks the last `ERROR`/`CRITICAL`-tagged line as the summary. Sets `Run.status = "failed"`, `error_id = run_id`. SSE emits `{status: "failed", exit_code, summary, error_id}`. Frontend shows summary + "View full log" → `GET /runs/{run_id}/log`.

**3. Server-side unexpected exceptions.** FastAPI exception handler assigns `error_id = "srv-" + short_uuid()`, logs full traceback to `server.log` tagged with that id, returns `{error: "Server error. Reference: srv-xxxx", error_id}` with 500.

**Apprise failures never fail a run.** They log to `server.log` with their own `srv-` id and append a single WARNING to the run log. The run status is untouched.

**AWS failures never fail a run.** Same policy as Apprise.

**MFA timeout** (default 5 min): subprocess killed, run marked failed with summary `"MFA code not provided in time"`.

## Integrations

### Apprise — server-wide

Single block in `~/.icloudpd-web/settings.toml`:

```toml
[apprise]
urls = ["discord://.../.../", "mailto://..."]
on_start = false
on_success = true
on_failure = true
```

One `apprise.Apprise` instance, rebuilt on settings save. Lives on the app object. The per-policy `[notifications]` block only gates which events of that policy trigger notifications.

`Runner` calls `notifier.emit(event, policy, run)` on start/success/failure. Wraps `apprise.notify()` in try/except; any error is logged + appended to run log as WARNING; never propagates.

### AWS — per-policy

Each policy's `[aws]` block is self-contained: bucket, prefix, region. Credentials come from env / `~/.aws/credentials` — never from the TOML. On run **success**:

- `aws.enabled = false` → skip.
- Spawn `aws s3 sync {directory} s3://{bucket}/{prefix}` as a subprocess.
- Stdout/stderr appended to the run log with `[aws-sync]` prefix.
- Exit non-zero → WARNING + notification hook; run status untouched.

### No plugin system

Two integrations do not justify the abstraction cost. If a third appears, refactor then.

## Code module layout

```
src/icloudpd_web/
├── __init__.py
├── __main__.py
├── cli.py                   # argparse: --host, --port, --config-dir, --password-env, init-password
├── app.py                   # FastAPI app factory; lifespan wiring
├── config.py                # server settings (settings.toml) load/save
├── auth.py                  # password hash check, cookie session middleware
├── errors.py                # exception handlers, error_id helpers
│
├── store/
│   ├── policy_store.py      # CRUD, generation, atomic writes
│   ├── secrets.py           # 0600 password files
│   └── models.py            # pydantic models
│
├── runner/
│   ├── runner.py            # registry of active Runs
│   ├── run.py               # subprocess, ring buffer, broadcast, progress parse
│   ├── config_builder.py    # Policy → transient icloudpd config
│   ├── log_retention.py
│   └── mfa.py               # MFA provider local callback
│
├── scheduler/
│   └── scheduler.py         # 1 Hz tick loop
│
├── integrations/
│   ├── apprise_notifier.py
│   └── aws_sync.py
│
├── api/
│   ├── __init__.py          # include routers
│   ├── auth.py
│   ├── policies.py
│   ├── runs.py
│   ├── mfa.py
│   ├── settings.py
│   └── streams.py           # SSE endpoints
│
└── webapp/                  # bundled SPA (built by sub-project 2)
```

**Boundaries:**
- `store/` knows nothing about runs or scheduling.
- `runner/` takes policies as input, persists only log files.
- `scheduler/` depends on `PolicyStore` + `Runner`.
- `api/` holds no business logic, only HTTP translation.
- `integrations/` is called by `runner/` at lifecycle points; no inbound imports from `api/` or `store/`.

Import direction: `store → runner → scheduler → api`, with `integrations` as a sibling to `runner`.

## Deletions

The current tree loses:
- Vendored `icloud_photos_downloader/` submodule.
- `websockets.py`, `client_handler.py`, `authentication_local.py`, `policy_handler.py`, `logger.py`, `icloud_utils.py`, `download_option_utils.py`, `apprise_handler.py`, `aws_handler.py`, `error.py`, `data_models.py`, `dev.py`, `main.py`.
- The existing `app.py` is fully replaced.

The old tree is retained on a `legacy` branch as a reference for known-working bits (icloudpd option shapes, Apprise wiring, cron expressions).

## Testing strategy

### Unit tests (fast, no subprocess or network)

- `store/policy_store.py`: CRUD; generation bumps; atomic-write crash sim (kill between temp write and rename → original survives); concurrent saves via `asyncio.gather` (last-write-wins, no corruption).
- `store/secrets.py`: 0600 mode, round-trip, delete.
- `scheduler/scheduler.py`: fake clock + fake runner; correct fire times, per-minute dedupe, overlap skip, disabled skip, timezone handling.
- `runner/config_builder.py`: passthrough of `[icloudpd]` keys.
- `runner/run.py`: uses a **fake icloudpd script** at `tests/fixtures/fake_icloudpd.py` (mode via env: `success|fail|slow|mfa`) to exercise the full subprocess path — ring buffer, broadcast, progress parse, exit-code→status, SIGTERM.
- `runner/log_retention.py`: create 12 files, prune, assert 10 newest remain.
- `integrations/apprise_notifier.py`: stub `apprise.Apprise`; no-op when empty; WARNING-to-log on failure; never raises.
- `errors.py`: each handler produces correct shape + `error_id`.

### API tests (FastAPI `TestClient`, no real icloudpd)

- Auth: login/logout/session cookie.
- Policies CRUD round-trip + validation errors.
- Secrets set/delete.
- `POST /policies/{name}/runs` with fake icloudpd: success + failure.
- SSE resume: open `/runs/{run_id}/events`, disconnect after event 3, reconnect with `Last-Event-ID: 3`, assert no gap / no duplicates.
- Policy-stream generation diff: mutate policy, assert SSE emits the name.

### Integration smoke (opt-in, `@pytest.mark.smoke`)

- Boot real app against temp dir with fake icloudpd, exercise cron fire → run → log → retention → apprise-noop cycle.

### Out of scope

- Tests against real iCloud.
- Frontend tests (sub-project 2).

### Tooling

- `pytest` + `pytest-asyncio` + `httpx`.
- `ruff` (configured) + `ty` (Astral type checker) on new code.
- Fake icloudpd script at `tests/fixtures/fake_icloudpd.py`, behavior driven by `FAKE_ICLOUDPD_MODE`.

### Coverage target

Checklist, not percentage: every public method of `PolicyStore`, `Runner`, `Scheduler`, `AppriseNotifier` has happy-path + failure-path tests. Every HTTP route has success + validation-failure tests.

## Risks

- **icloudpd log format drift.** Mitigated by: (a) status decided by exit code, not logs; (b) progress parsing is best-effort and fails gracefully; (c) planned upstream PR for `--log-format=json`.
- **MFA provider mechanism in icloudpd may evolve.** If the CLI contract changes, the MFA callback needs adjusting. Contained in `runner/mfa.py`.
- **Per-minute cron resolution** means a restart during the target minute can miss a run. Acceptable under the skip philosophy.
- **Log retention races** if a run completes while the UI is streaming an older run's file. Mitigated by retaining the file until the next run completes; streaming reads don't hold locks.
