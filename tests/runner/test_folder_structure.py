from pathlib import Path

import pytest

from icloudpd_web.runner.folder_structure import (
    DEFAULT_PATTERN,
    SENTINEL_NAME,
    check_or_raise,
    remember,
)


def test_check_no_sentinel_is_ok(tmp_path: Path) -> None:
    check_or_raise(tmp_path, "{:%Y/%m/%d}")  # no-op


def test_check_matching_sentinel_passes(tmp_path: Path) -> None:
    (tmp_path / SENTINEL_NAME).write_text("{:%Y/%m/%d}")
    check_or_raise(tmp_path, "{:%Y/%m/%d}")


def test_check_mismatch_raises(tmp_path: Path) -> None:
    (tmp_path / SENTINEL_NAME).write_text("{:%Y/%m/%d}")
    with pytest.raises(RuntimeError, match="Folder-structure mismatch"):
        check_or_raise(tmp_path, "{:%Y}/{:%m}")


def test_check_uses_default_when_pattern_blank(tmp_path: Path) -> None:
    (tmp_path / SENTINEL_NAME).write_text(DEFAULT_PATTERN)
    check_or_raise(tmp_path, None)
    check_or_raise(tmp_path, "")
    check_or_raise(tmp_path, "   ")


def test_remember_writes_when_absent(tmp_path: Path) -> None:
    remember(tmp_path, "{:%Y}/{:%m}")
    assert (tmp_path / SENTINEL_NAME).read_text() == "{:%Y}/{:%m}"


def test_remember_is_idempotent(tmp_path: Path) -> None:
    (tmp_path / SENTINEL_NAME).write_text("original")
    remember(tmp_path, "different")
    assert (tmp_path / SENTINEL_NAME).read_text() == "original"


def test_remember_creates_directory(tmp_path: Path) -> None:
    target = tmp_path / "new" / "subdir"
    remember(target, "{:%Y}")
    assert (target / SENTINEL_NAME).read_text() == "{:%Y}"
