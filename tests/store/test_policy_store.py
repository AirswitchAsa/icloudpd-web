from __future__ import annotations

import asyncio
import logging
import os as _os
from pathlib import Path
from typing import NoReturn

import pytest

from icloudpd_web.store.models import Policy
from icloudpd_web.store.policy_store import PolicyStore


def _policy(name: str = "p", **over) -> Policy:
    base = {
        "name": name,
        "username": "u@icloud.com",
        "directory": Path("/tmp/out"),
        "cron": "0 */6 * * *",
        "enabled": True,
        "icloudpd": {"album": "All Photos"},
        "aws": None,
    }
    base.update(over)
    return Policy(**base)


@pytest.fixture
def store(tmp_path: Path) -> PolicyStore:
    s = PolicyStore(tmp_path)
    s.load()
    return s


def test_empty_on_fresh_dir(store: PolicyStore) -> None:
    assert store.all() == []
    assert store.generation == 0


def test_put_creates_file(store: PolicyStore, tmp_path: Path) -> None:
    store.put(_policy("a"))
    assert (tmp_path / "a.toml").is_file()
    assert store.generation == 1
    assert [p.name for p in store.all()] == ["a"]


def test_put_replaces_existing(store: PolicyStore) -> None:
    store.put(_policy("a"))
    store.put(_policy("a", username="other@icloud.com"))
    assert store.get("a").username == "other@icloud.com"
    assert store.generation == 2


def test_delete(store: PolicyStore, tmp_path: Path) -> None:
    store.put(_policy("a"))
    store.delete("a")
    assert store.get("a") is None
    assert not (tmp_path / "a.toml").exists()


def test_load_reads_existing_files(tmp_path: Path) -> None:
    s1 = PolicyStore(tmp_path)
    s1.load()
    s1.put(_policy("a"))
    s1.put(_policy("b"))
    s2 = PolicyStore(tmp_path)
    s2.load()
    assert sorted(p.name for p in s2.all()) == ["a", "b"]


def test_atomic_write_survives_crash_midway(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Simulate a crash after temp file is written but before rename."""
    s = PolicyStore(tmp_path)
    s.load()
    s.put(_policy("a"))

    real_replace = _os.replace

    def boom(src: str, dst: str) -> NoReturn:
        raise RuntimeError("boom")

    monkeypatch.setattr(_os, "replace", boom)
    with pytest.raises(RuntimeError):
        s.put(_policy("a", username="new@icloud.com"))
    monkeypatch.setattr(_os, "replace", real_replace)

    # Reload: original preserved.
    s2 = PolicyStore(tmp_path)
    s2.load()
    assert s2.get("a").to_toml_dict() == s.get("a").to_toml_dict()
    # Verify temp files were cleaned up.
    assert not any(p.name.endswith(".tmp") for p in tmp_path.iterdir())


def test_generation_bump_on_mutation(store: PolicyStore) -> None:
    g0 = store.generation
    store.put(_policy("a"))
    assert store.generation == g0 + 1
    store.put(_policy("b"))
    assert store.generation == g0 + 2
    store.delete("a")
    assert store.generation == g0 + 3


@pytest.mark.asyncio
async def test_concurrent_puts_no_corruption(tmp_path: Path) -> None:
    s = PolicyStore(tmp_path)
    s.load()
    await asyncio.gather(*[asyncio.to_thread(s.put, _policy(f"p{i}")) for i in range(20)])
    s2 = PolicyStore(tmp_path)
    s2.load()
    assert len(s2.all()) == 20


def test_invalid_toml_file_is_skipped_with_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING)
    (tmp_path / "broken.toml").write_text("this is = not [ valid")
    s = PolicyStore(tmp_path)
    s.load()
    assert s.all() == []
    assert any("skipping invalid policy file" in r.message for r in caplog.records)
