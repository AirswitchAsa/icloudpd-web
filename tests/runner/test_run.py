import asyncio
from pathlib import Path

import pytest

from icloudpd_web.runner.run import Run, RunEvent


def _argv(fake_icloudpd_cmd: list[str]) -> list[str]:
    """Minimal valid argv for the fake binary (satisfies argparse requirements)."""
    return [
        *fake_icloudpd_cmd,
        "--username",
        "u@icloud.com",
        "--directory",
        "/tmp/test",
        "--password-provider",
        "console",
    ]


@pytest.mark.asyncio
async def test_success_run(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

    run = Run(
        run_id="policy-A",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await run.wait()

    assert run.status == "success"
    assert run.exit_code == 0
    log_text = run.log_path.read_text()
    assert "Downloading 1 of 3" in log_text
    assert "done" in log_text


@pytest.mark.asyncio
async def test_fail_run(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "fail")
    run = Run(
        run_id="policy-B",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await run.wait()
    assert run.status == "failed"
    assert run.exit_code == 2
    assert run.error_id == "policy-B"


@pytest.mark.asyncio
async def test_ring_buffer_and_broadcast(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

    run = Run(
        run_id="policy-C",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()

    collected: list[RunEvent] = []

    async def consume() -> None:
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
async def test_progress_parse(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "3")

    run = Run(
        run_id="policy-D",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await run.wait()
    assert run.progress["downloaded"] == 3
    assert run.progress["total"] == 3


@pytest.mark.asyncio
async def test_stop_run(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "slow")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "100")

    run = Run(
        run_id="policy-E",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await asyncio.sleep(0.3)
    await run.stop()
    await run.wait()
    assert run.status == "stopped"


@pytest.mark.asyncio
async def test_sse_resume_from_seq(
    tmp_path: Path, fake_icloudpd_cmd: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "success")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "5")

    run = Run(
        run_id="policy-F",
        policy_name="policy",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
    )
    await run.start()
    await run.wait()

    seen: list[int] = []
    async for ev in run.subscribe(since=2):
        seen.append(ev.seq)
        if ev.kind == "status":
            break

    assert all(s > 2 for s in seen)
    assert seen == sorted(seen)


def test_downloaded_re_matches_timestamp_prefixed_line() -> None:
    """Real icloudpd emits download lines with a timestamp prefix.

    If the regex ever stops matching the canonical format, per-file
    filter deletion silently breaks — there's no other signal.
    """
    from icloudpd_web.runner.run import DOWNLOADED_RE

    line = "2026-04-20 11:17:10 INFO     Downloaded /Volumes/photos/2026/04/20/IMG_1234.JPG"
    m = DOWNLOADED_RE.search(line)
    assert m is not None
    assert m.group(1) == "/Volumes/photos/2026/04/20/IMG_1234.JPG"

    # Handles trailing whitespace.
    line2 = "2026-04-20 11:17:10 INFO     Downloaded /tmp/IMG.JPG   \n"
    m2 = DOWNLOADED_RE.search(line2.rstrip("\n"))
    assert m2 is not None
    assert m2.group(1) == "/tmp/IMG.JPG"

    # Doesn't match unrelated lines.
    assert DOWNLOADED_RE.search("INFO     Skipping /foo.jpg") is None
    assert DOWNLOADED_RE.search("ERROR    Download failed") is None


def test_emit_log_prepends_timestamp_for_inconsistent_lines(tmp_path: Path) -> None:
    """All log lines should have a uniform YYYY-MM-DD HH:MM:SS prefix.

    icloudpd emits timestamp-prefixed lines; our wrapper adds its own
    lines (filter events, warnings) that must match the same shape so
    users don't see a jumble of formats in the log view.
    """
    import re as _re

    from icloudpd_web.runner.run import Run

    run = Run(
        run_id="policy-log",
        policy_name="policy",
        argv=["/bin/true"],
        log_dir=tmp_path,
        password="pw",
    )
    # Open the log file without starting the subprocess.
    run._log_fh = open(run.log_path, "w", encoding="utf-8", buffering=1)  # noqa: SLF001, SIM115

    # Line without a timestamp (our own wrapper output) → prefix added.
    run._emit_log("INFO     Filter: deleted /foo.jpg")  # noqa: SLF001
    # Line already carrying icloudpd's timestamp → passed through.
    run._emit_log("2026-04-20 11:17:10 INFO     Downloaded /bar.jpg")  # noqa: SLF001

    run._log_fh.close()  # noqa: SLF001

    ts_re = _re.compile(r"^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\s")
    lines = run.log_path.read_text().splitlines()
    assert len(lines) == 2
    for line in lines:
        assert ts_re.match(line), f"no timestamp prefix: {line!r}"
    # Second line kept its original timestamp (not double-prefixed).
    assert lines[1].startswith("2026-04-20 11:17:10 INFO     Downloaded")
