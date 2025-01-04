from pyicloud_ipd.services.photos import PhotoAsset

from typing import Iterable
from icloudpd.counter import Counter

import itertools
import logging


def handle_recent_until_found(
    photos_count: int | None,
    photos_enumerator: Iterable[PhotoAsset],
    recent: int | None,
    until_found: int | None,
) -> tuple[int | None, Iterable[PhotoAsset]]:
    if recent is not None:
        photos_count = recent
        photos_enumerator = itertools.islice(photos_enumerator, recent)

    if until_found is not None:
        photos_count = None
        # ensure photos iterator doesn't have a known length
        photos_enumerator = (p for p in photos_enumerator)

    return photos_count, iter(photos_enumerator)


def log_at_download_start(
    logger: logging.Logger,
    photos_count: int | None,
    primary_sizes: list[str],
    skip_videos: bool,
    directory: str,
) -> None:
    if photos_count is not None:
        plural_suffix = "" if photos_count == 1 else "s"
        video_suffix = ""
        photos_count_str = "the first" if photos_count == 1 else photos_count

        if not skip_videos:
            video_suffix = " or video" if photos_count == 1 else " and videos"
    else:
        photos_count_str = "???"
        plural_suffix = "s"
        video_suffix = " and videos" if not skip_videos else ""
    logger.info(
        ("Downloading %s %s" + " photo%s%s to %s ..."),
        photos_count_str,
        ",".join(primary_sizes),
        plural_suffix,
        video_suffix,
        directory,
    )


def should_break(counter: Counter, until_found: int | None) -> bool:
    """Exit if until_found condition is reached"""
    return until_found is not None and counter.value() >= until_found
