import fnmatch
import io
import itertools
import logging
import os
from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Literal

import requests
from PIL import ExifTags, Image

from icloudpd.counter import Counter
from icloudpd.download import mkdirs_for_path
from icloudpd_web.api.data_models import PolicyConfigs
from pyicloud_ipd.services.photos import PhotoAsset
from pyicloud_ipd.version_size import AssetVersionSize


class DryRunFilter(logging.Filter):
    def filter(self: "DryRunFilter", record: logging.LogRecord) -> bool:
        if record.msg.startswith("Downloaded"):  # Duplicate message are logged by icloudpd
            return False
        record.msg = (
            f"[DRY RUN] {record.msg}" if not record.msg.startswith("[DRY RUN]") else record.msg
        )
        return True


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
    primary_sizes: Sequence[Literal["original", "medium", "thumb", "adjusted", "alternative"]],
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
        ",".join(primary_sizes),  # type: ignore # string enum is treated as string
        plural_suffix,
        video_suffix,
        directory,
    )


def should_break(counter: Counter, until_found: int | None) -> bool:
    """Exit if until_found condition is reached"""
    return until_found is not None and counter.value() >= until_found


def match_exif(logger: logging.Logger, item: PhotoAsset, configs: PolicyConfigs) -> bool:
    try:
        url = item.versions[AssetVersionSize.THUMB].url
        response = requests.get(url)
        response.raise_for_status()  # Ensure the request was successful

        # Store the content in a BytesIO object
        file_bytes = io.BytesIO(response.content)
        image = Image.open(file_bytes)
        exif = {
            ExifTags.TAGS[k]: v
            for k, v in image._getexif().items()  # type: ignore
            if k in ExifTags.TAGS
        }
        make = exif.get("Make", "")
        model = exif.get("Model", "")
        if configs.device_make and not any(
            match_make.lower() in make.lower() for match_make in configs.device_make
        ):
            logger.info(f"{item.filename} does not match any of {configs.device_make}, skipping")
            return False
        if configs.device_model and not any(
            match_model.lower() in model.lower() for match_model in configs.device_model
        ):
            logger.info(f"{item.filename} does not match any of {configs.device_model}, skipping")
            return False
        return True
    except Exception:
        logger.error(f"Error getting exif data for {item.filename}, skipping the file.")
        return False


def should_skip(logger: logging.Logger, item: PhotoAsset, configs: PolicyConfigs) -> bool:  # noqa: C901
    if (configs.device_make or configs.device_model) and not match_exif(logger, item, configs):
        return True
    # convert created_after, created_before, added_after, added_before to datetime if not empty
    created_after = (
        datetime.strptime(configs.created_after, "%Y-%m-%d") if configs.created_after else None
    )
    created_before = (
        datetime.strptime(configs.created_before, "%Y-%m-%d") if configs.created_before else None
    )
    added_after = (
        datetime.strptime(configs.added_after, "%Y-%m-%d") if configs.added_after else None
    )
    added_before = (
        datetime.strptime(configs.added_before, "%Y-%m-%d") if configs.added_before else None
    )
    if created_after and item.created < created_after.replace(tzinfo=item.created.tzinfo):
        logger.info(f"{item.filename} was created before {created_after}, skipping")
        return True
    if created_before and item.created > created_before.replace(tzinfo=item.created.tzinfo):
        logger.info(f"{item.filename} was created after {created_before}, skipping")
        return True
    if added_after and item.added_date < added_after.replace(tzinfo=item.added_date.tzinfo):
        logger.info(f"{item.filename} was added before {added_after}, skipping")
        return True
    if added_before and item.added_date > added_before.replace(tzinfo=item.added_date.tzinfo):
        logger.info(f"{item.filename} was added after {added_before}, skipping")
        return True
    # check suffix first to avoid unnecessary glob pattern matching
    if configs.file_suffixes and not any(
        item.filename.endswith(suffix) for suffix in configs.file_suffixes
    ):
        logger.info(f"{item.filename} does not end with any of {configs.file_suffixes}, skipping")
        return True
    # split match_pattern by comma and check if any of the glob patterns match the item
    if configs.match_pattern and not any(
        fnmatch.fnmatch(item.filename, pattern) for pattern in configs.match_pattern.split(",")
    ):
        logger.info(f"{item.filename} does not match any of {configs.match_pattern}, skipping")
        return True
    return False


def check_folder_structure(
    logger: logging.Logger, directory: str, folder_structure: str, dry_run: bool
) -> None:
    """
    Check if there exists a .folderstructure file in the directory. If not, create it.
    If the file exists, check if the folder structure is the same as the one in the file.

    Return if the folder structure is the same or the folder is newly created.
    Raise an error if the folder structure is different or there are files in the directory without
    the folder structure.

    Note that this check cannot prevent the user from altering the structure file manually with the
    .folderstructure file in place.
    """

    def write_structure_file(structure_file_path: str, folder_structure: str) -> None:
        with open(structure_file_path, "w") as f:
            logger.info(
                f"Creating .folderstructure file in {directory} "
                f"with folder structure: {folder_structure}"
            )
            if not dry_run:
                f.write(folder_structure + "\n")
        os.chmod(structure_file_path, 0o644)

    structure_file_path = os.path.join(directory, ".folderstructure")

    # folder does not exist
    if not os.path.exists(directory):
        mkdirs_for_path(logger, structure_file_path)
        write_structure_file(structure_file_path, folder_structure)
        return

    directory_empty = not [f for f in os.listdir(directory) if not f.startswith(".")]

    if directory_empty:
        write_structure_file(structure_file_path, folder_structure)
        return

    # folder not empty but no .structure file
    if not directory_empty and not os.path.exists(structure_file_path):
        raise ValueError(
            "Cannot determine the structure of a non-empty directory. "
            "Please provide a .folderstructure file manually or "
            "use an empty directory."
        )

    # folder exists and .structure file exists
    with open(structure_file_path) as f:
        if (provided_structure := f.read().strip()) != folder_structure:
            raise ValueError(
                f"The specified folder structure: {folder_structure} is different from the one "
                f"found in the existing .folderstructure file: {provided_structure}"
            )
        else:
            logger.info(
                f"Continue downloading to {directory} with the folder structure: {folder_structure}"
            )
