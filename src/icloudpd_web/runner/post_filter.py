from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from icloudpd_web.store.models import Filters


@dataclass
class FilterDecision:
    path: Path
    kept: bool
    reason: str


_IMAGE_SUFFIXES: frozenset[str] = frozenset(
    {
        ".heic",
        ".heif",
        ".jpg",
        ".jpeg",
        ".png",
        ".tiff",
        ".tif",
        ".raw",
        ".dng",
        ".cr2",
        ".nef",
        ".arw",
    }
)


def _read_exif_make_model(path: Path) -> tuple[str | None, str | None]:
    """Return (Make, Model) from EXIF, or (None, None) if unreadable."""
    try:
        from PIL import ExifTags, Image

        with Image.open(path) as img:
            exif = img.getexif()
            if not exif:
                return None, None
            tagmap = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
            make = tagmap.get("Make")
            model = tagmap.get("Model")
            return (
                make.strip() if isinstance(make, str) else None,
                model.strip() if isinstance(model, str) else None,
            )
    except Exception:  # noqa: BLE001
        return None, None


def _check_exif(path: Path, filters: Filters) -> FilterDecision | None:
    """Evaluate EXIF-based filters (device_makes, device_models).

    Returns a failing FilterDecision if the file does not pass, or None if it passes.
    Non-image files skip EXIF checks entirely.
    """
    if path.suffix.lower() not in _IMAGE_SUFFIXES:
        # Non-image file (e.g. video): EXIF filters do not apply.
        return None

    make, model = _read_exif_make_model(path)

    if filters.device_makes:
        wanted_makes = [x.strip().lower() for x in filters.device_makes if x.strip()]
        if make is None:
            return FilterDecision(
                path, False, "EXIF Make unreadable; device_makes filter configured"
            )
        make_lc = make.lower()
        if not any(w in make_lc for w in wanted_makes):
            return FilterDecision(
                path, False, f"Make {make!r} contains none of {sorted(wanted_makes)}"
            )

    if filters.device_models:
        wanted_models = [x.strip().lower() for x in filters.device_models if x.strip()]
        if model is None:
            return FilterDecision(
                path, False, "EXIF Model unreadable; device_models filter configured"
            )
        model_lc = model.lower()
        if not any(w in model_lc for w in wanted_models):
            return FilterDecision(
                path, False, f"Model {model!r} contains none of {sorted(wanted_models)}"
            )

    return None


def evaluate(path: Path, filters: Filters) -> FilterDecision:
    """Return a keep/delete decision for one downloaded file.

    AND across fields, OR within a field.
    - file_suffixes: case-insensitive extension match.
    - match_patterns: regex applied to basename; any match passes.
    - device_makes / device_models: EXIF Make/Model; fail-closed on unreadable EXIF.
      Non-image files (videos, etc.) skip EXIF filters entirely.
    """
    suffix = path.suffix.lower()

    if filters.file_suffixes:
        wanted = {
            s.lower() if s.startswith(".") else f".{s.lower()}" for s in filters.file_suffixes
        }
        if suffix not in wanted:
            return FilterDecision(path, False, f"suffix {suffix!r} not in {sorted(wanted)}")

    if filters.match_patterns:
        if not any(re.search(p, path.name) for p in filters.match_patterns):
            return FilterDecision(path, False, f"basename matched none of {filters.match_patterns}")

    if filters.device_makes or filters.device_models:
        decision = _check_exif(path, filters)
        if decision is not None:
            return decision

    return FilterDecision(path, True, "matched all configured filters")


def evaluate_all(paths: Iterable[Path], filters: Filters) -> list[FilterDecision]:
    return [evaluate(p, filters) for p in paths]
