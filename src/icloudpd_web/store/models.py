from __future__ import annotations

import re
import zoneinfo
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from croniter import croniter
from pydantic import BaseModel, Field, field_validator, model_validator


SLUG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")


class NotificationConfig(BaseModel):
    on_start: bool = False
    on_success: bool = True
    on_failure: bool = True


class AwsConfig(BaseModel):
    enabled: bool = False
    bucket: str | None = None
    prefix: str = ""
    region: str | None = None

    @model_validator(mode="after")
    def _check(self) -> AwsConfig:
        if self.enabled and not self.bucket:
            raise ValueError("aws.bucket is required when aws.enabled is true")
        return self


class RunSummary(BaseModel):
    run_id: str
    started_at: datetime
    ended_at: datetime | None
    status: Literal["running", "success", "failed", "stopped"]
    exit_code: int | None = None
    error_id: str | None = None


class Policy(BaseModel):
    name: str
    username: str
    directory: Path
    cron: str
    enabled: bool = True
    timezone: str | None = None
    icloudpd: dict[str, Any] = Field(default_factory=dict)
    notifications: NotificationConfig = Field(default_factory=NotificationConfig)
    aws: AwsConfig | None = None

    # Derived / runtime; not on disk.
    next_run_at: datetime | None = None
    last_run: RunSummary | None = None

    @field_validator("name")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError(f"name must be a slug: {v!r}")
        return v

    @field_validator("cron")
    @classmethod
    def _cron(cls, v: str) -> str:
        try:
            croniter(v)
        except Exception as e:
            raise ValueError(f"invalid cron: {e}") from e
        return v

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            zoneinfo.ZoneInfo(v)
        except Exception as e:
            raise ValueError(f"unknown timezone: {v}") from e
        return v

    def to_toml_dict(self) -> dict[str, Any]:
        """The subset of fields persisted to TOML (no derived state)."""
        d = self.model_dump(
            exclude={"next_run_at", "last_run"},
            exclude_none=True,
            mode="json",
        )
        d["directory"] = str(self.directory)
        return d
