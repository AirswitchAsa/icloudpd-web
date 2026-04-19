# icloudpd-web Backend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the icloudpd-web backend with a FastAPI app that runs icloudpd as an opaque subprocess, persists policies as per-file TOML with atomic writes, streams per-run logs via resumable SSE, and fires cron reliably.

**Architecture:** Python 3.12 + FastAPI + asyncio. Three in-process components: `PolicyStore` (atomic per-file TOML, generation counter), `Scheduler` (1 Hz tick, croniter, overlap=skip), `Runner` (asyncio subprocess per run, ring buffer, SSE broadcast, log retention N=10). Integrations: server-wide Apprise, per-policy `aws s3 sync` subprocess. Single-user cookie auth. 2FA via icloudpd MFA provider local callback.

**Tech Stack:** Python 3.12, FastAPI, uvicorn, pydantic v2, croniter, apprise, icloudpd (pypi, pinned), pytest, pytest-asyncio, httpx, ruff, ty.

**Spec:** [docs/superpowers/specs/2026-04-19-icloudpd-web-backend-redesign-design.md](../specs/2026-04-19-icloudpd-web-backend-redesign-design.md)

---

## File layout produced

```
src/icloudpd_web/
├── __init__.py
├── __main__.py
├── cli.py
├── app.py
├── config.py
├── auth.py
├── errors.py
├── store/{__init__,models,policy_store,secrets}.py
├── runner/{__init__,runner,run,config_builder,log_retention,mfa}.py
├── scheduler/{__init__,scheduler}.py
├── integrations/{__init__,apprise_notifier,aws_sync}.py
└── api/{__init__,auth,policies,runs,mfa,settings,streams}.py

tests/
├── conftest.py
├── fixtures/fake_icloudpd.py
├── store/{test_models,test_policy_store,test_secrets}.py
├── runner/{test_config_builder,test_run,test_runner,test_log_retention,test_mfa}.py
├── scheduler/test_scheduler.py
├── integrations/{test_apprise_notifier,test_aws_sync}.py
├── api/{test_auth,test_policies,test_runs,test_mfa,test_settings,test_streams}.py
└── test_smoke.py
```

---

## Task 0: Prepare the tree

**Files:**
- Delete: whole `src/icloudpd_web/` except `__init__.py`, `webapp/` (keep SPA assets), `icloud_photos_downloader/` submodule.
- Modify: `pyproject.toml`
- Create: empty module skeleton.

- [ ] **Step 1: Save old code on `legacy` branch**

```bash
git checkout -b legacy
git push -u origin legacy
git checkout main
```

- [ ] **Step 2: Delete vendored submodule and old backend files**

```bash
git submodule deinit -f icloud_photos_downloader || true
git rm -rf icloud_photos_downloader
rm -rf .gitmodules
git rm -rf src/foundation
git rm src/icloudpd_web/websockets.py src/icloudpd_web/cli.py src/icloudpd_web/app.py src/icloudpd_web/dev.py src/icloudpd_web/main.py
git rm -rf src/icloudpd_web/api
```

Keep: `src/icloudpd_web/__init__.py`, `src/icloudpd_web/webapp/` (SPA bundle for later).

- [ ] **Step 3: Update `pyproject.toml` dependencies**

Replace `[project]` and `[project.scripts]` sections. Full file content:

```toml
[project]
name = "icloudpd-web"
version = "2026.4.19"
description = "Web UI for icloud-photos-downloader"
requires-python = ">=3.12"
readme = "README.md"
license = { file = "LICENSE" }
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "pydantic>=2.8",
  "croniter>=2.0",
  "apprise>=1.8",
  "icloudpd==1.32.2",
  "python-multipart>=0.0.9",
  "itsdangerous>=2.2",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "pytest-asyncio>=0.23",
  "httpx>=0.27",
  "ruff>=0.5",
  "ty>=0.0.1a1",
]

[project.scripts]
icloudpd-web = "icloudpd_web.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/icloudpd_web"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 4: Create empty module skeleton**

```bash
mkdir -p src/icloudpd_web/{store,runner,scheduler,integrations,api}
mkdir -p tests/{store,runner,scheduler,integrations,api,fixtures}
for d in src/icloudpd_web src/icloudpd_web/store src/icloudpd_web/runner src/icloudpd_web/scheduler src/icloudpd_web/integrations src/icloudpd_web/api tests tests/store tests/runner tests/scheduler tests/integrations tests/api tests/fixtures; do
  touch "$d/__init__.py"
done
```

- [ ] **Step 5: Install deps and confirm env works**

```bash
uv sync --extra dev
uv run pytest -q
```

Expected: `no tests ran` (success).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: clear old backend, set up new module skeleton"
```

---

## Task 1: Models

**Files:**
- Create: `src/icloudpd_web/store/models.py`
- Create: `tests/store/test_models.py`

- [ ] **Step 1: Write failing tests**

`tests/store/test_models.py`:

```python
import pytest
from pathlib import Path
from pydantic import ValidationError

from icloudpd_web.store.models import Policy, NotificationConfig, AwsConfig


def _valid_kwargs(**overrides):
    base = dict(
        name="family-photos",
        username="user@icloud.com",
        directory=Path("/tmp/out"),
        cron="0 */6 * * *",
        enabled=True,
        timezone=None,
        icloudpd={"album": "All Photos"},
        notifications=NotificationConfig(),
        aws=None,
    )
    base.update(overrides)
    return base


def test_policy_valid():
    p = Policy(**_valid_kwargs())
    assert p.name == "family-photos"
    assert p.next_run_at is None
    assert p.last_run is None


def test_policy_name_must_be_slug():
    with pytest.raises(ValidationError):
        Policy(**_valid_kwargs(name="not a slug!"))


def test_policy_rejects_invalid_cron():
    with pytest.raises(ValidationError):
        Policy(**_valid_kwargs(cron="not a cron"))


def test_policy_rejects_bad_timezone():
    with pytest.raises(ValidationError):
        Policy(**_valid_kwargs(timezone="Nowhere/Nope"))


def test_notification_defaults():
    n = NotificationConfig()
    assert n.on_start is False
    assert n.on_success is True
    assert n.on_failure is True


def test_aws_requires_bucket_when_enabled():
    with pytest.raises(ValidationError):
        AwsConfig(enabled=True, bucket=None, prefix="", region="us-east-1")
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/store/test_models.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `models.py`**

`src/icloudpd_web/store/models.py`:

```python
from __future__ import annotations

import re
import zoneinfo
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from croniter import croniter
from pydantic import BaseModel, Field, field_validator, model_validator

SLUG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")


class NotificationConfig(BaseModel):
    on_start: bool = False
    on_success: bool = True
    on_failure: bool = True


class AwsConfig(BaseModel):
    enabled: bool = False
    bucket: str | None = None
    prefix: str = ""
    region: str | None = None

    @model_validator(mode="after")
    def _check(self) -> "AwsConfig":
        if self.enabled and not self.bucket:
            raise ValueError("aws.bucket is required when aws.enabled is true")
        return self


class RunSummary(BaseModel):
    run_id: str
    started_at: datetime
    ended_at: datetime | None
    status: Literal["running", "success", "failed", "stopped"]
    exit_code: int | None = None


class Policy(BaseModel):
    name: str
    username: str
    directory: Path
    cron: str
    enabled: bool = True
    timezone: str | None = None
    icloudpd: dict[str, Any] = Field(default_factory=dict)
    notifications: NotificationConfig = Field(default_factory=NotificationConfig)
    aws: AwsConfig | None = None

    # Derived / runtime; not on disk.
    next_run_at: datetime | None = None
    last_run: RunSummary | None = None

    @field_validator("name")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError(f"name must be a slug: {v!r}")
        return v

    @field_validator("cron")
    @classmethod
    def _cron(cls, v: str) -> str:
        try:
            croniter(v)
        except Exception as e:
            raise ValueError(f"invalid cron: {e}") from e
        return v

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            zoneinfo.ZoneInfo(v)
        except Exception as e:
            raise ValueError(f"unknown timezone: {v}") from e
        return v

    def to_toml_dict(self) -> dict[str, Any]:
        """The subset of fields persisted to TOML (no derived state)."""
        d = self.model_dump(
            exclude={"next_run_at", "last_run"},
            exclude_none=True,
            mode="json",
        )
        d["directory"] = str(self.directory)
        return d
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/store/test_models.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/store/models.py tests/store/test_models.py
git commit -m "feat(store): add Policy, NotificationConfig, AwsConfig, RunSummary models"
```

---

## Task 2: Secrets store

**Files:**
- Create: `src/icloudpd_web/store/secrets.py`
- Create: `tests/store/test_secrets.py`

- [ ] **Step 1: Write failing tests**

`tests/store/test_secrets.py`:

```python
import os
import stat
import pytest
from pathlib import Path

from icloudpd_web.store.secrets import SecretStore


def test_set_and_get(tmp_path: Path):
    s = SecretStore(tmp_path)
    s.set("policy-a", "hunter2")
    assert s.get("policy-a") == "hunter2"


def test_get_missing_returns_none(tmp_path: Path):
    s = SecretStore(tmp_path)
    assert s.get("nope") is None


def test_mode_is_0600(tmp_path: Path):
    s = SecretStore(tmp_path)
    s.set("p", "x")
    mode = stat.S_IMODE(os.stat(tmp_path / "p.password").st_mode)
    assert mode == 0o600


def test_delete(tmp_path: Path):
    s = SecretStore(tmp_path)
    s.set("p", "x")
    s.delete("p")
    assert s.get("p") is None


def test_delete_missing_ok(tmp_path: Path):
    s = SecretStore(tmp_path)
    s.delete("nope")  # must not raise
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/store/test_secrets.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/store/secrets.py`:

```python
from __future__ import annotations

import os
from pathlib import Path


class SecretStore:
    def __init__(self, dir: Path):
        self._dir = dir
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        return self._dir / f"{name}.password"

    def set(self, name: str, value: str) -> None:
        path = self._path(name)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, value.encode("utf-8"))
        finally:
            os.close(fd)
        os.chmod(path, 0o600)

    def get(self, name: str) -> str | None:
        path = self._path(name)
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")

    def delete(self, name: str) -> None:
        path = self._path(name)
        if path.exists():
            path.unlink()
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/store/test_secrets.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/store/secrets.py tests/store/test_secrets.py
git commit -m "feat(store): add SecretStore with 0600 file mode"
```

---

## Task 3: PolicyStore

**Files:**
- Create: `src/icloudpd_web/store/policy_store.py`
- Create: `tests/store/test_policy_store.py`

- [ ] **Step 1: Write failing tests**

`tests/store/test_policy_store.py`:

```python
import asyncio
import pytest
from pathlib import Path

from icloudpd_web.store.models import Policy, NotificationConfig
from icloudpd_web.store.policy_store import PolicyStore


def _policy(name="p", **over) -> Policy:
    base = dict(
        name=name,
        username="u@icloud.com",
        directory=Path("/tmp/out"),
        cron="0 */6 * * *",
        enabled=True,
        icloudpd={"album": "All Photos"},
        notifications=NotificationConfig(),
        aws=None,
    )
    base.update(over)
    return Policy(**base)


@pytest.fixture
def store(tmp_path: Path) -> PolicyStore:
    s = PolicyStore(tmp_path)
    s.load()
    return s


def test_empty_on_fresh_dir(store: PolicyStore):
    assert store.all() == []
    assert store.generation == 0


def test_put_creates_file(store: PolicyStore, tmp_path: Path):
    store.put(_policy("a"))
    assert (tmp_path / "a.toml").is_file()
    assert store.generation == 1
    assert [p.name for p in store.all()] == ["a"]


