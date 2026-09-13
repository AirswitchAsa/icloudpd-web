from __future__ import annotations

import asyncio
import collections
import contextlib
import json
import os
import re
import shlex
import signal
import time
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal  # noqa: UP035


if TYPE_CHECKING:
    from icloudpd_web.store.models import Filters


PROGRESS_RE = re.compile(r"Downloading\s+(\d+)\s+of\s+(\d+)", re.IGNORECASE)
# Anchor MFA detection on the exact prompt lines real icloudpd 1.32.3 emits.
# A loose "two.?factor" match would also fire on the post-success banner
# ("...the two-factor authentication expires.") and the rejection error
# ("Failed to verify two-factor authentication code"), re-opening the modal
# after every successful interactive 2FA.
MFA_PROMPT_2FA_RE = re.compile(r"Two-factor authentication is required \(2fa\)")
# Legacy two-step auth prompts for a trusted-device INDEX and loops on
# input(); a single 6-digit code can never answer it, so it is unsupported.
MFA_PROMPT_2SA_RE = re.compile(r"Two-step authentication is required \(2sa\)")
# Real 1.32.3 logs this and exits 1 on a rejected code (no console re-prompt).
MFA_REJECTED_RE = re.compile(r"Failed to verify two-factor authentication code")
# Wrong stored iCloud password: every retry risks an Apple lockout, so this
# must surface as a distinct failure instead of a generic "exit 1".
BAD_PASSWORD_RE = re.compile(r"Invalid email/password combination")
_TS_PREFIX_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\s")
# Match icloudpd's "Downloaded <path>" line anywhere on the line — real
# output is timestamp-prefixed ("2026-04-20 11:17:10 INFO     Downloaded ...").
DOWNLOADED_RE = re.compile(r"INFO\s+Downloaded\s+(.+?)\s*$")

RunStatus = Literal["pending", "running", "success", "failed", "stopped", "awaiting_mfa"]
RunEventKind = Literal["log", "progress", "status"]


