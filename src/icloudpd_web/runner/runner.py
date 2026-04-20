from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from icloudpd_web.store.models import Policy

from .config_builder import build_argv
from .folder_structure import check_or_raise as _folder_check
from .log_retention import prune_logs
from .run import Run


if TYPE_CHECKING:
    from .mfa import MfaRegistry


class Runner:
    def __init__(
        self,
        *,
        runs_base: Path,
        icloudpd_argv: Callable[[list[str]], list[str]],
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
        # Resolved shared-library names keyed by policy name. Populated on
        # first discovery per backend-process lifetime; cleared on restart.
        self._shared_lib_cache: dict[str, str] = {}

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
        if password is None:
            raise ValueError(
                f"password is required to start policy {policy.name!r}; "
                "set a password via the secrets API first"
            )
        # Guard against folder-structure drift before spending any time on
        # auth. If the target directory already has a .folderstructure that
        # disagrees with the policy, refuse to start.
        _folder_check(policy.directory, policy.icloudpd.get("folder_structure"))
        # Resolve library_kind BEFORE taking the lock, since resolution for
        # "shared" spawns a transient discovery subprocess that claims _active
        # itself. After it completes the slot is freed and we can claim it
        # again for the download.
        resolved_library = await self._resolve_library_kind(policy, password)
        effective_policy = policy
        if resolved_library is not None:
            effective_policy = policy.model_copy(
                update={"icloudpd": {**policy.icloudpd, "library": resolved_library}}
            )
        async with self._lock:
            if self.is_running(policy.name):
                raise RuntimeError(f"policy {policy.name} already running")
            run_id = _mk_run_id(policy.name)
            log_dir = self._runs_base / policy.name
            log_dir.mkdir(parents=True, exist_ok=True)

            argv_tail = build_argv(effective_policy)
            argv = self._argv_fn(argv_tail)

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
                password=password,
                on_mfa_needed=on_mfa_needed,
                filters=policy.filters if not policy.filters.is_empty() else None,
                dry_run=bool(policy.icloudpd.get("dry_run", False)),
                target_directory=policy.directory,
                folder_structure_pattern=policy.icloudpd.get("folder_structure"),
            )
            self._active[policy.name] = run
            self._by_id[run_id] = run
            await run.start()
            asyncio.create_task(self._on_complete(run))
            self._on_event(run, "started")
            return run

    async def _resolve_library_kind(self, policy: Policy, password: str) -> str | None:
        """Translate policy.library_kind into an icloudpd library identifier.

        Returns None if kind is unset (caller falls back to whatever's in
        policy.icloudpd.library). For "shared", runs one discovery subprocess
        per backend-process lifetime and memoizes the answer.
        """
        if policy.library_kind is None:
            return None
        if policy.library_kind == "personal":
            return "PrimarySync"
        if policy.library_kind == "shared":
            cached = self._shared_lib_cache.get(policy.name)
            if cached:
                return cached
            names = await self.discover_libraries(policy, password=password)
            shared = [n for n in names if n != "PrimarySync"]
            if not shared:
                raise RuntimeError(
                    "No shared library found on this iCloud account. "
                    "Switch back to Personal library."
                )
            resolved = shared[0]
            self._shared_lib_cache[policy.name] = resolved
            return resolved
        return None

    async def stop(self, run_id: str) -> bool:
        run = self._by_id.get(run_id)
        if run is None or run.status != "running":
            return False
        await run.stop()
        return True

    async def discover_libraries(
        self,
        policy: Policy,
        *,
        password: str,
        timeout: float = 180.0,
    ) -> list[str]:
        """Spawn `icloudpd --list-libraries` for this policy and return the
        discovered library identifiers.

        Reuses the normal Run pipeline so password/MFA flow is identical to a
        download: if 2FA is needed mid-discovery, the usual MFA modal will
        appear on the policy row. When the subprocess exits, we parse the log
        file for bare library names.
        """
        from .list_libraries import parse_library_names

        if password is None:
            raise ValueError("password required for library discovery")
        async with self._lock:
            if self.is_running(policy.name):
                raise RuntimeError(f"policy {policy.name} already running")
            run_id = _mk_run_id(policy.name)
            log_dir = self._runs_base / policy.name
            log_dir.mkdir(parents=True, exist_ok=True)

            argv_tail = [
                "--username",
                policy.username,
                "--directory",
                str(policy.directory),
                "--password-provider",
                "console",
                "--mfa-provider",
                "console",
                "--list-libraries",
            ]
            argv = self._argv_fn(argv_tail)

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
                password=password,
                on_mfa_needed=on_mfa_needed,
                filters=None,
            )
            self._active[policy.name] = run
            self._by_id[run_id] = run
            await run.start()
            asyncio.create_task(self._on_complete(run))
            self._on_event(run, "started")

        try:
            await asyncio.wait_for(run.wait(), timeout=timeout)
        except TimeoutError:
            await run.stop()
            raise RuntimeError("library discovery timed out") from None

        if run.exit_code != 0:
            raise RuntimeError(
                f"library discovery failed (exit {run.exit_code}); check the run log"
            )

        return parse_library_names(run.log_path.read_text(encoding="utf-8", errors="replace"))

    async def _on_complete(self, run: Run) -> None:
        await run.wait()
        if self._mfa_registry is not None:
            with contextlib.suppress(Exception):
                self._mfa_registry.cleanup(run.policy_name)
        prune_logs(run.log_dir, keep=self._retention)
        self._on_event(run, "completed")


def _mk_run_id(policy_name: str) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S_%fZ")
    return f"{policy_name}-{stamp}"
