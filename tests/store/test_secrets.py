import os
import stat
from pathlib import Path

from icloudpd_web.store.secrets import SecretStore


def test_set_and_get(tmp_path: Path) -> None:
    s = SecretStore(tmp_path)
    s.set("policy-a", "hunter2")
    assert s.get("policy-a") == "hunter2"


def test_get_missing_returns_none(tmp_path: Path) -> None:
    s = SecretStore(tmp_path)
    assert s.get("nope") is None


def test_mode_is_0600(tmp_path: Path) -> None:
    s = SecretStore(tmp_path)
    s.set("p", "x")
    mode = stat.S_IMODE(os.stat(tmp_path / "p.password").st_mode)
    assert mode == 0o600


def test_delete(tmp_path: Path) -> None:
    s = SecretStore(tmp_path)
    s.set("p", "x")
    s.delete("p")
    assert s.get("p") is None


def test_delete_missing_ok(tmp_path: Path) -> None:
    s = SecretStore(tmp_path)
    s.delete("nope")  # must not raise
