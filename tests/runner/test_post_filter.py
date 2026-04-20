"""Unit tests for the post-download filter module."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from icloudpd_web.runner.post_filter import evaluate, evaluate_all
from icloudpd_web.store.models import Filters


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _path(name: str) -> Path:
    return Path(f"/fake/{name}")


def _make_exif_mock(
    make: str | None, model: str | None
) -> Callable[[Path], tuple[str | None, str | None]]:
    """Return a side_effect callable for _read_exif_make_model returning (make, model)."""

    def _fake(path: Path) -> tuple[str | None, str | None]:
        return (make, model)

    return _fake


# ---------------------------------------------------------------------------
# no filters → always kept
# ---------------------------------------------------------------------------


def test_no_filters_always_kept() -> None:
    f = Filters()
    d = evaluate(_path("IMG_1234.jpg"), f)
    assert d.kept is True


# ---------------------------------------------------------------------------
# file_suffixes
# ---------------------------------------------------------------------------


def test_file_suffix_match_heic() -> None:
    f = Filters(file_suffixes=[".heic"])
    assert evaluate(_path("photo.HEIC"), f).kept is True  # case-insensitive


def test_file_suffix_no_match() -> None:
    f = Filters(file_suffixes=[".heic"])
    assert evaluate(_path("photo.jpg"), f).kept is False


def test_file_suffix_or_within_field() -> None:
    f = Filters(file_suffixes=[".heic", ".jpg"])
    assert evaluate(_path("photo.heic"), f).kept is True
    assert evaluate(_path("photo.jpg"), f).kept is True
    assert evaluate(_path("photo.png"), f).kept is False


def test_file_suffix_without_dot_prefix() -> None:
    # Suffix without leading dot should still work
    f = Filters(file_suffixes=["jpg"])
    assert evaluate(_path("photo.jpg"), f).kept is True
    assert evaluate(_path("photo.png"), f).kept is False


# ---------------------------------------------------------------------------
# match_patterns
# ---------------------------------------------------------------------------


def test_match_pattern_kept() -> None:
    f = Filters(match_patterns=["^IMG_"])
    assert evaluate(_path("IMG_1234.heic"), f).kept is True


def test_match_pattern_deleted() -> None:
    f = Filters(match_patterns=["^IMG_"])
    assert evaluate(_path("other.heic"), f).kept is False


def test_match_pattern_or_within() -> None:
    f = Filters(match_patterns=["^IMG_", "^DSC"])
    assert evaluate(_path("IMG_001.jpg"), f).kept is True
    assert evaluate(_path("DSC0001.jpg"), f).kept is True
    assert evaluate(_path("Screenshot.png"), f).kept is False


# ---------------------------------------------------------------------------
# device_makes via EXIF
# ---------------------------------------------------------------------------


def test_device_make_match(tmp_path: Path) -> None:
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fake")
    f = Filters(device_makes=["Apple"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock("Apple", "iPhone 15"),
    ):
        assert evaluate(img, f).kept is True


def test_device_make_no_match(tmp_path: Path) -> None:
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fake")
    f = Filters(device_makes=["Apple"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock("Samsung", "Galaxy S24"),
    ):
        d = evaluate(img, f)
        assert d.kept is False
        assert "Samsung" in d.reason


def test_device_make_case_insensitive(tmp_path: Path) -> None:
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fake")
    f = Filters(device_makes=["apple"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock("Apple", "iPhone 15"),
    ):
        assert evaluate(img, f).kept is True


def test_device_make_substring_match(tmp_path: Path) -> None:
    """Filter tokens are matched as substrings, case-insensitively — so the
    user can type 'ricoh' and it still matches 'RICOH IMAGING COMPANY, LTD.'."""
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fake")
    f = Filters(device_makes=["ricoh"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock("RICOH IMAGING COMPANY, LTD.", "GR III"),
    ):
        assert evaluate(img, f).kept is True


def test_device_make_substring_no_false_positives(tmp_path: Path) -> None:
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fake")
    f = Filters(device_makes=["ricoh"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock("Apple", "iPhone 15"),
    ):
        d = evaluate(img, f)
        assert d.kept is False
        assert "Apple" in d.reason


def test_device_make_exif_unreadable(tmp_path: Path) -> None:
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fake")
    f = Filters(device_makes=["Apple"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock(None, None),
    ):
        d = evaluate(img, f)
        assert d.kept is False
        assert "unreadable" in d.reason.lower()


def test_device_model_exif_unreadable(tmp_path: Path) -> None:
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fake")
    f = Filters(device_models=["iPhone 15 Pro"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock("Apple", None),
    ):
        d = evaluate(img, f)
        assert d.kept is False
        assert "unreadable" in d.reason.lower()


# ---------------------------------------------------------------------------
# non-image files skip EXIF filters
# ---------------------------------------------------------------------------


def test_non_image_skips_exif_filters() -> None:
    # .mp4 is not in _image_suffixes; EXIF filters should not apply.
    f = Filters(device_makes=["Apple"])
    # No mock needed; EXIF won't be read for non-image files.
    d = evaluate(_path("video.mp4"), f)
    assert d.kept is True


def test_non_image_still_subject_to_suffix_filter() -> None:
    f = Filters(file_suffixes=[".heic"], device_makes=["Apple"])
    d = evaluate(_path("video.mp4"), f)
    assert d.kept is False  # suffix fails


# ---------------------------------------------------------------------------
# AND across fields
# ---------------------------------------------------------------------------


def test_and_across_fields_both_must_pass(tmp_path: Path) -> None:
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fake")
    # suffix .jpg not in [.heic] → delete even though EXIF would pass
    f = Filters(file_suffixes=[".heic"], device_makes=["Apple"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock("Apple", "iPhone 15"),
    ):
        d = evaluate(img, f)
        assert d.kept is False  # suffix fails first


def test_and_across_fields_heic_and_apple_kept(tmp_path: Path) -> None:
    img = tmp_path / "photo.heic"
    img.write_bytes(b"fake")
    f = Filters(file_suffixes=[".heic"], device_makes=["Apple"])
    with patch(
        "icloudpd_web.runner.post_filter._read_exif_make_model",
        side_effect=_make_exif_mock("Apple", "iPhone 15"),
    ):
        d = evaluate(img, f)
        assert d.kept is True


# ---------------------------------------------------------------------------
# evaluate_all
# ---------------------------------------------------------------------------


def test_evaluate_all() -> None:
    f = Filters(file_suffixes=[".heic"])
    paths = [_path("a.heic"), _path("b.jpg"), _path("c.heic")]
    decisions = evaluate_all(paths, f)
    assert len(decisions) == 3
    assert decisions[0].kept is True
    assert decisions[1].kept is False
    assert decisions[2].kept is True


# ---------------------------------------------------------------------------
# invalid regex rejected at Pydantic construction
# ---------------------------------------------------------------------------


def test_invalid_regex_raises() -> None:
    with pytest.raises(ValidationError, match="invalid regex"):
        Filters(match_patterns=["[unclosed"])