def test_put_replaces_existing(store: PolicyStore):
    store.put(_policy("a"))
    store.put(_policy("a", username="other@icloud.com"))
    assert store.get("a").username == "other@icloud.com"
    assert store.generation == 2


def test_delete(store: PolicyStore, tmp_path: Path):
    store.put(_policy("a"))
    store.delete("a")
    assert store.get("a") is None
    assert not (tmp_path / "a.toml").exists()


def test_load_reads_existing_files(tmp_path: Path):
    s1 = PolicyStore(tmp_path)
    s1.load()
    s1.put(_policy("a"))
    s1.put(_policy("b"))
    s2 = PolicyStore(tmp_path)
    s2.load()
    assert sorted(p.name for p in s2.all()) == ["a", "b"]


def test_atomic_write_survives_crash_midway(tmp_path: Path, monkeypatch):
    """Simulate a crash after temp file is written but before rename."""
    s = PolicyStore(tmp_path)
    s.load()
    s.put(_policy("a"))
    orig = (tmp_path / "a.toml").read_text()

    # Monkeypatch os.replace to raise after temp file exists.
    import os as _os
    real_replace = _os.replace

    def boom(src, dst):
        raise RuntimeError("boom")

    monkeypatch.setattr(_os, "replace", boom)
    with pytest.raises(RuntimeError):
        s.put(_policy("a", username="new@icloud.com"))
    monkeypatch.setattr(_os, "replace", real_replace)

    # Reload: original preserved.
    s2 = PolicyStore(tmp_path)
    s2.load()
    assert s2.get("a").to_toml_dict() == s.get("a").to_toml_dict()
    # Verify temp files were cleaned up.
    assert not any(p.name.endswith(".tmp") for p in tmp_path.iterdir())


def test_generation_bump_on_mutation(store: PolicyStore):
    g0 = store.generation
    store.put(_policy("a"))
    assert store.generation == g0 + 1
    store.put(_policy("b"))
    assert store.generation == g0 + 2
    store.delete("a")
    assert store.generation == g0 + 3


@pytest.mark.asyncio
async def test_concurrent_puts_no_corruption(tmp_path: Path):
    s = PolicyStore(tmp_path)
    s.load()
    await asyncio.gather(*[
        asyncio.to_thread(s.put, _policy(f"p{i}"))
        for i in range(20)
    ])
    s2 = PolicyStore(tmp_path)
    s2.load()
    assert len(s2.all()) == 20


def test_invalid_toml_file_is_skipped_with_warning(tmp_path: Path, caplog):
    (tmp_path / "broken.toml").write_text("this is = not [ valid")
    s = PolicyStore(tmp_path)
    s.load()
    assert s.all() == []
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/store/test_policy_store.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement PolicyStore**

`src/icloudpd_web/store/policy_store.py`:

```python
from __future__ import annotations

import logging
import os
import threading
import tomllib
from pathlib import Path
from typing import Any

import tomli_w  # type: ignore[import-not-found]

from .models import AwsConfig, NotificationConfig, Policy

log = logging.getLogger(__name__)


def _install_tomli_w_fallback() -> Any:
    # Python 3.12 ships tomllib (read-only). For writing TOML we use a minimal
    # inline serializer to avoid adding a dep.
    return None


def _dump_toml(data: dict[str, Any]) -> bytes:
    """Minimal TOML writer covering our schema (scalars, arrays, nested tables)."""
    import io

    buf = io.StringIO()

    def is_table(v: Any) -> bool:
        return isinstance(v, dict)

    def write_scalar(v: Any) -> str:
        if isinstance(v, bool):
            return "true" if v else "false"
        if isinstance(v, int):
            return str(v)
        if isinstance(v, float):
            return repr(v)
        if isinstance(v, str):
            esc = v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
            return f'"{esc}"'
        if isinstance(v, list):
            return "[" + ", ".join(write_scalar(x) for x in v) + "]"
        raise TypeError(f"unsupported value for TOML: {type(v).__name__}")

    # Top-level scalars first.
    for k, v in data.items():
        if not is_table(v):
            buf.write(f"{k} = {write_scalar(v)}\n")

    # Then tables.
    for k, v in data.items():
        if is_table(v):
            buf.write(f"\n[{k}]\n")
            for sk, sv in v.items():
                if is_table(sv):
                    continue
                buf.write(f"{sk} = {write_scalar(sv)}\n")
            # Nested tables inside a table (one level).
            for sk, sv in v.items():
                if is_table(sv):
                    buf.write(f"\n[{k}.{sk}]\n")
                    for ssk, ssv in sv.items():
                        buf.write(f"{ssk} = {write_scalar(ssv)}\n")

    return buf.getvalue().encode("utf-8")


class PolicyStore:
    def __init__(self, dir: Path):
        self._dir = dir
        self._dir.mkdir(parents=True, exist_ok=True)
        self._policies: dict[str, Policy] = {}
        self._generation = 0
        self._lock = threading.Lock()

    @property
    def generation(self) -> int:
        return self._generation

    def load(self) -> None:
        with self._lock:
            self._policies.clear()
            for path in sorted(self._dir.glob("*.toml")):
                try:
                    data = tomllib.loads(path.read_text(encoding="utf-8"))
                    p = self._from_toml(data)
                    self._policies[p.name] = p
                except Exception as e:
                    log.warning("skipping invalid policy file %s: %s", path.name, e)

    def all(self) -> list[Policy]:
        with self._lock:
            return list(self._policies.values())

    def get(self, name: str) -> Policy | None:
        with self._lock:
            return self._policies.get(name)

    def put(self, policy: Policy) -> None:
        payload = _dump_toml(policy.to_toml_dict())
        with self._lock:
            path = self._dir / f"{policy.name}.toml"
            tmp = path.with_suffix(".toml.tmp")
            try:
                fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
                try:
                    os.write(fd, payload)
                    os.fsync(fd)
                finally:
                    os.close(fd)
                os.replace(tmp, path)
            except Exception:
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except OSError:
                        pass
                raise
            self._policies[policy.name] = policy
            self._generation += 1

    def delete(self, name: str) -> bool:
        with self._lock:
            if name not in self._policies:
                return False
            path = self._dir / f"{name}.toml"
            if path.exists():
                path.unlink()
            del self._policies[name]
            self._generation += 1
            return True

    def bump(self) -> int:
        """Bump generation without policy change (e.g. run state transition)."""
        with self._lock:
            self._generation += 1
            return self._generation

    @staticmethod
    def _from_toml(data: dict[str, Any]) -> Policy:
        return Policy(
            name=data["name"],
            username=data["username"],
            directory=Path(data["directory"]),
            cron=data["cron"],
            enabled=data.get("enabled", True),
            timezone=data.get("timezone"),
            icloudpd=data.get("icloudpd", {}),
            notifications=NotificationConfig(**data.get("notifications", {})),
            aws=AwsConfig(**data["aws"]) if "aws" in data else None,
        )
```

Remove the `tomli_w` import we don't need:

```python
# Replace the broken import block at top with:
from __future__ import annotations

import logging
import os
import threading
import tomllib
from pathlib import Path
from typing import Any

from .models import AwsConfig, NotificationConfig, Policy

log = logging.getLogger(__name__)
```

(Delete the `import tomli_w` and `_install_tomli_w_fallback` lines.)

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/store/test_policy_store.py -v
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/store/policy_store.py tests/store/test_policy_store.py
git commit -m "feat(store): add PolicyStore with atomic writes and generation counter"
```

---

## Task 4: Errors module

**Files:**
- Create: `src/icloudpd_web/errors.py`
- Create: `tests/test_errors.py`

- [ ] **Step 1: Write failing tests**

`tests/test_errors.py`:

```python
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from icloudpd_web.errors import (
    ApiError,
    ValidationError,
    install_handlers,
    new_error_id,
)


def test_new_error_id_prefix():
    eid = new_error_id()
    assert eid.startswith("srv-")
    assert len(eid) > 4


def test_api_error_response_shape():
    app = FastAPI()
    install_handlers(app)

    @app.get("/boom")
    def boom():
        raise ApiError("nope", status_code=400, error_id=None)

    r = TestClient(app).get("/boom")
    assert r.status_code == 400
    assert r.json() == {"error": "nope", "error_id": None, "field": None}


def test_validation_error_has_field():
    app = FastAPI()
    install_handlers(app)

    @app.get("/v")
    def v():
        raise ValidationError("bad cron", field="cron")

    r = TestClient(app).get("/v")
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "bad cron"
    assert body["field"] == "cron"


def test_unhandled_exception_gets_srv_error_id(caplog):
    app = FastAPI()
    install_handlers(app)

    @app.get("/crash")
    def crash():
        raise RuntimeError("kaboom")

    r = TestClient(app).get("/crash")
    assert r.status_code == 500
    body = r.json()
    assert body["error_id"].startswith("srv-")
    assert body["error"].startswith("Server error")
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/test_errors.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/errors.py`:

```python
from __future__ import annotations

import logging
import secrets
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)


def new_error_id(prefix: str = "srv") -> str:
    return f"{prefix}-{secrets.token_hex(4)}"


class ApiError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        error_id: str | None = None,
        field: str | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_id = error_id
        self.field = field


class ValidationError(ApiError):
    def __init__(self, message: str, *, field: str | None = None):
        super().__init__(message, status_code=422, field=field)


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.message,
                "error_id": exc.error_id,
                "field": exc.field,
            },
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        eid = new_error_id()
        log.exception("unhandled exception %s", eid)
        return JSONResponse(
            status_code=500,
            content={
                "error": f"Server error. Reference: {eid}",
                "error_id": eid,
                "field": None,
            },
        )
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/test_errors.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/errors.py tests/test_errors.py
git commit -m "feat: add error handling with error_id and ApiError types"
```

---

## Task 5: Config (server settings)

**Files:**
- Create: `src/icloudpd_web/config.py`
- Create: `tests/test_config.py`

- [ ] **Step 1: Write failing tests**

`tests/test_config.py`:

```python
import pytest
from pathlib import Path

from icloudpd_web.config import ServerSettings, SettingsStore


def test_defaults():
    s = ServerSettings()
    assert s.apprise.urls == []
    assert s.apprise.on_success is True
    assert s.retention_runs == 10


def test_save_and_load_roundtrip(tmp_path: Path):
    path = tmp_path / "settings.toml"
    store = SettingsStore(path)
    s = store.load()
    s.apprise.urls = ["mailto://x"]
    s.retention_runs = 5
    store.save(s)

    store2 = SettingsStore(path)
    s2 = store2.load()
    assert s2.apprise.urls == ["mailto://x"]
    assert s2.retention_runs == 5


def test_missing_file_returns_defaults(tmp_path: Path):
    store = SettingsStore(tmp_path / "nope.toml")
    s = store.load()
    assert s.apprise.urls == []
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/test_config.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/config.py`:

```python
from __future__ import annotations

import os
import tomllib
from pathlib import Path

from pydantic import BaseModel, Field

from icloudpd_web.store.policy_store import _dump_toml


class AppriseSettings(BaseModel):
    urls: list[str] = Field(default_factory=list)
    on_start: bool = False
    on_success: bool = True
    on_failure: bool = True


class ServerSettings(BaseModel):
    apprise: AppriseSettings = Field(default_factory=AppriseSettings)
    retention_runs: int = 10


class SettingsStore:
    def __init__(self, path: Path):
        self._path = path

    def load(self) -> ServerSettings:
        if not self._path.exists():
            return ServerSettings()
        data = tomllib.loads(self._path.read_text(encoding="utf-8"))
        return ServerSettings(**data)

    def save(self, settings: ServerSettings) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(self._path.suffix + ".tmp")
        payload = _dump_toml(settings.model_dump(mode="json"))
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
        try:
            os.write(fd, payload)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(tmp, self._path)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/test_config.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/config.py tests/test_config.py
