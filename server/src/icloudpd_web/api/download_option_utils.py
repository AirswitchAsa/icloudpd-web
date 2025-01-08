from pyicloud_ipd.services.photos import PhotoAsset

from typing import Iterable
from icloudpd.counter import Counter
from icloudpd.download import mkdirs_for_path

import itertools
import logging
import os


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


def check_folder_structure(logger: logging.Logger, directory: str, folder_structure: str) -> None:
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
                f"Creating .folderstructure file in {directory} with folder structure: {folder_structure}"
            )
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
            "Cannot determine the structure of a non-empty directory. Please provide a .folderstructure file manually or use an empty directory."
        )

    # folder exists and .structure file exists
    with open(structure_file_path, "r") as f:
        if (provided_structure := f.read().strip()) != folder_structure:
            raise ValueError(
                f"The specified folder structure: {folder_structure} is different from the one found in the existing .folderstructure file: {provided_structure}"
            )
        else:
            logger.info(
                f"Continue downloading to {directory} with the folder structure: {folder_structure}"
            )
