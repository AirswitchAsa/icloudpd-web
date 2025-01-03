from foundation.core import compose, identity
from icloudpd.paths import clean_filename, remove_unicode_chars
from icloudpd.base import lp_filename_concatinator, lp_filename_original
from typing import Callable
from pyicloud_ipd.file_match import FileMatchPolicy


def build_filename_cleaner(keep_unicode_in_filenames: bool) -> Callable[[str], str]:
    """Map keep_unicode parameter for function for cleaning filenames"""
    return compose(
        (remove_unicode_chars if not keep_unicode_in_filenames else identity),
        clean_filename,
    )


def build_lp_filename_generator(live_photo_mov_filename_policy: str) -> Callable[[str], str]:
    return (
        lp_filename_original
        if live_photo_mov_filename_policy == "original"
        else lp_filename_concatinator
    )


def file_match_policy_generator(policy: str) -> FileMatchPolicy:
    match policy:
        case "name-size-dedup-with-suffix":
            return FileMatchPolicy.NAME_SIZE_DEDUP_WITH_SUFFIX
        case "name-id7":
            return FileMatchPolicy.NAME_ID7
        case _:
            raise ValueError(f"policy was provided with unsupported value of '{policy}'")
