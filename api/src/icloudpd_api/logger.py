import logging
import io
from typing import Tuple


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
    def __init__(self):
        super().__init__()
        self.buffer: list[str] = []

    def write(self, message):
        # Store each log message in the buffer
        self.buffer.append(message)
        super().write(message)

    def read_new_lines(self) -> list[str]:
        # Return new lines and clear the buffer
        new_lines = "".join(self.buffer)
        self.buffer = []
        return new_lines


def build_logger(policy_name: str) -> Tuple[logging.Logger, LogCaptureStream]:
    log_capture_stream = LogCaptureStream()
    logger = logging.getLogger(f"{policy_name}-logger")
    logger.handlers.clear()
    stream_handler = logging.StreamHandler(log_capture_stream)
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)-8s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    return logger, log_capture_stream