git commit -m "feat: add ServerSettings and SettingsStore"
```

---

## Task 6: Auth

**Files:**
- Create: `src/icloudpd_web/auth.py`
- Create: `tests/test_auth.py`

- [ ] **Step 1: Write failing tests**

`tests/test_auth.py`:

```python
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from icloudpd_web.auth import Authenticator, install_session_middleware, require_auth


def test_verify_password_ok():
    a = Authenticator(password_hash=Authenticator.hash("secret"))
    assert a.verify("secret") is True
    assert a.verify("other") is False


def test_require_auth_blocks_unauthed():
    app = FastAPI()
    a = Authenticator(password_hash=Authenticator.hash("secret"))
    install_session_middleware(app, secret="test-session-key")
    app.state.authenticator = a

    @app.get("/x")
    def x(user=Depends(require_auth)):
        return {"ok": True}

    r = TestClient(app).get("/x")
    assert r.status_code == 401


def test_login_then_access():
    app = FastAPI()
    a = Authenticator(password_hash=Authenticator.hash("secret"))
    install_session_middleware(app, secret="test-session-key")
    app.state.authenticator = a

    @app.post("/login")
    def login(body: dict, request):  # type: ignore
        ...

    # Minimal login path for the test: set session explicitly.
    @app.post("/login-helper")
    def login_helper(request):  # type: ignore
        from starlette.requests import Request as _R
        r: _R = request
        r.session["authed"] = True
        return {"ok": True}

    @app.get("/x")
    def x(user=Depends(require_auth)):
        return {"ok": True}

    client = TestClient(app)
    r = client.post("/login-helper")
    assert r.status_code == 200
    r2 = client.get("/x")
    assert r2.status_code == 200
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/test_auth.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/auth.py`:

```python
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from typing import Any

from fastapi import FastAPI, Request
from starlette.middleware.sessions import SessionMiddleware

from icloudpd_web.errors import ApiError


class Authenticator:
    def __init__(self, password_hash: str):
        self._hash = password_hash

    @staticmethod
    def hash(password: str) -> str:
        salt = secrets.token_hex(16)
        h = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return f"scrypt${salt}${h}"

    def verify(self, password: str) -> bool:
        try:
            scheme, salt, h = self._hash.split("$")
            assert scheme == "scrypt"
        except Exception:
            return False
        got = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(got, h)


def install_session_middleware(app: FastAPI, *, secret: str) -> None:
    app.add_middleware(
        SessionMiddleware,
        secret_key=secret,
        session_cookie="icloudpd_web",
        max_age=60 * 60 * 24 * 28,  # 4 weeks
        same_site="lax",
        https_only=False,
    )


def require_auth(request: Request) -> Any:
    if not request.session.get("authed"):
        raise ApiError("Not authenticated", status_code=401)
    return True
```

Remove the over-complex test above; simplify `test_auth.py` to just what we implement. Replace with:

```python
import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from icloudpd_web.auth import Authenticator, install_session_middleware, require_auth
from icloudpd_web.errors import install_handlers


def test_verify_password_ok():
    a = Authenticator(password_hash=Authenticator.hash("secret"))
    assert a.verify("secret") is True
    assert a.verify("other") is False


def _make_app() -> FastAPI:
    app = FastAPI()
    install_handlers(app)
    install_session_middleware(app, secret="test-session-key")

    @app.post("/fake-login")
    def fake_login(request: Request) -> dict:
        request.session["authed"] = True
        return {"ok": True}

    @app.get("/secret")
    def secret(_=Depends(require_auth)) -> dict:
        return {"ok": True}

    return app


def test_require_auth_blocks_unauthed():
    client = TestClient(_make_app())
    r = client.get("/secret")
    assert r.status_code == 401


def test_login_then_access():
    client = TestClient(_make_app())
    assert client.post("/fake-login").status_code == 200
    assert client.get("/secret").status_code == 200
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/test_auth.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/auth.py tests/test_auth.py
git commit -m "feat: add password-hash Authenticator and session auth dependency"
```

---

## Task 7: Fake icloudpd test fixture

**Files:**
- Create: `tests/fixtures/fake_icloudpd.py`
- Create: `tests/conftest.py`

This is the linchpin for runner tests. A small Python script that impersonates the icloudpd CLI we shell out to, with modes controlled by env vars.

- [ ] **Step 1: Create `tests/fixtures/fake_icloudpd.py`**

```python
#!/usr/bin/env python3
"""Fake icloudpd CLI for tests.

Behavior driven by env vars:
  FAKE_ICLOUDPD_MODE: one of 'success', 'fail', 'slow', 'mfa'
  FAKE_ICLOUDPD_TOTAL: default 5
  FAKE_ICLOUDPD_SLEEP: seconds between progress lines (default 0.01)
  FAKE_ICLOUDPD_MFA_CALLBACK: path to a file; when present its first line is the code
"""
from __future__ import annotations

import os
import sys
import time


def main() -> int:
    mode = os.environ.get("FAKE_ICLOUDPD_MODE", "success")
    total = int(os.environ.get("FAKE_ICLOUDPD_TOTAL", "5"))
    sleep = float(os.environ.get("FAKE_ICLOUDPD_SLEEP", "0.01"))

    print("INFO     starting", flush=True)

    if mode == "mfa":
        cb = os.environ.get("FAKE_ICLOUDPD_MFA_CALLBACK", "")
        print("INFO     Two-step authentication required.", flush=True)
        # Block until code appears.
        while True:
            if cb and os.path.isfile(cb):
                code = open(cb).read().strip()
                if code:
                    print(f"INFO     Received MFA code of length {len(code)}", flush=True)
                    break
            time.sleep(0.05)

    if mode == "fail":
        print("ERROR    something went wrong", file=sys.stderr, flush=True)
        return 2

    for i in range(1, total + 1):
        print(f"INFO     Downloading {i} of {total}", flush=True)
        time.sleep(sleep)
        if mode == "slow":
            time.sleep(0.5)

    print("INFO     done", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Create `tests/conftest.py`**

```python
import sys
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fake_icloudpd_cmd() -> list[str]:
    return [sys.executable, str(FIXTURES / "fake_icloudpd.py")]
```

- [ ] **Step 3: Smoke test it runs**

```bash
FAKE_ICLOUDPD_MODE=success uv run python tests/fixtures/fake_icloudpd.py
```

Expected: prints `Downloading 1 of 5` … `Downloading 5 of 5` … `done`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/fake_icloudpd.py tests/conftest.py
git commit -m "test: add fake icloudpd fixture"
```

---

## Task 8: Config builder

**Files:**
- Create: `src/icloudpd_web/runner/config_builder.py`
- Create: `tests/runner/test_config_builder.py`

- [ ] **Step 1: Write failing tests**

`tests/runner/test_config_builder.py`:

```python
from pathlib import Path

from icloudpd_web.runner.config_builder import build_config
from icloudpd_web.store.models import NotificationConfig, Policy


def _p() -> Policy:
    return Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/data/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd={"album": "All Photos", "size": ["original"]},
        notifications=NotificationConfig(),
        aws=None,
    )


def test_build_config_has_username_and_directory():
    cfg = build_config(_p(), password="pw")
    assert "username" in cfg
    assert cfg["username"] == "u@icloud.com"
    assert cfg["directory"] == "/data/p"


def test_build_config_passthrough():
    cfg = build_config(_p(), password="pw")
    assert cfg["album"] == "All Photos"
    assert cfg["size"] == ["original"]


def test_build_config_does_not_include_our_meta():
    cfg = build_config(_p(), password="pw")
    for key in ("cron", "enabled", "notifications", "aws", "timezone", "icloudpd"):
        assert key not in cfg
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/runner/test_config_builder.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/runner/config_builder.py`:

```python
from __future__ import annotations

from typing import Any

from icloudpd_web.store.models import Policy


def build_config(policy: Policy, *, password: str | None) -> dict[str, Any]:
    """Build the config dict passed to icloudpd via --config-file.

    Our meta fields (cron, enabled, notifications, aws, timezone) are never
    forwarded. The [icloudpd] block is flattened into the top level.
    """
    cfg: dict[str, Any] = {}
    cfg["username"] = policy.username
    cfg["directory"] = str(policy.directory)
    # Password is handled separately via env / MFA provider; include here only
    # if supplied (some deployments will rely on the icloudpd keyring instead).
    if password is not None:
        cfg["password"] = password
    cfg.update(policy.icloudpd)
    return cfg
```

Tests will pass because `build_config(..., password="pw")` includes `password` but neither test currently asserts on it — acceptable. Add an extra assertion for password:

Append to the test file:

```python
def test_build_config_includes_password_when_provided():
    cfg = build_config(_p(), password="pw")
    assert cfg["password"] == "pw"


def test_build_config_omits_password_when_none():
    cfg = build_config(_p(), password=None)
    assert "password" not in cfg
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/runner/test_config_builder.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/runner/config_builder.py tests/runner/test_config_builder.py
git commit -m "feat(runner): add policy -> icloudpd config builder"
```

---

## Task 9: Run (subprocess, ring buffer, broadcast)

This is the biggest single module. We'll TDD it against the fake icloudpd.

**Files:**
- Create: `src/icloudpd_web/runner/run.py`
- Create: `tests/runner/test_run.py`

- [ ] **Step 1: Write failing tests**

`tests/runner/test_run.py`:

```python
import asyncio
import re
from pathlib import Path

import pytest

from icloudpd_web.runner.run import Run, RunEvent


