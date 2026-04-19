from __future__ import annotations

import logging
import secrets

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


log = logging.getLogger(__name__)


def new_error_id(prefix: str = "srv") -> str:
    return f"{prefix}-{secrets.token_hex(4)}"


class ApiError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        error_id: str | None = None,
        field: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_id = error_id
        self.field = field


class ValidationError(ApiError):
    def __init__(self, message: str, *, field: str | None = None) -> None:
        super().__init__(message, status_code=422, field=field)


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.message,
                "error_id": exc.error_id,
                "field": exc.field,
            },
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        eid = new_error_id()
        log.exception("unhandled exception %s", eid)
        return JSONResponse(
            status_code=500,
            content={
                "error": f"Server error. Reference: {eid}",
                "error_id": eid,
                "field": None,
            },
        )