@dataclass
class RunEvent:
    seq: int
    kind: RunEventKind
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
        password: str | None = None,
        env: dict[str, str] | None = None,
        on_mfa_needed: Callable[[str], Path] | None = None,
        filters: Filters | None = None,
        dry_run: bool = False,
        # For the folder-structure sentinel written on first success.
        target_directory: Path | None = None,
        folder_structure_pattern: str | None = None,
        # How long to wait for a 2FA code before failing the run. None
        # disables the timeout (used by some tests).
        mfa_timeout: float | None = 600.0,
    ) -> None:
        self.run_id = run_id
        self.policy_name = policy_name
        self._argv = argv
        self._password = password
        self._env = env
        self._on_mfa_needed = on_mfa_needed
        self._filters = filters
        self._dry_run = dry_run
        self._target_directory = target_directory
        self._folder_structure_pattern = folder_structure_pattern
        self._mfa_timeout = mfa_timeout
        self.log_dir = log_dir
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = self.log_dir / f"{run_id}.log"

        self.started_at: datetime | None = None
        self.ended_at: datetime | None = None
        self.status: RunStatus = "pending"
        self.exit_code: int | None = None
        self.error_id: str | None = None
        # Machine-readable cause for a failed run (e.g. "mfa_timeout");
        # None for ordinary failures.
        self.failure_reason: str | None = None
        self.progress: dict[str, Any] = {"downloaded": 0, "total": None}

        self._proc: asyncio.subprocess.Process | None = None
        self._buffer: collections.deque[RunEvent] = collections.deque(maxlen=self.BUFFER_CAP)
        self._seq = 0
        self._subscribers: set[asyncio.Queue[RunEvent | None]] = set()
        self._log_fh: Any = None
        self._done = asyncio.Event()
        self._stopping = False
        self._mfa_poll_task: asyncio.Task[None] | None = None
        self._filter_tasks: list[asyncio.Task[None]] = []
        self._filter_kept = 0
        self._filter_deleted = 0
        # Parent dirs of files the filter deleted; candidates for empty-dir
        # pruning once the run is over and no more files will be written.
        self._filter_deleted_parents: set[Path] = set()

    async def start(self) -> None:
        self.started_at = datetime.now(UTC)
        self.status = "running"
        self._log_fh = open(self.log_path, "w", encoding="utf-8", buffering=1)  # noqa: SIM115, ASYNC230
        self._emit_log("INFO     [icloudpd-web] Command: " + shlex.join(self._argv))
        # PYTHONUNBUFFERED forces line-buffered stdout/stderr in the child.
        # Without it, icloudpd's output sits in a 4KB buffer (PIPE isn't a tty)
        # and our readline() sees nothing until the process exits.
        env = {**os.environ, "PYTHONUNBUFFERED": "1", **(self._env or {})}
        self._proc = await asyncio.create_subprocess_exec(
            *self._argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            # Detach the child from our controlling terminal: icloudpd's
            # getpass reads /dev/tty when one exists, so a backend started
            # from a terminal would hang forever waiting for the password
            # there instead of reading it from the stdin pipe.
            start_new_session=True,
        )
        assert self._proc.stdout is not None
        assert self._proc.stderr is not None
        assert self._proc.stdin is not None
        # Deliver the password immediately via stdin (--password-provider console).
        if self._password is not None:
            self._proc.stdin.write((self._password + "\n").encode("utf-8"))
            await self._proc.stdin.drain()
        asyncio.create_task(self._drain(self._proc.stdout, "stdout"))
        asyncio.create_task(self._drain(self._proc.stderr, "stderr"))
        asyncio.create_task(self._wait_exit())

    async def stop(self) -> None:
        if self._proc and self._proc.returncode is None:
            self._stopping = True
            with contextlib.suppress(ProcessLookupError):
                self._proc.send_signal(signal.SIGTERM)

    async def wait(self) -> None:
        await self._done.wait()

    async def subscribe(self, *, since: int | None) -> AsyncIterator[RunEvent]:
        q: asyncio.Queue[RunEvent | None] = asyncio.Queue()
        self._subscribers.add(q)
        try:
            # Snapshot the buffer *after* registering so any event fired between
            # snapshot and yield is captured via the queue instead of lost.
            replay = [e for e in self._buffer if since is None or e.seq > since]
            max_replayed = replay[-1].seq if replay else (since or 0)
            for ev in replay:
                yield ev
            # If the run already finished before we subscribed, no new events are coming.
            if self._done.is_set():
                return
            while True:
                ev = await q.get()
                if ev is None:
                    return
                if ev.seq <= max_replayed:
                    continue
                yield ev
        finally:
            self._subscribers.discard(q)

    async def _drain(self, stream: asyncio.StreamReader, kind: str) -> None:
        while True:
            line = await stream.readline()
            if not line:
                return
            text = line.decode("utf-8", errors="replace").rstrip("\n")
            self._emit_log(text)
            self._maybe_progress(text)
            if BAD_PASSWORD_RE.search(text):
                self.failure_reason = "bad_password"
            if kind == "stdout":
                self._maybe_collect_downloaded(text)
                if MFA_REJECTED_RE.search(text):
                    # icloudpd exits right after this line; record the cause
                    # so the terminal status is a distinct mfa_rejected
                    # failure the UI can explain.
                    self.failure_reason = "mfa_rejected"
                elif MFA_PROMPT_2SA_RE.search(text):
                    self._fail_2sa_unsupported()
                elif self._on_mfa_needed and MFA_PROMPT_2FA_RE.search(text):
                    self._trigger_mfa()

    def _maybe_collect_downloaded(self, text: str) -> None:
        m = DOWNLOADED_RE.search(text)
        if not m:
            return
        # Apply filter per-file so deletion happens as soon as possible.
        # Dry-run writes no files, so filter evaluation would fail; skip.
        if self._filters is None or self._filters.is_empty() or self._dry_run:
            return
        path = self._resolve_downloaded_path(m.group(1).strip())
        if path is None:
            return
        # Prune completed tasks so this list doesn't grow unboundedly during
        # a long run (one task per downloaded file).
        self._filter_tasks = [t for t in self._filter_tasks if not t.done()]
        self._filter_tasks.append(asyncio.create_task(self._filter_one(path)))

    def _resolve_downloaded_path(self, raw: str) -> Path | None:
        """Recover the real file path from a "Downloaded" log line.

        icloudpd middle-truncates paths longer than 96 chars with "..." in its
        log output, so the logged path may not exist on disk. Resolve it by
        matching the untruncated tail against files under the target
        directory; skip (with a warning) when that is impossible or ambiguous.
        """
        if "..." not in raw:
            return Path(raw)
        tail = raw.rsplit("...", 1)[-1]
        if self._target_directory is None or not tail:
            self._emit_log(
                f"WARNING  Filter: cannot resolve truncated path {raw!r}; skipping filter"
            )
            return None
        candidates = [
            p for p in self._target_directory.rglob("*") if p.is_file() and str(p).endswith(tail)
        ]
        if len(candidates) != 1:
            self._emit_log(
                f"WARNING  Filter: truncated path {raw!r} matched "
                f"{len(candidates)} files under {self._target_directory}; skipping filter"
            )
            return None
        return candidates[0]

    async def _filter_one(self, path: Path) -> None:
        """Evaluate one downloaded file against the configured filters.

        Runs the blocking EXIF read + unlink in an executor so the drain loop
        stays responsive.
        """
        from icloudpd_web.runner.post_filter import evaluate

        filters = self._filters
        assert filters is not None  # _maybe_filter only schedules us when set
        loop = asyncio.get_running_loop()
        try:
            decision = await loop.run_in_executor(None, evaluate, path, filters)
        except Exception as exc:  # noqa: BLE001
            self._emit_log(f"WARNING  Filter: evaluation failed for {path}: {exc}")
            return
        if decision.kept:
            self._filter_kept += 1
            level = "WARNING " if decision.warning else "INFO    "
            self._emit_log(f"{level} Filter: kept {path} ({decision.reason})")
            return
        try:
            await loop.run_in_executor(None, os.unlink, decision.path)
            self._filter_deleted += 1
            self._filter_deleted_parents.add(decision.path.parent)
            self._emit_log(f"INFO     Filter: deleted {path} ({decision.reason})")
        except OSError as exc:
            self._emit_log(f"WARNING  Filter: could not delete {path}: {exc}")

    def _prune_empty_dirs(self) -> list[Path]:
        """Remove directories left empty by filter deletions.

        Starting from the parent of each deleted file, walk upward removing
        directories with os.rmdir — which refuses to remove a non-empty dir,
        so a folder that still holds kept files (or anything else) stops the
        walk. Bounded by the target directory, which is never removed; without
        a target directory nothing is pruned. Called only after the run has
        exited and all filter tasks finished, so no download can race the
        rmdir.
        """
        if self._target_directory is None or not self._filter_deleted_parents:
            return []
        try:
            root = self._target_directory.resolve()
        except OSError:
            return []
        removed: list[Path] = []
        for parent in self._filter_deleted_parents:
            try:
                cur = parent.resolve()
            except OSError:
                continue
            while cur != root and root in cur.parents:
                try:
                    cur.rmdir()
                except OSError:
                    break  # not empty (or already gone via another branch)
                removed.append(cur)
                cur = cur.parent
        return removed

    def _emit_log(self, text: str) -> None:
        # Prepend a timestamp so our own log lines (filter events, wrapper
        # warnings) match the shape of icloudpd's output, which looks like
        # "2026-04-20 11:17:10 INFO     Downloaded ...". Lines that already
        # start with a YYYY-MM-DD prefix are passed through unchanged.
        if not _TS_PREFIX_RE.match(text):
            stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            text = f"{stamp} {text}"
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

    def _fail_2sa_unsupported(self) -> None:
        """Legacy 2SA is unsupported: stop the run with a clear error.

        icloudpd's 2SA console flow asks for a trusted-device index and loops
        on input() — the single-code slot flow can never answer it, so showing
        the code modal would deadlock the run.
        """
        self.failure_reason = "mfa_2sa_unsupported"
        self._emit_log(
            "ERROR    This account uses legacy two-step authentication (2sa), "
            "which icloudpd-web does not support. Enable two-factor "
            "authentication (2fa) on the account and run again."
        )
        asyncio.create_task(self.stop())

    def _trigger_mfa(self) -> None:
        """Called when the 2FA prompt is detected in stdout.

        Registers a fresh MFA slot, emits awaiting_mfa, and starts a poll task
        that writes the delivered code to stdin. Real icloudpd 1.32.3 never
        re-prompts: a rejected code makes it exit 1 (surfaced as an
        mfa_rejected failure), so at most one prompt fires per run.
        """
        if self._mfa_poll_task is not None and not self._mfa_poll_task.done():
            return  # previous code still being delivered
        assert self._on_mfa_needed is not None
        slot_path = self._on_mfa_needed(self.policy_name)
        self._publish("status", {"status": "awaiting_mfa"})
        self._mfa_poll_task = asyncio.create_task(self._poll_mfa_slot(slot_path))

    async def _poll_mfa_slot(self, slot_path: Path) -> None:
        """Poll the slot file every 100ms. When it appears, write its content to stdin.

        Gives up after the configured MFA timeout: an unattended run (e.g. a
        3am scheduled fire with an expired session) would otherwise hold the
        policy's active slot forever.
        """
        deadline = time.monotonic() + self._mfa_timeout if self._mfa_timeout is not None else None
        try:
            while True:
                if slot_path.exists():  # noqa: ASYNC240
                    code = slot_path.read_text().strip()  # noqa: ASYNC240
                    if code and self._proc and self._proc.stdin:
                        self._proc.stdin.write((code + "\n").encode("utf-8"))
                        await self._proc.stdin.drain()
                        # The code is with icloudpd now — leave awaiting_mfa
                        # so the UI can close the modal and show the run as
                        # running again instead of "awaiting 2FA" until the
                        # terminal event.
                        self._publish("status", {"status": "running"})
                    return
                if deadline is not None and time.monotonic() >= deadline:
                    self.failure_reason = "mfa_timeout"
                    self._emit_log(
                        f"ERROR    2FA code not provided within "
                        f"{int(self._mfa_timeout or 0)}s; stopping run"
                    )
                    await self.stop()
                    return
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            pass

    def _publish(self, kind: RunEventKind, data: dict[str, Any]) -> None:
        self._seq += 1
        ev = RunEvent(seq=self._seq, kind=kind, ts=time.time(), data=data)
        self._buffer.append(ev)
        for q in list(self._subscribers):
            q.put_nowait(ev)

    async def _wait_exit(self) -> None:  # noqa: C901
        assert self._proc is not None
        code = await self._proc.wait()
        # Cancel any pending MFA poll task now that the process has exited.
        if self._mfa_poll_task is not None and not self._mfa_poll_task.done():
            self._mfa_poll_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._mfa_poll_task
        self.exit_code = code
        self.ended_at = datetime.now(UTC)
        if self.failure_reason is not None:
            # MFA timeout / rejection / unsupported 2SA may terminate via
            # stop(), but they are failures, not user-requested stops —
            # keep the distinct terminal status.
            final_status: RunStatus = "failed"
            self.error_id = self.run_id
        elif self._stopping and code != 0:
            final_status = "stopped"
        elif code == 0:
            final_status = "success"
        else:
            final_status = "failed"
            self.error_id = self.run_id

        # On first success into the directory, drop the folder-structure
        # sentinel so future runs catch pattern changes. Skip on dry-run
        # since nothing was actually written.
        if final_status == "success" and not self._dry_run and self._target_directory:
            from .folder_structure import remember

            remember(self._target_directory, self._folder_structure_pattern)
        # Wait for any in-flight per-file filter tasks to finish, then log a
        # summary. Keep status as "running" during this so is_running() stays
        # True until all deletion decisions are recorded.
        if self._filters is not None and not self._filters.is_empty():
            if self._dry_run:
                self._emit_log(
                    "INFO     Filter skipped: dry run active; no files were "
                    "written to disk, so filters can't evaluate."
                )
            elif final_status == "success":
                if self._filter_tasks:
                    await asyncio.gather(*self._filter_tasks, return_exceptions=True)
                loop = asyncio.get_running_loop()
                pruned = await loop.run_in_executor(None, self._prune_empty_dirs)
                for d in pruned:
                    self._emit_log(f"INFO     Filter: removed empty folder {d}")
                self._emit_log(
                    f"INFO     Filter summary: kept {self._filter_kept}, "
                    f"deleted {self._filter_deleted}, "
                    f"removed {len(pruned)} empty folder(s)"
                )

        self.status = final_status
        self._publish(
            "status",
            {
                "status": self.status,
                "exit_code": code,
                "error_id": self.error_id,
                "failure_reason": self.failure_reason,
            },
        )
        if self._log_fh is not None:
            self._log_fh.close()
            self._log_fh = None
        self._write_sidecar()
        for q in list(self._subscribers):
            q.put_nowait(None)
        self._done.set()

    def _write_sidecar(self) -> None:
        """Atomically write a .meta.json sidecar next to the log file."""
        meta: dict[str, Any] = {
            "run_id": self.run_id,
            "policy_name": self.policy_name,
            "status": self.status,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "exit_code": self.exit_code,
            "error_id": self.error_id,
            "failure_reason": self.failure_reason,
            "downloaded": self.progress.get("downloaded"),
            "total": self.progress.get("total"),
        }
        payload = json.dumps(meta, separators=(",", ":"), default=str).encode("utf-8")
        tmp_path = self.log_path.with_suffix(".meta.json.tmp")
        final_path = self.log_path.with_suffix(".meta.json")
        tmp_path.write_bytes(payload)
        os.replace(tmp_path, final_path)
