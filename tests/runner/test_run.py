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
