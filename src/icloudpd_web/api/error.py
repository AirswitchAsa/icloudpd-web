import logging
import traceback


class ICloudPdWebServerError(Exception):
    """
    Base class for all exceptions in the icloudpd_web server.
    """

    def __init__(self: "ICloudPdWebServerError", message: str) -> None:
        self.message = message
        super().__init__(self.message)


class ICloudAccessError(ICloudPdWebServerError):
    """
    Exception raised for permission errors.
    """

    def __init__(self: "ICloudAccessError", message: str) -> None:
        super().__init__(message)


class ICloudAPIError(ICloudPdWebServerError):
    """
    Exception raised for API errors.
    """

    def __init__(self: "ICloudAPIError", message: str) -> None:
        super().__init__(message)


class ICloudAuthenticationError(ICloudPdWebServerError):
    """
    Exception raised for authentication errors.
    """

    def __init__(self: "ICloudAuthenticationError", message: str) -> None:
        super().__init__(message)


class ServerConfigError(ICloudPdWebServerError):
    """
    Exception raised for server config errors.
    """

    def __init__(self: "ServerConfigError", message: str) -> None:
        super().__init__(message)


class PolicyError(ICloudPdWebServerError):
    """
    Exception raised for policy errors.
    """

    def __init__(self: "PolicyError", message: str) -> None:
        super().__init__(message)


class AWSS3Error(ICloudPdWebServerError):
    """
    Exception raised for AWS S3 errors.
    """

    def __init__(self: "AWSS3Error", message: str) -> None:
        super().__init__(message)


class AppriseError(ICloudPdWebServerError):
    """
    Exception raised for Apprise errors.
    """

    def __init__(self: "AppriseError", message: str) -> None:
        super().__init__(message)


def handle_error(server_logger: logging.Logger, error: Exception) -> str:
    """
    Handle different types of errors and return appropriate user messages
    """
    match error:
        case ICloudPdWebServerError():
            server_logger.warning(f"Expected error: {error.message}")
            return error.message
        case _:
            # Generic error message for unexpected errors
            server_logger.error(f"Traceback:\n{traceback.format_exc()}")
            server_logger.error(f"Unexpected error: {repr(error)}", exc_info=True)
            return "An unexpected error occurred. Please try again or check the logs."
