from __future__ import annotations

from typing import Any

from icloudpd_web.store.models import Policy


def build_config(policy: Policy, *, password: str | None) -> dict[str, Any]:
    """Build the config dict (kept for tests / backward compat).

    Our meta fields (cron, enabled, notifications, aws, timezone) are never
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
