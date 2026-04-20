from __future__ import annotations

from typing import Any

from icloudpd_web.store.models import Policy


# Canonical allowlist of snake_case keys permitted inside Policy.icloudpd.
# Mirrors the long flags we forward to real icloudpd; keys not here are
# stripped at model-validation time so stale UI fields (e.g. removed
# `device_make`, `download_via_browser`) never reach the subprocess.
# --username/--directory/--mfa-provider/--password-provider are emitted
# separately by build_argv, so they are not in this set.
ALLOWED_ICLOUDPD_KEYS: frozenset[str] = frozenset(
    {
        "album",
        "size",
        "skip_videos",
        "skip_live_photos",
        "auth_only",
        "recent",
        "until_found",
        "xmp_sidecar",
        "auto_delete",
        "folder_structure",
        "set_exif_datetime",
        "smtp_username",
        "smtp_password",
        "smtp_host",
        "smtp_port",
        "smtp_no_tls",
        "notification_email",
        "notification_email_from",
        "notification_script",
        "delete_after_download",
        "keep_icloud_recent_days",
        "dry_run",
        "skip_photos",
        "skip_created_before",
        "skip_created_after",
        "live_photo_size",
        "cookie_directory",
        "list_albums",
        "library",
        "list_libraries",
        "force_size",
        "keep_unicode_in_filenames",
        "file_match_policy",
        "live_photo_mov_filename_policy",
        "align_raw",
        "log_level",
        "domain",
        "no_progress_bar",
        "only_print_filenames",
        "use_os_locale",
        "watch_with_interval",
        "threads_num",
    }
)


def build_config(policy: Policy, *, password: str | None) -> dict[str, Any]:
    """Build the config dict (kept for tests / backward compat).

    Our meta fields (cron, enabled, aws, timezone) are never
    forwarded. The [icloudpd] block is flattened into the top level.
    """
    cfg: dict[str, Any] = {}
    cfg["username"] = policy.username
    cfg["directory"] = str(policy.directory)
    if password is not None:
        cfg["password"] = password
    cfg["mfa_provider"] = "console"
    cfg.update(policy.icloudpd)
    return cfg


def build_argv(policy: Policy) -> list[str]:
    """Translate a Policy into the CLI argv tail for icloudpd.

    Returns a list of flag strings (no binary name, no password).
    Always includes --username, --directory, --mfa-provider console,
    and --password-provider console so the process reads the password
    from stdin.

    The ``icloudpd`` dict values are translated as follows:

    * bool True  → ``--flag-name``  (store-true flag)
    * bool False → flag omitted
    * list        → ``--flag-name v1 --flag-name v2 ...`` (repeated flag)
    * other       → ``--flag-name value``
    """
    args: list[str] = []

    args += ["--username", policy.username]
    args += ["--directory", str(policy.directory)]
    args += ["--mfa-provider", "console"]
    args += ["--password-provider", "console"]

    for key, value in policy.icloudpd.items():
        flag = "--" + key.replace("_", "-")
        if isinstance(value, bool):
            if value:
                args.append(flag)
            # False → omit entirely
        elif isinstance(value, list):
            for item in value:
                args += [flag, str(item)]
        else:
            args += [flag, str(value)]

    return args
