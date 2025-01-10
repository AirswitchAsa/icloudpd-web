class ICloudPdWebServerError(Exception):
    """
    Base class for all exceptions in the icloudpd_web server.
    """

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(self.message)


class ICloudAccessError(ICloudPdWebServerError):
    """
    Exception raised for permission errors.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)


class ICloudAuthenticationError(ICloudPdWebServerError):
    """
    Exception raised for authentication errors.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
