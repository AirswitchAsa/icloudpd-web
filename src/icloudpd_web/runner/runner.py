from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

import tomli_w

from icloudpd_web.store.models import Policy

from .config_builder import build_config
from .log_retention import prune_logs
from .run import Run


if TYPE_CHECKING:
    from .mfa import MfaRegistry


class Runner:
    def __init__(
        self,
        *,
        runs_base: Path,
        icloudpd_argv: Callable[[Path], list[str]],
        retention: int = 10,
        on_run_event: Callable[[Run, str], None] | None = None,
        mfa_registry: MfaRegistry | None = None,
    ) -> None:
        self._runs_base = runs_base
        self._argv_fn = icloudpd_argv
        self._retention = retention
        self._on_event = on_run_event or (lambda r, ev: None)
        self._mfa_registry = mfa_registry
        self._active: dict[str, Run] = {}
        self._by_id: dict[str, Run] = {}
        self._lock = asyncio.Lock()
        # Remove any stale cfg.toml files left over from a prior crashed run.
        if self._runs_base.exists():
            for stale in self._runs_base.glob("*/*.cfg.toml"):
                with contextlib.suppress(OSError):
                    stale.unlink()

    def is_running(self, name: str) -> bool:
        run = self._active.get(name)
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
            cfg_path.write_bytes(tomli_w.dumps(cfg).encode("utf-8"))
            argv = self._argv_fn(cfg_path)

            on_mfa_needed = None
            if self._mfa_registry is not None:
                reg = self._mfa_registry

                def on_mfa_needed(pname: str) -> Path:  # noqa: E306
                    return reg.register(pname).path

            run = Run(
                run_id=run_id,
                policy_name=policy.name,
                argv=argv,
                log_dir=log_dir,
                on_mfa_needed=on_mfa_needed,
            )
            self._active[policy.name] = run
            self._by_id[run_id] = run
            try:
                await run.start()
            finally:
                # Config contains the password; unlink immediately after the subprocess
                # has been spawned. icloudpd loads --config-file at startup so removing
                # the path now is safe.
                with contextlib.suppress(FileNotFoundError, OSError):
                    cfg_path.unlink()
            asyncio.create_task(self._on_complete(run))
            self._on_event(run, "started")
            return run

    async def stop(self, run_id: str) -> bool:
        run = self._by_id.get(run_id)
        if run is None or run.status != "running":
            return False
        await run.stop()
        return True

    async def _on_complete(self, run: Run) -> None:
        await run.wait()
        if self._mfa_registry is not None:
            with contextlib.suppress(Exception):
                self._mfa_registry.cleanup(run.policy_name)
        prune_logs(run.log_dir, keep=self._retention)
        self._on_event(run, "completed")


def _mk_run_id(policy_name: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
    return f"{policy_name}-{stamp}"