@pytest.mark.asyncio
async def test_success_run(tmp_path: Path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

    run = Run(
        run_id="policy-A",
        policy_name="policy",
        argv=fake_icloudpd_cmd,
        log_dir=tmp_path,
    )
    await run.start()
    await run.wait()

    assert run.status == "success"
    assert run.exit_code == 0
    # Log file exists and contains at least one 'Downloading' line.
    log_text = run.log_path.read_text()
    assert "Downloading 1 of 3" in log_text
    assert "done" in log_text


@pytest.mark.asyncio
async def test_fail_run(tmp_path: Path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "fail")
    run = Run(
        run_id="policy-B",
        policy_name="policy",
        argv=fake_icloudpd_cmd,
        log_dir=tmp_path,
    )
    await run.start()
    await run.wait()
    assert run.status == "failed"
    assert run.exit_code == 2
    assert run.error_id == "policy-B"


@pytest.mark.asyncio
async def test_ring_buffer_and_broadcast(tmp_path: Path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

    run = Run(
        run_id="policy-C",
        policy_name="policy",
        argv=fake_icloudpd_cmd,
        log_dir=tmp_path,
    )
    await run.start()

    collected: list[RunEvent] = []
    async def consume():
        async for ev in run.subscribe(since=None):
            collected.append(ev)
            if ev.kind == "status" and ev.data.get("status") in ("success", "failed", "stopped"):
                break

    await asyncio.wait_for(consume(), timeout=5)
    await run.wait()

    kinds = [e.kind for e in collected]
    assert "log" in kinds
    assert "status" in kinds


@pytest.mark.asyncio
async def test_progress_parse(tmp_path: Path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

    run = Run(
        run_id="policy-D",
        policy_name="policy",
        argv=fake_icloudpd_cmd,
        log_dir=tmp_path,
    )
    await run.start()
    await run.wait()
    assert run.progress["downloaded"] == 3
    assert run.progress["total"] == 3


@pytest.mark.asyncio
async def test_stop_run(tmp_path: Path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")

    run = Run(
        run_id="policy-E",
        policy_name="policy",
        argv=fake_icloudpd_cmd,
        log_dir=tmp_path,
    )
    await run.start()
    await asyncio.sleep(0.3)
    await run.stop()
    await run.wait()
    assert run.status == "stopped"


@pytest.mark.asyncio
async def test_sse_resume_from_seq(tmp_path: Path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "5")

    run = Run(
        run_id="policy-F",
        policy_name="policy",
        argv=fake_icloudpd_cmd,
        log_dir=tmp_path,
    )
    await run.start()
    await run.wait()

    # Now subscribe with since=2 from buffered replay.
    seen: list[int] = []
    async for ev in run.subscribe(since=2):
        seen.append(ev.seq)
        if ev.kind == "status":
            break

    assert all(s > 2 for s in seen)
    assert seen == sorted(seen)
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/runner/test_run.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `run.py`**

`src/icloudpd_web/runner/run.py`:

```python
from __future__ import annotations

import asyncio
import collections
import os
import re
import signal
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal

PROGRESS_RE = re.compile(r"Downloading\s+(\d+)\s+of\s+(\d+)", re.IGNORECASE)

RunStatus = Literal["pending", "running", "success", "failed", "stopped"]


@dataclass
class RunEvent:
    seq: int
    kind: Literal["log", "progress", "status"]
    ts: float
    data: dict[str, Any]


class Run:
    BUFFER_CAP = 2000

    def __init__(
        self,
        *,
        run_id: str,
        policy_name: str,
        argv: list[str],
        log_dir: Path,
        env: dict[str, str] | None = None,
    ):
        self.run_id = run_id
        self.policy_name = policy_name
        self._argv = argv
        self._env = env
        self.log_dir = log_dir
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = self.log_dir / f"{run_id}.log"

        self.started_at: datetime | None = None
        self.ended_at: datetime | None = None
        self.status: RunStatus = "pending"
        self.exit_code: int | None = None
        self.error_id: str | None = None
        self.progress: dict[str, Any] = {"downloaded": 0, "total": None}

        self._proc: asyncio.subprocess.Process | None = None
        self._buffer: collections.deque[RunEvent] = collections.deque(maxlen=self.BUFFER_CAP)
        self._seq = 0
        self._subscribers: set[asyncio.Queue[RunEvent | None]] = set()
        self._log_fh = None
        self._done = asyncio.Event()
        self._stopping = False

    # ------------- lifecycle -------------

    async def start(self) -> None:
        self.started_at = datetime.now(timezone.utc)
        self.status = "running"
        self._log_fh = open(self.log_path, "w", encoding="utf-8", buffering=1)
        env = {**os.environ, **(self._env or {})}
        self._proc = await asyncio.create_subprocess_exec(
            *self._argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        assert self._proc.stdout is not None and self._proc.stderr is not None
        asyncio.create_task(self._drain(self._proc.stdout, stream="stdout"))
        asyncio.create_task(self._drain(self._proc.stderr, stream="stderr"))
        asyncio.create_task(self._wait_exit())

    async def stop(self) -> None:
        if self._proc and self._proc.returncode is None:
            self._stopping = True
            try:
                self._proc.send_signal(signal.SIGTERM)
            except ProcessLookupError:
                pass

    async def wait(self) -> None:
        await self._done.wait()

    # ------------- subscription -------------

    async def subscribe(self, *, since: int | None) -> AsyncIterator[RunEvent]:
        """Replay buffered events (filtered by `since`) then tail live.

        If `since` is older than the ring buffer's earliest seq, replay from the
        log file where possible. Closes when the run is complete and all events
        drained.
        """
        q: asyncio.Queue[RunEvent | None] = asyncio.Queue()
        replay = [e for e in self._buffer if since is None or e.seq > since]
        self._subscribers.add(q)
        try:
            for ev in replay:
                yield ev
            while True:
                ev = await q.get()
                if ev is None:
                    return
                if since is not None and ev.seq <= since:
                    continue
                yield ev
        finally:
            self._subscribers.discard(q)

    # ------------- internals -------------

    async def _drain(self, stream: asyncio.StreamReader, *, stream: str) -> None:  # type: ignore[no-redef]
        ...

    async def _drain(self, stream: asyncio.StreamReader, kind: str) -> None:  # noqa: F811
        while True:
            line = await stream.readline()
            if not line:
                return
            text = line.decode("utf-8", errors="replace").rstrip("\n")
            self._emit_log(text)
            self._maybe_progress(text)

    def _emit_log(self, text: str) -> None:
        if self._log_fh is not None:
            self._log_fh.write(text + "\n")
        self._publish("log", {"line": text})

    def _maybe_progress(self, text: str) -> None:
        m = PROGRESS_RE.search(text)
        if not m:
            return
        downloaded = int(m.group(1))
        total = int(m.group(2))
        self.progress = {"downloaded": downloaded, "total": total}
        self._publish("progress", dict(self.progress))

    def _publish(self, kind: str, data: dict[str, Any]) -> None:
        self._seq += 1
        ev = RunEvent(seq=self._seq, kind=kind, ts=time.time(), data=data)  # type: ignore[arg-type]
        self._buffer.append(ev)
        for q in list(self._subscribers):
            try:
                q.put_nowait(ev)
            except asyncio.QueueFull:
                pass

    async def _wait_exit(self) -> None:
        assert self._proc is not None
        code = await self._proc.wait()
        self.exit_code = code
        self.ended_at = datetime.now(timezone.utc)
        if self._stopping:
            self.status = "stopped"
        elif code == 0:
            self.status = "success"
        else:
            self.status = "failed"
            self.error_id = self.run_id
        self._publish(
            "status",
            {"status": self.status, "exit_code": code, "error_id": self.error_id},
        )
        if self._log_fh is not None:
            self._log_fh.close()
            self._log_fh = None
        for q in list(self._subscribers):
            q.put_nowait(None)
        self._done.set()
```

Clean up the typo: there are two `_drain` defs due to an error in earlier draft. Final version of `_drain` only:

Replace lines from the first `async def _drain` through `# noqa: F811` with the single correct definition:

```python
    async def _drain(self, stream: asyncio.StreamReader, kind: str) -> None:
        while True:
            line = await stream.readline()
            if not line:
                return
            text = line.decode("utf-8", errors="replace").rstrip("\n")
            self._emit_log(text)
            self._maybe_progress(text)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/runner/test_run.py -v
```

Expected: 6 passed. If `test_sse_resume_from_seq` fails because `subscribe()` after completion re-iterates the buffer only: that's the intended semantics — the test iterates the replay portion, reaches the final `status` event, exits. Make sure the loop in the test breaks on `status`.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/runner/run.py tests/runner/test_run.py
git commit -m "feat(runner): add Run with subprocess supervision, ring buffer, broadcast"
```

---

## Task 10: Log retention

**Files:**
- Create: `src/icloudpd_web/runner/log_retention.py`
- Create: `tests/runner/test_log_retention.py`

- [ ] **Step 1: Write failing test**

`tests/runner/test_log_retention.py`:

```python
import time
from pathlib import Path

from icloudpd_web.runner.log_retention import prune_logs


def test_keeps_newest_n(tmp_path: Path):
    for i in range(12):
        p = tmp_path / f"policy-{i:02d}.log"
        p.write_text("x")
        # Space out mtimes so ordering is deterministic.
        os_ts = time.time() + i
        import os
        os.utime(p, (os_ts, os_ts))

    kept = prune_logs(tmp_path, keep=10)
    files = sorted(p.name for p in tmp_path.iterdir())
    assert len(files) == 10
    assert "policy-00.log" not in files
    assert "policy-11.log" in files
    assert kept == 10


def test_noop_when_under_limit(tmp_path: Path):
    for i in range(3):
        (tmp_path / f"x{i}.log").write_text("x")
    prune_logs(tmp_path, keep=10)
    assert len(list(tmp_path.iterdir())) == 3


def test_missing_dir_ok(tmp_path: Path):
    prune_logs(tmp_path / "nope", keep=10)
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/runner/test_log_retention.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/runner/log_retention.py`:

```python
from __future__ import annotations

from pathlib import Path


def prune_logs(dir: Path, *, keep: int) -> int:
    if not dir.is_dir():
        return 0
    files = [p for p in dir.iterdir() if p.is_file() and p.suffix == ".log"]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for p in files[keep:]:
        try:
            p.unlink()
        except OSError:
            pass
    return min(len(files), keep)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/runner/test_log_retention.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/runner/log_retention.py tests/runner/test_log_retention.py
git commit -m "feat(runner): add log retention helper"
```

---

## Task 11: MFA provider callback

**Files:**
- Create: `src/icloudpd_web/runner/mfa.py`
- Create: `tests/runner/test_mfa.py`

The callback is a file-backed blocking channel: runner creates an empty file path; web UI writes the code to it via an endpoint; the icloudpd MFA provider script (tiny shell script we generate) reads it. For the CLI contract, we pass an env var to the subprocess naming the path; a wrapper script reads that file and echoes the code.

Deliberately simple, no sockets.

- [ ] **Step 1: Write failing tests**

`tests/runner/test_mfa.py`:

```python
import asyncio
import pytest

from icloudpd_web.runner.mfa import MfaRegistry


@pytest.mark.asyncio
async def test_register_and_deliver(tmp_path):
    reg = MfaRegistry(tmp_path)
    slot = reg.register("policy-A")
    assert slot.path.parent.exists()
    reg.provide("policy-A", "123456")
    assert slot.path.read_text().strip() == "123456"


@pytest.mark.asyncio
async def test_awaiting_flag(tmp_path):
    reg = MfaRegistry(tmp_path)
    reg.register("p")
    assert reg.awaiting("p") is True
    reg.provide("p", "000000")
    assert reg.awaiting("p") is False


def test_cleanup(tmp_path):
    reg = MfaRegistry(tmp_path)
    slot = reg.register("p")
    reg.cleanup("p")
    assert not slot.path.exists()
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/runner/test_mfa.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/runner/mfa.py`:

```python
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class MfaSlot:
    policy_name: str
    path: Path


class MfaRegistry:
    def __init__(self, base: Path):
        self._base = base
        self._base.mkdir(parents=True, exist_ok=True)
        self._slots: dict[str, MfaSlot] = {}

    def register(self, policy_name: str) -> MfaSlot:
        path = self._base / f"{policy_name}.code"
        if path.exists():
            path.unlink()
        slot = MfaSlot(policy_name=policy_name, path=path)
        self._slots[policy_name] = slot
        return slot

    def awaiting(self, policy_name: str) -> bool:
        slot = self._slots.get(policy_name)
        return slot is not None and not slot.path.exists()

    def provide(self, policy_name: str, code: str) -> None:
        slot = self._slots.get(policy_name)
        if slot is None:
            raise KeyError(policy_name)
        fd = os.open(slot.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, code.encode("utf-8") + b"\n")
        finally:
            os.close(fd)

    def cleanup(self, policy_name: str) -> None:
        slot = self._slots.pop(policy_name, None)
        if slot and slot.path.exists():
            slot.path.unlink()
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/runner/test_mfa.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/runner/mfa.py tests/runner/test_mfa.py
git commit -m "feat(runner): add MFA code registry"
```

---

## Task 12: Runner (registry of active runs)

**Files:**
- Create: `src/icloudpd_web/runner/runner.py`
- Create: `tests/runner/test_runner.py`

- [ ] **Step 1: Write failing tests**

`tests/runner/test_runner.py`:

```python
import asyncio
from pathlib import Path

import pytest

from icloudpd_web.runner.runner import Runner
from icloudpd_web.store.models import NotificationConfig, Policy


def _policy() -> Policy:
    return Policy(
        name="p",
        username="u@icloud.com",
        directory=Path("/tmp/p"),
        cron="0 * * * *",
        enabled=True,
        icloudpd={},
        notifications=NotificationConfig(),
        aws=None,
    )


@pytest.mark.asyncio
async def test_start_returns_run(tmp_path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "2")

    r = Runner(
        runs_base=tmp_path,
        icloudpd_argv=lambda cfg_path: [*fake_icloudpd_cmd, "--config-file", str(cfg_path)],
    )
    run = await r.start(_policy(), password=None, trigger="manual")
    await run.wait()
    assert run.status == "success"
    assert r.is_running("p") is False


@pytest.mark.asyncio
async def test_is_running_blocks_duplicate(tmp_path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")

    r = Runner(
        runs_base=tmp_path,
        icloudpd_argv=lambda cfg_path: [*fake_icloudpd_cmd, "--config-file", str(cfg_path)],
    )
    run = await r.start(_policy(), password=None, trigger="manual")
    assert r.is_running("p") is True
    with pytest.raises(RuntimeError):
        await r.start(_policy(), password=None, trigger="manual")
    await run.stop()
    await run.wait()


@pytest.mark.asyncio
async def test_prunes_logs_after_completion(tmp_path, fake_icloudpd_cmd, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")

    r = Runner(
        runs_base=tmp_path,
        icloudpd_argv=lambda cfg_path: [*fake_icloudpd_cmd, "--config-file", str(cfg_path)],
        retention=2,
    )
    for _ in range(4):
        run = await r.start(_policy(), password=None, trigger="manual")
        await run.wait()
    log_files = list((tmp_path / "p").glob("*.log"))
    assert len(log_files) == 2
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/runner/test_runner.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/runner/runner.py`:

```python
from __future__ import annotations

import asyncio
import os
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from icloudpd_web.store.models import Policy
from icloudpd_web.store.policy_store import _dump_toml

from .config_builder import build_config
from .log_retention import prune_logs
from .run import Run


class Runner:
    def __init__(
        self,
        *,
        runs_base: Path,
        icloudpd_argv: Callable[[Path], list[str]],
        retention: int = 10,
        on_run_event: Callable[[Run, str], None] | None = None,
    ):
        self._runs_base = runs_base
        self._argv_fn = icloudpd_argv
        self._retention = retention
        self._on_event = on_run_event or (lambda r, ev: None)
        self._active: dict[str, Run] = {}
        self._by_id: dict[str, Run] = {}
        self._lock = asyncio.Lock()

    def is_running(self, policy_name: str) -> bool:
        run = self._active.get(policy_name)
        return run is not None and run.status == "running"

    def get_run(self, run_id: str) -> Run | None:
        return self._by_id.get(run_id)

    def active_runs(self) -> list[Run]:
        return [r for r in self._active.values() if r.status == "running"]

    async def start(
        self,
        policy: Policy,
        *,
        password: str | None,
        trigger: str,
    ) -> Run:
        async with self._lock:
            if self.is_running(policy.name):
                raise RuntimeError(f"policy {policy.name} already running")
            run_id = _mk_run_id(policy.name)
            log_dir = self._runs_base / policy.name
            log_dir.mkdir(parents=True, exist_ok=True)
            cfg = build_config(policy, password=password)
            cfg_path = log_dir / f"{run_id}.cfg.toml"
            cfg_path.write_bytes(_dump_toml(cfg))
            argv = self._argv_fn(cfg_path)
            run = Run(
                run_id=run_id,
                policy_name=policy.name,
                argv=argv,
                log_dir=log_dir,
            )
            self._active[policy.name] = run
            self._by_id[run_id] = run
            await run.start()
            asyncio.create_task(self._on_complete(run, cfg_path))
            self._on_event(run, "started")
            return run

    async def stop(self, run_id: str) -> bool:
        run = self._by_id.get(run_id)
        if run is None or run.status != "running":
            return False
        await run.stop()
        return True

    async def _on_complete(self, run: Run, cfg_path: Path) -> None:
        await run.wait()
        try:
            cfg_path.unlink()
        except OSError:
            pass
        prune_logs(run.log_dir, keep=self._retention)
        self._on_event(run, "completed")


def _mk_run_id(policy_name: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{policy_name}-{stamp}"
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/runner/test_runner.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/runner/runner.py tests/runner/test_runner.py
git commit -m "feat(runner): add Runner registry with overlap protection and retention"
```

---

## Task 13: Scheduler

**Files:**
- Create: `src/icloudpd_web/scheduler/scheduler.py`
- Create: `tests/scheduler/test_scheduler.py`

- [ ] **Step 1: Write failing tests**

`tests/scheduler/test_scheduler.py`:

```python
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from icloudpd_web.scheduler.scheduler import Scheduler
from icloudpd_web.store.models import NotificationConfig, Policy


class FakeStore:
    def __init__(self, policies: list[Policy]):
        self._policies = policies

    def all(self) -> list[Policy]:
        return list(self._policies)


class FakeRunner:
    def __init__(self):
        self.running: set[str] = set()
        self.fired: list[tuple[str, datetime]] = []

    def is_running(self, name: str) -> bool:
        return name in self.running

    async def start(self, policy: Policy, *, password: Any = None, trigger: str) -> Any:
        self.fired.append((policy.name, datetime.now()))
        return object()


def _p(name: str, cron: str, enabled: bool = True, tz: str | None = None) -> Policy:
    return Policy(
        name=name,
        username="u@icloud.com",
        directory=Path("/tmp/p"),
        cron=cron,
        enabled=enabled,
        timezone=tz,
        icloudpd={},
        notifications=NotificationConfig(),
        aws=None,
    )


def _passwords(_name: str) -> None:
    return None


def test_fires_when_cron_matches():
    store = FakeStore([_p("a", "* * * * *")])
    runner = FakeRunner()
    s = Scheduler(store=store, runner=runner, password_lookup=_passwords)
    now = datetime(2026, 1, 1, 12, 30, 15)
    s.tick(now)
    assert [n for n, _ in runner.fired] == ["a"]


def test_dedupes_within_minute():
    store = FakeStore([_p("a", "* * * * *")])
    runner = FakeRunner()
    s = Scheduler(store=store, runner=runner, password_lookup=_passwords)
    t0 = datetime(2026, 1, 1, 12, 30, 15)
    t1 = datetime(2026, 1, 1, 12, 30, 45)
    s.tick(t0)
    s.tick(t1)
    assert len(runner.fired) == 1


def test_skips_overlap():
    store = FakeStore([_p("a", "* * * * *")])
    runner = FakeRunner()
    runner.running.add("a")
    s = Scheduler(store=store, runner=runner, password_lookup=_passwords)
    s.tick(datetime(2026, 1, 1, 12, 30, 15))
    assert runner.fired == []


def test_skips_disabled():
    store = FakeStore([_p("a", "* * * * *", enabled=False)])
    runner = FakeRunner()
    s = Scheduler(store=store, runner=runner, password_lookup=_passwords)
    s.tick(datetime(2026, 1, 1, 12, 30, 15))
    assert runner.fired == []


def test_next_run_at():
    s = Scheduler(store=FakeStore([]), runner=FakeRunner(), password_lookup=_passwords)
    p = _p("a", "0 * * * *")
    dt = s.next_run_at(p, after=datetime(2026, 1, 1, 12, 30))
    assert dt == datetime(2026, 1, 1, 13, 0)
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/scheduler/test_scheduler.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/scheduler/scheduler.py`:

```python
from __future__ import annotations

import asyncio
import logging
import zoneinfo
from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from croniter import croniter

from icloudpd_web.store.models import Policy

log = logging.getLogger(__name__)


class _StoreProto(Protocol):
    def all(self) -> list[Policy]: ...


class _RunnerProto(Protocol):
    def is_running(self, name: str) -> bool: ...
    async def start(self, policy: Policy, *, password: str | None, trigger: str): ...  # noqa: ANN201


class Scheduler:
    def __init__(
        self,
        *,
        store: _StoreProto,
        runner: _RunnerProto,
        password_lookup: Callable[[str], str | None],
    ):
        self._store = store
        self._runner = runner
        self._password_lookup = password_lookup
        self._last_fired: dict[str, datetime] = {}
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._pending: list[Policy] = []

    # -------- public API --------

    def next_run_at(self, policy: Policy, *, after: datetime) -> datetime:
        return croniter(policy.cron, after).get_next(datetime)

    def tick(self, now: datetime) -> None:
        """Run one tick against the provided wall clock (sync; used in tests)."""
        minute = now.replace(second=0, microsecond=0)
        for p in self._store.all():
            if not p.enabled:
                continue
            if self._runner.is_running(p.name):
                continue
            local_now = self._localize(now, p)
            if not croniter.match(p.cron, local_now.replace(second=0)):
                continue
            if self._last_fired.get(p.name) == minute:
                continue
            self._last_fired[p.name] = minute
            self._pending.append(p)

    async def run_forever(self) -> None:
        while not self._stop.is_set():
            await asyncio.sleep(1)
            try:
                self.tick(datetime.utcnow())
                await self._drain_pending()
            except Exception:
                log.exception("scheduler tick failed")

    def stop(self) -> None:
        self._stop.set()

    # -------- internals --------

    async def _drain_pending(self) -> None:
        while self._pending:
            p = self._pending.pop(0)
            try:
                await self._runner.start(
                    p,
                    password=self._password_lookup(p.name),
                    trigger="cron",
                )
            except Exception:
                log.exception("failed to start scheduled policy %s", p.name)

    @staticmethod
    def _localize(now: datetime, policy: Policy) -> datetime:
        if policy.timezone is None:
            return now
        tz = zoneinfo.ZoneInfo(policy.timezone)
        return now.astimezone(tz)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/scheduler/test_scheduler.py -v
```

Expected: 5 passed.

Note: `test_fires_when_cron_matches` uses `tick` directly but `tick` only stages policies in `_pending`; adjust test assertion to check `s._pending` rather than `runner.fired`. Update the affected tests:

Replace the assertions:

```python
def test_fires_when_cron_matches():
    ...
    s.tick(now)
    assert [p.name for p in s._pending] == ["a"]


def test_dedupes_within_minute():
    ...
    s.tick(t0)
    s.tick(t1)
    assert len(s._pending) == 1
```

And same idea for the overlap / disabled tests (check `s._pending == []`).

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/scheduler/scheduler.py tests/scheduler/test_scheduler.py
git commit -m "feat(scheduler): add cron tick loop with overlap-skip and per-minute dedupe"
```

---

## Task 14: Apprise notifier

**Files:**
- Create: `src/icloudpd_web/integrations/apprise_notifier.py`
- Create: `tests/integrations/test_apprise_notifier.py`

- [ ] **Step 1: Write failing tests**

`tests/integrations/test_apprise_notifier.py`:

```python
from unittest.mock import MagicMock, patch

from icloudpd_web.config import AppriseSettings
from icloudpd_web.integrations.apprise_notifier import AppriseNotifier


def test_empty_urls_no_op():
    n = AppriseNotifier(AppriseSettings())
    n.emit("success", policy_name="p", summary="ok")  # must not raise


def test_emit_respects_event_toggles():
    settings = AppriseSettings(urls=["mailto://x"], on_success=False, on_failure=True)
    with patch("icloudpd_web.integrations.apprise_notifier.apprise.Apprise") as cls:
        inst = MagicMock()
        cls.return_value = inst
        n = AppriseNotifier(settings)
        n.emit("success", policy_name="p", summary="ok")
        inst.notify.assert_not_called()
        n.emit("failure", policy_name="p", summary="boom")
        inst.notify.assert_called_once()


def test_notify_error_never_raises(caplog):
    settings = AppriseSettings(urls=["mailto://x"], on_failure=True)
    with patch("icloudpd_web.integrations.apprise_notifier.apprise.Apprise") as cls:
        inst = MagicMock()
        inst.notify.side_effect = RuntimeError("network down")
        cls.return_value = inst
        n = AppriseNotifier(settings)
        n.emit("failure", policy_name="p", summary="boom")  # must not raise
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/integrations/test_apprise_notifier.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/integrations/apprise_notifier.py`:

```python
from __future__ import annotations

import logging
from typing import Literal

import apprise

from icloudpd_web.config import AppriseSettings

log = logging.getLogger(__name__)

Event = Literal["start", "success", "failure"]


class AppriseNotifier:
    def __init__(self, settings: AppriseSettings):
        self._settings = settings
        self._client: apprise.Apprise | None = None
        self._rebuild()

    def update(self, settings: AppriseSettings) -> None:
        self._settings = settings
        self._rebuild()

    def _rebuild(self) -> None:
        if not self._settings.urls:
            self._client = None
            return
        client = apprise.Apprise()
        for url in self._settings.urls:
            client.add(url)
        self._client = client

    def _enabled_for(self, event: Event) -> bool:
        if event == "start":
            return self._settings.on_start
        if event == "success":
            return self._settings.on_success
        if event == "failure":
            return self._settings.on_failure
        return False

    def emit(self, event: Event, *, policy_name: str, summary: str) -> None:
        if self._client is None:
            return
        if not self._enabled_for(event):
            return
        title = f"[icloudpd-web] {policy_name} {event}"
        try:
            self._client.notify(title=title, body=summary)
        except Exception:
            log.exception("apprise emit failed for %s/%s", policy_name, event)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/integrations/test_apprise_notifier.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/integrations/apprise_notifier.py tests/integrations/test_apprise_notifier.py
git commit -m "feat(integrations): add AppriseNotifier with event toggles and safe errors"
```

---

## Task 15: AWS sync

**Files:**
- Create: `src/icloudpd_web/integrations/aws_sync.py`
- Create: `tests/integrations/test_aws_sync.py`

- [ ] **Step 1: Write failing tests**

`tests/integrations/test_aws_sync.py`:

```python
import sys
from pathlib import Path

import pytest

from icloudpd_web.integrations.aws_sync import AwsSync
from icloudpd_web.store.models import AwsConfig


@pytest.mark.asyncio
async def test_disabled_noop(tmp_path: Path):
    s = AwsSync(argv_fn=lambda *a: ["true"])
    out = await s.run(AwsConfig(enabled=False), source=tmp_path)
    assert out.skipped is True


@pytest.mark.asyncio
async def test_command_success(tmp_path: Path):
    s = AwsSync(argv_fn=lambda src, dst: [sys.executable, "-c", "print('ok')"])
    cfg = AwsConfig(enabled=True, bucket="b", prefix="x", region="us-east-1")
    out = await s.run(cfg, source=tmp_path)
    assert out.skipped is False
    assert out.exit_code == 0
    assert "ok" in out.output


@pytest.mark.asyncio
async def test_command_failure_does_not_raise(tmp_path: Path):
    s = AwsSync(argv_fn=lambda src, dst: [sys.executable, "-c", "import sys; sys.exit(3)"])
    cfg = AwsConfig(enabled=True, bucket="b", prefix="x", region="us-east-1")
    out = await s.run(cfg, source=tmp_path)
    assert out.exit_code == 3
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/integrations/test_aws_sync.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement**

`src/icloudpd_web/integrations/aws_sync.py`:

```python
from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from icloudpd_web.store.models import AwsConfig


@dataclass
class AwsSyncResult:
    skipped: bool
    exit_code: int | None = None
    output: str = ""


class AwsSync:
    def __init__(self, argv_fn: Callable[[str, str], list[str]] | None = None):
        self._argv_fn = argv_fn or _default_argv

    async def run(self, cfg: AwsConfig, *, source: Path) -> AwsSyncResult:
        if not cfg.enabled or not cfg.bucket:
            return AwsSyncResult(skipped=True)
        dest = f"s3://{cfg.bucket}/{cfg.prefix}".rstrip("/")
        argv = self._argv_fn(str(source), dest)
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out_bytes, _ = await proc.communicate()
        return AwsSyncResult(
            skipped=False,
            exit_code=proc.returncode,
            output=out_bytes.decode("utf-8", errors="replace"),
        )


def _default_argv(src: str, dst: str) -> list[str]:
    return ["aws", "s3", "sync", src, dst]
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/integrations/test_aws_sync.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/integrations/aws_sync.py tests/integrations/test_aws_sync.py
git commit -m "feat(integrations): add AwsSync (subprocess wrapper)"
```

---

## Task 16: FastAPI app factory + auth routes

**Files:**
- Create: `src/icloudpd_web/app.py`
- Create: `src/icloudpd_web/api/auth.py`
- Create: `tests/api/test_auth.py`

- [ ] **Step 1: Write failing tests**

`tests/api/test_auth.py`:

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="test-secret-very-long",
    )
    return TestClient(app)


def test_status_unauthenticated(client: TestClient):
    r = client.get("/auth/status")
    assert r.status_code == 200
    assert r.json() == {"authenticated": False}


def test_login_wrong_password(client: TestClient):
    r = client.post("/auth/login", json={"password": "nope"})
    assert r.status_code == 401


def test_login_ok_then_status(client: TestClient):
    assert client.post("/auth/login", json={"password": "pw"}).status_code == 200
    assert client.get("/auth/status").json() == {"authenticated": True}


def test_logout(client: TestClient):
    client.post("/auth/login", json={"password": "pw"})
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/status").json() == {"authenticated": False}
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/api/test_auth.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement app factory and auth router**

`src/icloudpd_web/api/auth.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from icloudpd_web.auth import Authenticator
from icloudpd_web.errors import ApiError

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str


@router.get("/status")
def status(request: Request) -> dict:
    return {"authenticated": bool(request.session.get("authed"))}


@router.post("/login")
def login(body: LoginBody, request: Request) -> dict:
    a: Authenticator = request.app.state.authenticator
    if not a.verify(body.password):
        raise ApiError("Invalid password", status_code=401)
    request.session["authed"] = True
    return {"ok": True}


@router.post("/logout")
def logout(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}
```

`src/icloudpd_web/app.py`:

```python
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from icloudpd_web.api import auth as auth_router
from icloudpd_web.auth import Authenticator, install_session_middleware
from icloudpd_web.errors import install_handlers


def create_app(
    *,
    data_dir: Path,
    authenticator: Authenticator,
    session_secret: str,
) -> FastAPI:
    app = FastAPI(title="icloudpd-web")
    install_handlers(app)
    install_session_middleware(app, secret=session_secret)
    app.state.data_dir = data_dir
    app.state.authenticator = authenticator
    app.include_router(auth_router.router)
    return app
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/api/test_auth.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/app.py src/icloudpd_web/api/auth.py tests/api/test_auth.py
git commit -m "feat(api): add app factory and /auth routes"
```

---

## Task 17: App wiring — PolicyStore, Runner, Scheduler, Settings

We now bolt the components onto the app so subsequent routers can use them.

**Files:**
- Modify: `src/icloudpd_web/app.py`
- Create: `tests/api/test_wiring.py`

- [ ] **Step 1: Write test**

`tests/api/test_wiring.py`:

```python
from pathlib import Path

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


def test_app_has_all_components(tmp_path: Path):
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    assert hasattr(app.state, "policy_store")
    assert hasattr(app.state, "secret_store")
    assert hasattr(app.state, "settings_store")
    assert hasattr(app.state, "runner")
    assert hasattr(app.state, "scheduler")
    assert hasattr(app.state, "notifier")
    assert hasattr(app.state, "mfa_registry")
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/api/test_wiring.py -v
```

- [ ] **Step 3: Update `app.py`**

Replace `create_app` body:

```python
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from icloudpd_web.api import auth as auth_router
from icloudpd_web.auth import Authenticator, install_session_middleware
from icloudpd_web.config import SettingsStore
from icloudpd_web.errors import install_handlers
from icloudpd_web.integrations.apprise_notifier import AppriseNotifier
from icloudpd_web.runner.mfa import MfaRegistry
from icloudpd_web.runner.runner import Runner
from icloudpd_web.scheduler.scheduler import Scheduler
from icloudpd_web.store.policy_store import PolicyStore
from icloudpd_web.store.secrets import SecretStore

ICLOUDPD_BINARY = "icloudpd"


def _default_icloudpd_argv(cfg_path: Path) -> list[str]:
    return [ICLOUDPD_BINARY, "--config-file", str(cfg_path)]


def create_app(
    *,
    data_dir: Path,
    authenticator: Authenticator,
    session_secret: str,
    icloudpd_argv=_default_icloudpd_argv,
) -> FastAPI:
    app = FastAPI(title="icloudpd-web")
    install_handlers(app)
    install_session_middleware(app, secret=session_secret)

    policies_dir = data_dir / "policies"
    runs_dir = data_dir / "runs"
    secrets_dir = data_dir / "secrets"
    mfa_dir = data_dir / "mfa"
    settings_path = data_dir / "settings.toml"

    policy_store = PolicyStore(policies_dir)
    policy_store.load()
    secret_store = SecretStore(secrets_dir)
    settings_store = SettingsStore(settings_path)
    settings = settings_store.load()

    notifier = AppriseNotifier(settings.apprise)
    mfa_registry = MfaRegistry(mfa_dir)

    def _on_run_event(run, event):
        policy_store.bump()
        if event == "completed":
            summary = _summarize(run)
            if run.status == "success":
                notifier.emit("success", policy_name=run.policy_name, summary=summary)
            elif run.status == "failed":
                notifier.emit("failure", policy_name=run.policy_name, summary=summary)

    runner = Runner(
        runs_base=runs_dir,
        icloudpd_argv=icloudpd_argv,
        retention=settings.retention_runs,
        on_run_event=_on_run_event,
    )

    scheduler = Scheduler(
        store=policy_store,
        runner=runner,
        password_lookup=secret_store.get,
    )

    app.state.data_dir = data_dir
    app.state.authenticator = authenticator
    app.state.policy_store = policy_store
    app.state.secret_store = secret_store
    app.state.settings_store = settings_store
    app.state.notifier = notifier
    app.state.mfa_registry = mfa_registry
    app.state.runner = runner
    app.state.scheduler = scheduler

    app.include_router(auth_router.router)
    return app


def _summarize(run) -> str:
    if run.status == "success":
        return f"{run.progress.get('downloaded', 0)} items downloaded"
    return f"exit {run.exit_code}; see log {run.run_id}"
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/api/test_wiring.py -v
```

Expected: 1 passed. Re-run full suite:

```bash
uv run pytest -q
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/app.py tests/api/test_wiring.py
git commit -m "feat(app): wire PolicyStore, Runner, Scheduler, Notifier, MfaRegistry"
```

---

## Task 18: Policies routes

**Files:**
- Create: `src/icloudpd_web/api/policies.py`
- Modify: `src/icloudpd_web/app.py` (include router)
- Create: `tests/api/test_policies.py`

- [ ] **Step 1: Write failing tests**

`tests/api/test_policies.py`:

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    return c


def _policy_body(name="a"):
    return {
        "name": name,
        "username": "u@icloud.com",
        "directory": "/tmp/a",
        "cron": "0 * * * *",
        "enabled": True,
        "icloudpd": {"album": "All Photos"},
        "notifications": {"on_start": False, "on_success": True, "on_failure": True},
        "aws": None,
    }


def test_list_empty(client: TestClient):
    r = client.get("/policies")
    assert r.status_code == 200
    assert r.json() == []


def test_put_then_get(client: TestClient):
    r = client.put("/policies/a", json=_policy_body())
    assert r.status_code == 200
    r2 = client.get("/policies/a")
    assert r2.json()["username"] == "u@icloud.com"


def test_put_invalid_cron(client: TestClient):
    body = _policy_body()
    body["cron"] = "bogus"
    r = client.put("/policies/a", json=body)
    assert r.status_code == 422


def test_put_name_mismatch_rejected(client: TestClient):
    body = _policy_body(name="a")
    r = client.put("/policies/b", json=body)
    assert r.status_code == 422


def test_delete(client: TestClient):
    client.put("/policies/a", json=_policy_body())
    r = client.delete("/policies/a")
    assert r.status_code == 200
    assert client.get("/policies/a").status_code == 404


def test_set_and_delete_password(client: TestClient):
    client.put("/policies/a", json=_policy_body())
    r = client.post("/policies/a/password", json={"password": "hunter2"})
    assert r.status_code == 204
    r2 = client.delete("/policies/a/password")
    assert r2.status_code == 204


def test_requires_auth(tmp_path: Path):
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    c = TestClient(app)
    r = c.get("/policies")
    assert r.status_code == 401
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/api/test_policies.py -v
```

- [ ] **Step 3: Implement router**

`src/icloudpd_web/api/policies.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ValidationError as PydanticValidationError

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError, ValidationError
from icloudpd_web.store.models import Policy

router = APIRouter(prefix="/policies", tags=["policies"], dependencies=[Depends(require_auth)])


class PasswordBody(BaseModel):
    password: str


def _store(request: Request):
    return request.app.state.policy_store


def _secrets(request: Request):
    return request.app.state.secret_store


def _runner(request: Request):
    return request.app.state.runner


def _scheduler(request: Request):
    return request.app.state.scheduler


def _summary(p: Policy, scheduler, runner) -> dict:
    from datetime import datetime
    data = p.model_dump(mode="json")
    data["next_run_at"] = scheduler.next_run_at(p, after=datetime.utcnow()).isoformat() if p.enabled else None
    data["is_running"] = runner.is_running(p.name)
    return data


@router.get("")
def list_policies(request: Request) -> list[dict]:
    store = _store(request)
    return [_summary(p, _scheduler(request), _runner(request)) for p in store.all()]


@router.get("/{name}")
def get_policy(name: str, request: Request) -> dict:
    store = _store(request)
    p = store.get(name)
    if p is None:
        raise ApiError("Policy not found", status_code=404)
    return _summary(p, _scheduler(request), _runner(request))


@router.put("/{name}")
def put_policy(name: str, body: dict, request: Request) -> dict:
    if body.get("name") != name:
        raise ValidationError("name in URL must match body.name", field="name")
    try:
        policy = Policy(**body)
    except PydanticValidationError as e:
        first = e.errors()[0]
        raise ValidationError(first["msg"], field=".".join(str(x) for x in first["loc"])) from None
    _store(request).put(policy)
    return _summary(policy, _scheduler(request), _runner(request))


@router.delete("/{name}")
def delete_policy(name: str, request: Request) -> dict:
    ok = _store(request).delete(name)
    if not ok:
        raise ApiError("Policy not found", status_code=404)
    _secrets(request).delete(name)
    return {"ok": True}


@router.post("/{name}/password", status_code=204)
def set_password(name: str, body: PasswordBody, request: Request) -> Response:
    if _store(request).get(name) is None:
        raise ApiError("Policy not found", status_code=404)
    _secrets(request).set(name, body.password)
    return Response(status_code=204)


@router.delete("/{name}/password", status_code=204)
def delete_password(name: str, request: Request) -> Response:
    _secrets(request).delete(name)
    return Response(status_code=204)
```

Include it in the app:

In `app.py`, add:

```python
from icloudpd_web.api import policies as policies_router
...
app.include_router(policies_router.router)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/api/test_policies.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/api/policies.py src/icloudpd_web/app.py tests/api/test_policies.py
git commit -m "feat(api): add /policies CRUD and password endpoints"
```

---

## Task 19: Runs routes

**Files:**
- Create: `src/icloudpd_web/api/runs.py`
- Modify: `src/icloudpd_web/app.py`
- Create: `tests/api/test_runs.py`

- [ ] **Step 1: Write failing tests**

`tests/api/test_runs.py`:

```python
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "fake_icloudpd.py"


def _argv(cfg_path: Path) -> list[str]:
    return [sys.executable, str(FIXTURE), "--config-file", str(cfg_path)]


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "2")
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
        icloudpd_argv=_argv,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    c.put("/policies/p", json={
        "name": "p",
        "username": "u@icloud.com",
        "directory": "/tmp/p",
        "cron": "0 * * * *",
        "enabled": True,
        "icloudpd": {},
        "notifications": {"on_start": False, "on_success": True, "on_failure": True},
        "aws": None,
    })
    return c


def test_start_run(client: TestClient):
    r = client.post("/policies/p/runs")
    assert r.status_code == 200
    body = r.json()
    assert body["run_id"].startswith("p-")


def test_conflict_when_already_running(client: TestClient, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")
    r = client.post("/policies/p/runs")
    assert r.status_code == 200
    r2 = client.post("/policies/p/runs")
    assert r2.status_code == 409


def test_list_runs_shows_completed(client: TestClient):
    import time
    r = client.post("/policies/p/runs")
    rid = r.json()["run_id"]
    # Wait briefly for completion.
    for _ in range(50):
        if client.get("/policies/p").json()["is_running"] is False:
            break
        time.sleep(0.05)
    r2 = client.get("/policies/p/runs")
    assert r2.status_code == 200
    assert any(x["run_id"] == rid for x in r2.json())
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/api/test_runs.py -v
```

- [ ] **Step 3: Implement router**

`src/icloudpd_web/api/runs.py`:

```python
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError

router = APIRouter(tags=["runs"], dependencies=[Depends(require_auth)])


@router.post("/policies/{name}/runs")
async def start_run(name: str, request: Request) -> dict:
    store = request.app.state.policy_store
    policy = store.get(name)
    if policy is None:
        raise ApiError("Policy not found", status_code=404)
    runner = request.app.state.runner
    if runner.is_running(name):
        raise ApiError("Policy already running", status_code=409)
    password = request.app.state.secret_store.get(name)
    try:
        run = await runner.start(policy, password=password, trigger="manual")
    except RuntimeError as e:
        raise ApiError(str(e), status_code=409) from None
    return {"run_id": run.run_id}


@router.delete("/runs/{run_id}")
async def stop_run(run_id: str, request: Request) -> dict:
    runner = request.app.state.runner
    ok = await runner.stop(run_id)
    if not ok:
        raise ApiError("Run not active", status_code=404)
    return {"ok": True}


@router.get("/policies/{name}/runs")
def list_runs(name: str, request: Request) -> list[dict]:
    runs_dir: Path = request.app.state.data_dir / "runs" / name
    if not runs_dir.is_dir():
        return []
    items = []
    for p in sorted(runs_dir.glob("*.log"), key=lambda x: x.stat().st_mtime, reverse=True):
        items.append({
            "run_id": p.stem,
            "log_size": p.stat().st_size,
            "mtime": p.stat().st_mtime,
        })
    return items


@router.get("/runs/{run_id}/log")
def get_log(run_id: str, request: Request) -> FileResponse:
    policy_name = run_id.rsplit("-", 1)[0]
    path: Path = request.app.state.data_dir / "runs" / policy_name / f"{run_id}.log"
    if not path.is_file():
        raise ApiError("Log not found", status_code=404)
    return FileResponse(path, media_type="text/plain")
```

Register in `app.py`:

```python
from icloudpd_web.api import runs as runs_router
...
app.include_router(runs_router.router)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/api/test_runs.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/api/runs.py src/icloudpd_web/app.py tests/api/test_runs.py
git commit -m "feat(api): add /runs start/stop/list/log endpoints"
```

---

## Task 20: MFA routes

**Files:**
- Create: `src/icloudpd_web/api/mfa.py`
- Modify: `src/icloudpd_web/app.py`
- Create: `tests/api/test_mfa.py`

- [ ] **Step 1: Write failing test**

`tests/api/test_mfa.py`:

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    return c


def test_mfa_status_false_when_none_registered(client: TestClient):
    r = client.get("/policies/p/mfa/status")
    assert r.status_code == 200
    assert r.json() == {"awaiting": False}


def test_mfa_provide_without_registration_404(client: TestClient):
    r = client.post("/policies/p/mfa", json={"code": "000000"})
    assert r.status_code == 404
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/api/test_mfa.py -v
```

- [ ] **Step 3: Implement**

`src/icloudpd_web/api/mfa.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError

router = APIRouter(prefix="/policies", tags=["mfa"], dependencies=[Depends(require_auth)])


class CodeBody(BaseModel):
    code: str


@router.get("/{name}/mfa/status")
def mfa_status(name: str, request: Request) -> dict:
    reg = request.app.state.mfa_registry
    return {"awaiting": reg.awaiting(name)}


@router.post("/{name}/mfa")
def mfa_provide(name: str, body: CodeBody, request: Request) -> dict:
    reg = request.app.state.mfa_registry
    try:
        reg.provide(name, body.code)
    except KeyError:
        raise ApiError("No MFA pending for this policy", status_code=404) from None
    return {"ok": True}
```

Register in `app.py`:

```python
from icloudpd_web.api import mfa as mfa_router
...
app.include_router(mfa_router.router)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/api/test_mfa.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/api/mfa.py src/icloudpd_web/app.py tests/api/test_mfa.py
git commit -m "feat(api): add /policies/{name}/mfa endpoints"
```

---

## Task 21: Settings routes

**Files:**
- Create: `src/icloudpd_web/api/settings.py`
- Modify: `src/icloudpd_web/app.py`
- Create: `tests/api/test_settings.py`

- [ ] **Step 1: Write failing test**

`tests/api/test_settings.py`:

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    return c


def test_get_defaults(client: TestClient):
    r = client.get("/settings")
    assert r.status_code == 200
    body = r.json()
    assert body["apprise"]["urls"] == []
    assert body["retention_runs"] == 10


def test_put_roundtrip(client: TestClient):
    body = {
        "apprise": {"urls": ["mailto://x"], "on_start": False, "on_success": True, "on_failure": True},
        "retention_runs": 5,
    }
    r = client.put("/settings", json=body)
    assert r.status_code == 200
    assert client.get("/settings").json()["retention_runs"] == 5
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/api/test_settings.py -v
```

- [ ] **Step 3: Implement**

`src/icloudpd_web/api/settings.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from icloudpd_web.auth import require_auth
from icloudpd_web.config import ServerSettings

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_auth)])


@router.get("")
def get_settings(request: Request) -> dict:
    store = request.app.state.settings_store
    return store.load().model_dump(mode="json")


@router.put("")
def put_settings(body: ServerSettings, request: Request) -> dict:
    store = request.app.state.settings_store
    store.save(body)
    # Propagate to notifier and runner.
    request.app.state.notifier.update(body.apprise)
    request.app.state.runner._retention = body.retention_runs
    return body.model_dump(mode="json")
```

Register in `app.py`:

```python
from icloudpd_web.api import settings as settings_router
...
app.include_router(settings_router.router)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/api/test_settings.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/api/settings.py src/icloudpd_web/app.py tests/api/test_settings.py
git commit -m "feat(api): add /settings endpoints"
```

---

## Task 22: SSE streams

**Files:**
- Create: `src/icloudpd_web/api/streams.py`
- Modify: `src/icloudpd_web/app.py`
- Create: `tests/api/test_streams.py`

- [ ] **Step 1: Write failing tests**

`tests/api/test_streams.py`:

```python
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "fake_icloudpd.py"


def _argv(cfg_path: Path) -> list[str]:
    return [sys.executable, str(FIXTURE), "--config-file", str(cfg_path)]


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "2")
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
        icloudpd_argv=_argv,
    )
    c = TestClient(app)
    c.post("/auth/login", json={"password": "pw"})
    c.put("/policies/p", json={
        "name": "p",
        "username": "u@icloud.com",
        "directory": "/tmp/p",
        "cron": "0 * * * *",
        "enabled": True,
        "icloudpd": {},
        "notifications": {"on_start": False, "on_success": True, "on_failure": True},
        "aws": None,
    })
    return c


def _parse_sse(text: str) -> list[dict]:
    events = []
    cur = {}
    for line in text.splitlines():
        if not line:
            if cur:
                events.append(cur)
                cur = {}
            continue
        k, _, v = line.partition(": ")
        cur[k] = v
    if cur:
        events.append(cur)
    return events


def test_run_events_stream(client: TestClient):
    rid = client.post("/policies/p/runs").json()["run_id"]
    # Wait for completion.
    import time
    for _ in range(100):
        if client.get("/policies/p").json()["is_running"] is False:
            break
        time.sleep(0.05)
    r = client.get(f"/runs/{rid}/events")
    assert r.status_code == 200
    events = _parse_sse(r.text)
    kinds = [e["event"] for e in events if "event" in e]
    assert "log" in kinds
    assert "status" in kinds
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/api/test_streams.py -v
```

- [ ] **Step 3: Implement**

`src/icloudpd_web/api/streams.py`:

```python
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError

router = APIRouter(tags=["streams"], dependencies=[Depends(require_auth)])


def _sse(event: str, seq: int | None, data) -> bytes:
    lines = []
    if seq is not None:
        lines.append(f"id: {seq}")
    lines.append(f"event: {event}")
    lines.append(f"data: {json.dumps(data)}")
    lines.append("")
    lines.append("")
    return "\n".join(lines).encode("utf-8")


@router.get("/policies/stream")
async def policies_stream(request: Request):
    store = request.app.state.policy_store
    last_id = request.headers.get("last-event-id")
    start_gen = int(last_id) if last_id and last_id.isdigit() else store.generation

    async def gen():
        gen_seen = start_gen
        while True:
            if await request.is_disconnected():
                return
            if store.generation != gen_seen:
                gen_seen = store.generation
                names = [p.name for p in store.all()]
                yield _sse("generation", gen_seen, {"generation": gen_seen, "names": names})
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str, request: Request):
    runner = request.app.state.runner
    run = runner.get_run(run_id)
    if run is None:
        raise ApiError("Run not found", status_code=404)
    last_id = request.headers.get("last-event-id")
    since = int(last_id) if last_id and last_id.isdigit() else None

    async def gen():
        async for ev in run.subscribe(since=since):
            if await request.is_disconnected():
                return
            yield _sse(ev.kind, ev.seq, ev.data)
            if ev.kind == "status":
                return

    return StreamingResponse(gen(), media_type="text/event-stream")
```

Register in `app.py`:

```python
from icloudpd_web.api import streams as streams_router
...
app.include_router(streams_router.router)
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/api/test_streams.py -v
```

Expected: 1 passed. If the test fails because run events exceed TestClient buffering: the test waits for completion then opens the stream, which replays from the ring buffer — that should work. If buffering is an issue, the `StreamingResponse` returns after `status` is emitted.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/api/streams.py src/icloudpd_web/app.py tests/api/test_streams.py
git commit -m "feat(api): add SSE streams for policies and runs"
```

---

## Task 23: CLI entry point

**Files:**
- Create: `src/icloudpd_web/cli.py`
- Create: `src/icloudpd_web/__main__.py`
- Create: `tests/test_cli.py`

- [ ] **Step 1: Write failing test**

`tests/test_cli.py`:

```python
import subprocess
import sys


def test_help_runs():
    r = subprocess.run(
        [sys.executable, "-m", "icloudpd_web", "--help"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0
    assert "--port" in r.stdout


def test_init_password_hashes(tmp_path):
    r = subprocess.run(
        [sys.executable, "-m", "icloudpd_web", "init-password", "hunter2"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0
    assert r.stdout.strip().startswith("scrypt$")
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/test_cli.py -v
```

- [ ] **Step 3: Implement**

`src/icloudpd_web/cli.py`:

```python
from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

from icloudpd_web.auth import Authenticator


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="icloudpd-web")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("init-password").add_argument("password")

    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--data-dir", default=str(Path.home() / ".icloudpd-web"))
    parser.add_argument("--password-hash", default=os.environ.get("ICLOUDPD_WEB_PASSWORD_HASH"))
    parser.add_argument(
        "--session-secret",
        default=os.environ.get("ICLOUDPD_WEB_SESSION_SECRET"),
    )
    args = parser.parse_args(argv)

    if args.cmd == "init-password":
        print(Authenticator.hash(args.password))
        return 0

    if not args.password_hash:
        print("error: provide --password-hash or set ICLOUDPD_WEB_PASSWORD_HASH", file=sys.stderr)
        return 2

    session_secret = args.session_secret or secrets.token_urlsafe(32)

    import uvicorn

    from icloudpd_web.app import create_app

    app = create_app(
        data_dir=Path(args.data_dir),
        authenticator=Authenticator(password_hash=args.password_hash),
        session_secret=session_secret,
    )
    uvicorn.run(app, host=args.host, port=args.port)
    return 0
```

`src/icloudpd_web/__main__.py`:

```python
from icloudpd_web.cli import main

raise SystemExit(main())
```

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/test_cli.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/cli.py src/icloudpd_web/__main__.py tests/test_cli.py
git commit -m "feat: add CLI entry point with init-password"
```

---

## Task 24: Scheduler lifespan + bg task

We need the scheduler to actually run in an asyncio loop when the server is up.

**Files:**
- Modify: `src/icloudpd_web/app.py`
- Create: `tests/test_lifespan.py`

- [ ] **Step 1: Write failing test**

`tests/test_lifespan.py`:

```python
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


def test_scheduler_task_started_on_enter(tmp_path: Path):
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    with TestClient(app) as c:
        assert app.state.scheduler_task is not None
        assert not app.state.scheduler_task.done()
    # After exit, task is cancelled.
    assert app.state.scheduler_task.done()
```

- [ ] **Step 2: Run and confirm failure**

```bash
uv run pytest tests/test_lifespan.py -v
```

- [ ] **Step 3: Wire lifespan in `create_app`**

Replace the `app = FastAPI(title=...)` line with:

```python
from contextlib import asynccontextmanager
import asyncio

@asynccontextmanager
async def lifespan(app):
    app.state.scheduler_task = asyncio.create_task(app.state.scheduler.run_forever())
    try:
        yield
    finally:
        app.state.scheduler.stop()
        app.state.scheduler_task.cancel()
        try:
            await app.state.scheduler_task
        except (asyncio.CancelledError, Exception):
            pass

app = FastAPI(title="icloudpd-web", lifespan=lifespan)
```

Since `lifespan` references `app.state.scheduler` which isn't set until after construction, move the `scheduler_task = None` placeholder up and create the task in lifespan **after** assignment. The wiring above already sets `app.state.scheduler` before the app starts handling requests (it's set synchronously in `create_app`), so `lifespan` will find it.

- [ ] **Step 4: Run and confirm pass**

```bash
uv run pytest tests/test_lifespan.py -v
uv run pytest -q
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/icloudpd_web/app.py tests/test_lifespan.py
git commit -m "feat(app): start/stop scheduler via lifespan"
```

---

## Task 25: Integration smoke test

**Files:**
- Create: `tests/test_smoke.py`

- [ ] **Step 1: Write the test**

`tests/test_smoke.py`:

```python
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "fake_icloudpd.py"


def _argv(cfg_path: Path) -> list[str]:
    return [sys.executable, str(FIXTURE), "--config-file", str(cfg_path)]


@pytest.mark.smoke
def test_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
        icloudpd_argv=_argv,
    )
    with TestClient(app) as c:
        c.post("/auth/login", json={"password": "pw"})
        c.put("/policies/p", json={
            "name": "p",
            "username": "u@icloud.com",
            "directory": "/tmp/p",
            "cron": "0 * * * *",
            "enabled": True,
            "icloudpd": {},
            "notifications": {"on_start": False, "on_success": True, "on_failure": True},
            "aws": None,
        })
        rid = c.post("/policies/p/runs").json()["run_id"]
        for _ in range(100):
            if c.get("/policies/p").json()["is_running"] is False:
                break
            time.sleep(0.05)
        runs = c.get("/policies/p/runs").json()
        assert any(r["run_id"] == rid for r in runs)
        log = c.get(f"/runs/{rid}/log").text
        assert "Downloading 1 of 3" in log
```

Configure marker in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
markers = ["smoke: end-to-end smoke tests"]
```

- [ ] **Step 2: Run it**

```bash
uv run pytest tests/test_smoke.py -v
```

Expected: 1 passed.

- [ ] **Step 3: Full suite green**

```bash
uv run pytest -q
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/test_smoke.py pyproject.toml
git commit -m "test: add end-to-end smoke test"
```

---

## Task 26: Lint + type check

**Files:**
- Modify: `ruff.toml` (if needed)
- Create: GitHub Actions workflow placeholder (optional)

- [ ] **Step 1: Run ruff**

```bash
uv run ruff check src tests
uv run ruff format --check src tests
```

Fix any reported issues.

- [ ] **Step 2: Run ty**

```bash
uv run ty check src
```

Fix any reported issues. If `ty` is not yet ready for strict use, skip and document in the commit message.

- [ ] **Step 3: Commit cleanups**

```bash
git add -A
git commit -m "chore: ruff/ty cleanup"
```

---

## Task 27: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite "Usage" and "Architecture" sections**

Replace relevant sections with:

```markdown
## Installation

\`\`\`bash
pipx install icloudpd-web
\`\`\`

## First run

\`\`\`bash
# Generate a password hash
export ICLOUDPD_WEB_PASSWORD_HASH=$(icloudpd-web init-password mysecret)
export ICLOUDPD_WEB_SESSION_SECRET=$(openssl rand -hex 32)
icloudpd-web --host 0.0.0.0 --port 8080
\`\`\`

## Architecture

- FastAPI backend, REST + SSE.
- icloudpd is run as a subprocess (no library-level coupling).
- Policies stored as per-file TOML in \`~/.icloudpd-web/policies/\`.
- Single-user auth: password hash via env var, set server-side only.
- Scheduler uses cron expressions; overlapping runs are skipped.
```

(Keep other sections as-is.)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for redesigned backend"
```

---

## Self-review checklist (complete before handing off)

- [ ] Spec section mapped to tasks:
  - Data model → Tasks 1, 5 (models + settings)
  - PolicyStore → Task 3
  - Secrets → Task 2
  - Runner + subprocess + ring buffer + progress → Tasks 7–9
  - Log retention → Task 10
  - MFA → Task 11, 20
  - Scheduler → Task 13, 24
  - Apprise → Task 14
  - AWS → Task 15
  - Auth → Tasks 6, 16
  - Errors → Task 4
  - REST API (policies/runs/mfa/settings) → Tasks 18–21
  - SSE streams → Task 22
  - CLI → Task 23
  - Smoke → Task 25
  - Packaging (README/pyproject) → Task 0, 27
- [ ] No TODOs, TBDs, or hand-waved steps remain.
- [ ] All test code is concrete (no "write tests for X" without code).
- [ ] All code steps show the actual code.
