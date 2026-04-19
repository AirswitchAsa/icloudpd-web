from pathlib import Path

import pytest

from icloudpd_web.runner.mfa import MfaRegistry


def test_register_and_deliver(tmp_path: Path) -> None:
    reg = MfaRegistry(tmp_path)
    slot = reg.register("policy-A")
    assert slot.path.parent.exists()
    reg.provide("policy-A", "123456")
    assert slot.path.read_text().strip() == "123456"


def test_awaiting_flag(tmp_path: Path) -> None:
    reg = MfaRegistry(tmp_path)
    reg.register("p")
    assert reg.awaiting("p") is True
    reg.provide("p", "000000")
    assert reg.awaiting("p") is False


def test_cleanup(tmp_path: Path) -> None:
    reg = MfaRegistry(tmp_path)
    slot = reg.register("p")
    reg.cleanup("p")
    assert not slot.path.exists()


def test_provide_without_registration_raises(tmp_path: Path) -> None:
    reg = MfaRegistry(tmp_path)
    with pytest.raises(KeyError):
        reg.provide("nope", "000000")
