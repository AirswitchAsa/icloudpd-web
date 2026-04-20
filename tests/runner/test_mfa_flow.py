"""Unit test for MFA flow in Run: on_mfa_needed callback is called, code is delivered via stdin."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from icloudpd_web.runner.run import Run


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
        "--mfa-provider",
        "console",
    ]


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
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
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
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
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


@pytest.mark.asyncio
async def test_mfa_flow_handles_reprompt_after_rejection(
    tmp_path: Path,
    fake_icloudpd_cmd: list[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If icloudpd rejects the first code and re-prompts, Run must:

    1. Call on_mfa_needed a second time (fresh slot).
    2. Forward the second code via stdin.
    3. Complete successfully.

    This exercises the re-entrancy guard in _trigger_mfa.
    """
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "mfa_reprompt")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")

    slots: list[Path] = []

    def on_mfa_needed(policy_name: str) -> Path:
        slot = tmp_path / f"code_{len(slots)}"
        slots.append(slot)
        return slot

    run = Run(
        run_id="test-mfa-reprompt",
        policy_name="p",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
        on_mfa_needed=on_mfa_needed,
    )
    await run.start()

    async def provide_two_codes() -> None:
        # Wait for first slot, write bad code.
        for _ in range(100):
            await asyncio.sleep(0.05)
            if len(slots) >= 1:
                slots[0].write_text("111111\n")
                break
        # Wait for second slot (triggered by the second prompt), write good code.
        for _ in range(100):
            await asyncio.sleep(0.05)
            if len(slots) >= 2:
                slots[1].write_text("222222\n")
                break

    await asyncio.wait_for(
        asyncio.gather(run.wait(), provide_two_codes()),
        timeout=15,
    )

    assert len(slots) == 2, f"Expected two on_mfa_needed calls, got {len(slots)}"
    assert run.status == "success"
    log_text = run.log_path.read_text()
    assert "First code rejected" in log_text
    assert "Received MFA code of length 6" in log_text


@pytest.mark.asyncio
async def test_mfa_flow_stop_during_awaiting_mfa(
    tmp_path: Path,
    fake_icloudpd_cmd: list[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """User-initiated cancel while awaiting MFA must terminate the run.

    The MFA modal's Cancel button calls Runner.stop(); the run should
    transition to 'stopped' without ever receiving an MFA code.
    """
    monkeypatch.setenv("FAKE_ICLOUDPD_MODE", "mfa")
    monkeypatch.setenv("FAKE_ICLOUDPD_TOTAL", "1")

    slot_path = tmp_path / "p.code"
    slot_called = asyncio.Event()

    def on_mfa_needed(policy_name: str) -> Path:
        slot_called.set()
        return slot_path

    run = Run(
        run_id="test-mfa-cancel",
        policy_name="p",
        argv=_argv(fake_icloudpd_cmd),
        log_dir=tmp_path,
        password="pw",
        on_mfa_needed=on_mfa_needed,
    )
    await run.start()

    # Wait until we're awaiting MFA, then stop without providing a code.
    await asyncio.wait_for(slot_called.wait(), timeout=5)
    await run.stop()
    await asyncio.wait_for(run.wait(), timeout=5)

    assert run.status == "stopped"
    # Slot file must NOT have been written — user cancelled instead of submitting.
    assert not slot_path.exists()
