from __future__ import annotations

import asyncio
import os
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from icloudpd_web.store.models import AwsConfig


@dataclass
class AwsSyncResult:
    skipped: bool
    exit_code: int | None = None
    output: str = ""


class AwsSync:
    def __init__(self, argv_fn: Callable[[str, str], list[str]] | None = None) -> None:
        self._argv_fn = argv_fn or _default_argv

    async def run(self, cfg: AwsConfig, *, source: Path) -> AwsSyncResult:
        if not cfg.enabled or not cfg.bucket:
            return AwsSyncResult(skipped=True)
        dest = f"s3://{cfg.bucket}/{cfg.prefix}".rstrip("/")
        argv = self._argv_fn(str(source), dest)
        env = os.environ.copy()
        if cfg.access_key_id:
            env["AWS_ACCESS_KEY_ID"] = cfg.access_key_id
        if cfg.secret_access_key:
            env["AWS_SECRET_ACCESS_KEY"] = cfg.secret_access_key
        if cfg.region:
            env["AWS_DEFAULT_REGION"] = cfg.region
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        out_bytes, _ = await proc.communicate()
        return AwsSyncResult(
            skipped=False,
            exit_code=proc.returncode,
            output=out_bytes.decode("utf-8", errors="replace"),
        )


def _default_argv(src: str, dst: str) -> list[str]:
    return ["aws", "s3", "sync", src, dst]
