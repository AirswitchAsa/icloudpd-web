import io
import logging
import logging.config
import sys
from typing import Callable

from click import style

from icloudpd.base import (
    compose_handlers,
    internal_error_handle_builder,
    session_error_handle_builder,
)
from pyicloud_ipd.base import PyiCloudService


class ClickFormatter(logging.Formatter):
    """Custom formatter using Click's style for colors"""

    def format(self: "ClickFormatter", record: logging.LogRecord) -> str:
        # Style different log levels with different colors
        level_styles = {
            "DEBUG": "cyan",
            "INFO": "bright_blue",
            "WARNING": "yellow",
            "ERROR": "red",
            "CRITICAL": "bright_red",
        }
        # Store the original levelname
        original_levelname = record.levelname
        # Apply styling only for terminal output (StreamHandler to sys.stdout/stderr)
        if any(
            isinstance(h, logging.StreamHandler) and h.stream in (sys.stdout, sys.stderr)
            for h in logging.getLogger().handlers
        ):
            record.levelname = style(record.levelname, fg=level_styles.get(record.levelname, "red"))
        result = super().format(record)
        # Restore the original levelname
        record.levelname = original_levelname
        return result


# Configure server logger
server_logger = logging.getLogger("server_logger")
server_logger.handlers.clear()  # Clear any existing handlers

# Create and configure the handler
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(
    ClickFormatter(
        fmt="%(asctime)s %(levelname)-8s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
)
server_logger.addHandler(handler)

# Configure uvicorn loggers
uvicorn_logger = logging.getLogger("uvicorn")
uvicorn_logger.handlers = [handler]
uvicorn_logger.propagate = False
uvicorn_logger.setLevel(logging.INFO)

uvicorn_access_logger = logging.getLogger("uvicorn.access")
uvicorn_access_logger.handlers = [handler]
uvicorn_access_logger.propagate = False
uvicorn_access_logger.setLevel(logging.INFO)


def build_logger_level(level: str) -> int:
    match level:
        case "debug":
            return logging.DEBUG
        case "info":
            return logging.INFO
        case "error":
            return logging.ERROR
        case _:
            raise ValueError(f"Unsupported logger level: {level}")


class LogCaptureStream(io.StringIO):
    def __init__(self: "LogCaptureStream") -> None:
        super().__init__()
        self.buffer: list[str] = []

    def write(self: "LogCaptureStream", message: str) -> None:
        # Store each log message in the buffer
        self.buffer.append(message)
        super().write(message)

    def read_new_lines(self: "LogCaptureStream") -> str:
        # Return new lines and clear the buffer
        if self.buffer:
            new_lines = "".join(self.buffer)
            self.buffer = []
            return new_lines
        return ""


def build_logger(policy_name: str) -> tuple[logging.Logger, LogCaptureStream]:
    log_capture_stream = LogCaptureStream()
    logger = logging.getLogger(f"{policy_name}-logger")
    logger.handlers.clear()
    stream_handler = logging.StreamHandler(log_capture_stream)
    # Use the ClickFormatter here too
    stream_handler.setFormatter(
        ClickFormatter(
            fmt="%(asctime)s %(levelname)-8s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    logger.addHandler(stream_handler)
    return logger, log_capture_stream


def build_photos_exception_handler(logger: logging.Logger, icloud: PyiCloudService) -> Callable:
    session_exception_handler = session_error_handle_builder(logger, icloud)
    internal_error_handler = internal_error_handle_builder(logger)

    error_handler = compose_handlers([session_exception_handler, internal_error_handler])
    return error_handler
