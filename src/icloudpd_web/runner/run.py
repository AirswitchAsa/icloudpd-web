from __future__ import annotations

import asyncio
import collections
import contextlib
import json
import os
import re
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
MFA_PROMPT_RE = re.compile(r"Two-step|two.?factor", re.IGNORECASE)
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
        self._log_fh: Any = None
        self._done = asyncio.Event()
        self._stopping = False
        self._mfa_poll_task: asyncio.Task[None] | None = None
        self._filter_tasks: list[asyncio.Task[None]] = []
        self._filter_kept = 0
        self._filter_deleted = 0

    async def start(self) -> None:
        self.started_at = datetime.now(UTC)
        self.status = "running"
        self._log_fh = open(self.log_path, "w", encoding="utf-8", buffering=1)  # noqa: SIM115, ASYNC230
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
            if kind == "stdout":
                self._maybe_collect_downloaded(text)
                if self._on_mfa_needed and MFA_PROMPT_RE.search(text):
                    self._trigger_mfa()

    def _maybe_collect_downloaded(self, text: str) -> None:
        m = DOWNLOADED_RE.search(text)
        if not m:
            return
        path = Path(m.group(1).strip())
        # Apply filter per-file so deletion happens as soon as possible.
        # Dry-run writes no files, so filter evaluation would fail; skip.
        if self._filters is None or self._filters.is_empty() or self._dry_run:
            return
        # Prune completed tasks so this list doesn't grow unboundedly during
        # a long run (one task per downloaded file).
        self._filter_tasks = [t for t in self._filter_tasks if not t.done()]
        self._filter_tasks.append(asyncio.create_task(self._filter_one(path)))

    async def _filter_one(self, path: Path) -> None:
        """Evaluate one downloaded file against the configured filters.

        Runs the blocking EXIF read + unlink in an executor so the drain loop
        stays responsive.
        """
        from icloudpd_web.runner.post_filter import evaluate

        loop = asyncio.get_running_loop()
        try:
            decision = await loop.run_in_executor(None, evaluate, path, self._filters)
        except Exception as exc:  # noqa: BLE001
            self._emit_log(f"WARNING  Filter: evaluation failed for {path}: {exc}")
            return
        if decision.kept:
            self._filter_kept += 1
            self._emit_log(f"INFO     Filter: kept {path} ({decision.reason})")
            return
        try:
            await loop.run_in_executor(None, os.unlink, decision.path)
            self._filter_deleted += 1
            self._emit_log(f"INFO     Filter: deleted {path} ({decision.reason})")
        except OSError as exc:
            self._emit_log(f"WARNING  Filter: could not delete {path}: {exc}")

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

    def _trigger_mfa(self) -> None:
        """Called when an MFA prompt is detected in stdout.

        Registers a fresh MFA slot, emits awaiting_mfa, and starts a poll task
        that writes the delivered code to stdin. Re-entrant: if icloudpd
        rejects the code and re-prompts, the previous poll task will already
        have returned, and we trigger again so the UI can re-open the modal.
        """
        if self._mfa_poll_task is not None and not self._mfa_poll_task.done():
            return  # previous code still being delivered
        assert self._on_mfa_needed is not None
        slot_path = self._on_mfa_needed(self.policy_name)
        self._publish("status", {"status": "awaiting_mfa"})
        self._mfa_poll_task = asyncio.create_task(self._poll_mfa_slot(slot_path))

    async def _poll_mfa_slot(self, slot_path: Path) -> None:
        """Poll the slot file every 100ms. When it appears, write its content to stdin."""
        try:
            while True:
                if slot_path.exists():  # noqa: ASYNC240
                    code = slot_path.read_text().strip()  # noqa: ASYNC240
                    if code and self._proc and self._proc.stdin:
                        self._proc.stdin.write((code + "\n").encode("utf-8"))
                        await self._proc.stdin.drain()
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
        if self._stopping and code != 0:
            final_status: RunStatus = "stopped"
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
                self._emit_log(
                    f"INFO     Filter summary: kept {self._filter_kept}, "
                    f"deleted {self._filter_deleted}"
                )

        self.status = final_status
        self._publish(
            "status",
            {"status": self.status, "exit_code": code, "error_id": self.error_id},
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
            "downloaded": self.progress.get("downloaded"),
            "total": self.progress.get("total"),
        }
        payload = json.dumps(meta, separators=(",", ":"), default=str).encode("utf-8")
        tmp_path = self.log_path.with_suffix(".meta.json.tmp")
        final_path = self.log_path.with_suffix(".meta.json")
        tmp_path.write_bytes(payload)
        os.replace(tmp_path, final_path)
