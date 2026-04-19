from __future__ import annotations

from typing import Any

from icloudpd_web.store.models import Policy


def build_config(policy: Policy, *, password: str | None) -> dict[str, Any]:
    """Build the config dict passed to icloudpd via --config-file.

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
