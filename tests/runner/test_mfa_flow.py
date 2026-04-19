"""Unit test for MFA flow in Run: on_mfa_needed callback is called, code is delivered via stdin."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from icloudpd_web.runner.run import Run


@pytest.mark.asyncio
async def test_mfa_flow_delivers_code_via_stdin(
    tmp_path: Path,
    fake_icloudpd_cmd: list[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When Run sees the MFA prompt, it calls on_mfa_needed, polls the slot path,
    and writes the code to stdin. The fake binary should then complete successfully."""
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "mfa")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")

    slot_path = tmp_path / "p.code"
    callback_called_with: list[str] = []

    def on_mfa_needed(policy_name: str) -> Path:
        callback_called_with.append(policy_name)
        return slot_path

    run = Run(
        run_id="test-mfa",
        policy_name="p",
        argv=fake_icloudpd_cmd,
        log_dir=tmp_path,
        on_mfa_needed=on_mfa_needed,
    )
    await run.start()

    # Give the run a moment to print the MFA prompt and trigger the callback.
    # Then simulate the user providing the MFA code via the API
    # (which writes to the slot path).
    async def provide_code_after_delay() -> None:
        for _ in range(50):
            await asyncio.sleep(0.05)
            if callback_called_with:
                break
        slot_path.write_text("123456\n")

    await asyncio.wait_for(
        asyncio.gather(run.wait(), provide_code_after_delay()),
        timeout=10,
    )

    assert callback_called_with == ["p"], "on_mfa_needed must be called with policy_name"
    assert run.status == "success", f"Expected success, got {run.status}"
    log_text = run.log_path.read_text()
    assert "Received MFA code of length 6" in log_text


@pytest.mark.asyncio
async def test_mfa_flow_awaiting_mfa_status_event(
    tmp_path: Path,
    fake_icloudpd_cmd: list[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Run emits a status=awaiting_mfa event after calling on_mfa_needed."""
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "mfa")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")

    slot_path = tmp_path / "p.code"

    def on_mfa_needed(policy_name: str) -> Path:
        return slot_path

    run = Run(
        run_id="test-mfa-evt",
        policy_name="p",
        argv=fake_icloudpd_cmd,
        log_dir=tmp_path,
        on_mfa_needed=on_mfa_needed,
    )

    status_events: list[str] = []

    async def collect_events() -> None:
        async for ev in run.subscribe(since=None):
            if ev.kind == "status":
                status_events.append(ev.data.get("status", ""))
            if ev.data.get("status") in ("success", "failed", "stopped"):
                break

    await run.start()

    async def provide_code_after_delay() -> None:
        for _ in range(50):
            await asyncio.sleep(0.05)
            if slot_path.parent.exists() and run.status == "running":
                # Wait for callback to be invoked (slot file doesn't exist yet)
                break
        slot_path.write_text("123456\n")

    await asyncio.wait_for(
        asyncio.gather(run.wait(), collect_events(), provide_code_after_delay()),
        timeout=10,
    )

    assert "awaiting_mfa" in status_events, f"Expected awaiting_mfa in {status_events}"
    assert run.status == "success"
