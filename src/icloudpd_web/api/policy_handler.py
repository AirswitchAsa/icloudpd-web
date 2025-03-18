import asyncio
import base64
import datetime
import logging
import os
import shutil
from collections.abc import AsyncGenerator, Callable
from enum import Enum
from functools import partial
from typing import cast
from zoneinfo import ZoneInfo

import aiofiles
import socketio
from croniter import croniter
from stream_zip import ZIP_64, AsyncMemberFile, async_stream_zip

from icloudpd.autodelete import autodelete_photos
from icloudpd.base import delete_photo, download_builder, retrier
from icloudpd.counter import Counter
from icloudpd_web.api.aws_handler import AWSHandler
from icloudpd_web.api.data_models import AuthenticationResult, PolicyConfigs
from icloudpd_web.api.download_option_utils import (
    DryRunFilter,
    check_folder_structure,
    handle_recent_until_found,
    log_at_download_start,
    should_break,
    should_skip,
)
from icloudpd_web.api.error import (
    ICloudAccessError,
    ICloudAPIError,
    ICloudAuthenticationError,
    ICloudPdWebServerError,
)
from icloudpd_web.api.icloud_utils import (
    ICloudManager,
    build_downloader_builder_args,
    build_pyicloudservice_args,
    request_2sa,
)
from icloudpd_web.api.logger import build_logger_level, build_photos_exception_handler
from pyicloud_ipd.base import PyiCloudService
from pyicloud_ipd.exceptions import PyiCloudFailedLoginException
from pyicloud_ipd.services.photos import PhotoAlbum, PhotoAsset


class PolicyStatus(Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    ERRORED = "errored"


class PolicyHandler:
    @property
    def name(self: "PolicyHandler") -> str:
        return self._name

    @name.setter
    def name(self: "PolicyHandler", value: str) -> None:
        self._name = value

    @property
    def status(self: "PolicyHandler") -> PolicyStatus:
        return self._status

    @status.setter
    def status(self: "PolicyHandler", value: PolicyStatus) -> None:
        self._status = value

    @property
    def progress(self: "PolicyHandler") -> int:
        return self._progress

    @progress.setter
    def progress(self: "PolicyHandler", value: int) -> None:
        if not 0 <= value <= 100:
            raise ICloudPdWebServerError("Progress must be between 0 and 100")
        self._progress = value

    @property
    def authenticated(self: "PolicyHandler") -> bool:
        return (
            self.icloud is not None
            and not self.icloud.requires_2sa
            and not self.icloud.requires_2fa
        )

    @property
    def waiting_mfa(self: "PolicyHandler") -> bool:
        return self.icloud is not None and not self.authenticated

    @property
    def should_remove_local_copy(self: "PolicyHandler") -> bool:
        """
        Local copy should be removed if other options are enabled and
        the user wants to remove the local copy.
        """
        return (
            self._configs.download_via_browser or self._configs.upload_to_aws_s3
        ) and self._configs.remove_local_copy

    @property
    def albums(self: "PolicyHandler") -> list[str]:
        """
        Return a list of all albums available to the user.
        """
        if library := self.library_name:
            icloud = self.require_icloud("Can only get albums when authenticated")
            return ["All Photos"] + [
                str(a) for a in icloud.photos.private_libraries[library].albums.values()
            ]
        else:
            return []

    @property
    def library_name(self: "PolicyHandler") -> str | None:
        """
        Find the actual library name from icloud given the library name in the configs.
        """
        if not self.authenticated:
            return None
        icloud = self.require_icloud("Can only get library name when authenticated")
        libraries = list(icloud.photos.private_libraries.keys())
        shared_library_name = next((lib for lib in libraries if "SharedSync" in lib), None)
        if shared_library_name and self._configs.library == "Shared Library":
            return shared_library_name
        elif self._configs.library == "Personal Library":
            return "PrimarySync"
        else:
            return None

    @property
    def icloud(self: "PolicyHandler") -> PyiCloudService | None:
        return self._icloud_manager.get_instance(self.username)

    @icloud.setter
    def icloud(self: "PolicyHandler", instance: PyiCloudService) -> None:
        self._icloud_manager.set_instance(self.username, instance)

    @property
    def username(self: "PolicyHandler") -> str:
        return self._configs.username

    @property
    def next_run_time(self: "PolicyHandler") -> datetime.datetime | None:
        return self._next_run_time

    @next_run_time.setter
    def next_run_time(self: "PolicyHandler", value: datetime.datetime) -> None:
        self._next_run_time = value

    @property
    def scheduled(self: "PolicyHandler") -> bool:
        return self._next_run_time is not None and self._configs.interval is not None

    def __init__(
        self: "PolicyHandler",
        name: str,
        icloud_manager: ICloudManager,
        aws_handler: AWSHandler,
        **kwargs,
    ) -> None:
        self._name = name
        self._configs = PolicyConfigs(**kwargs)  # validate the configs and fill-in defaults
        self._status = PolicyStatus.STOPPED
        self._progress = 0
        self._icloud_manager = icloud_manager
        self._aws_handler = aws_handler
        self._next_run_time = None

    def require_icloud(self: "PolicyHandler", msg: str) -> PyiCloudService:
        if self.icloud is None or not self.authenticated:
            raise ICloudAccessError(msg)
        return self.icloud

    def dump(self: "PolicyHandler", excludes: list[str] | None = None) -> dict:
        policy_dict = {
            "name": self._name,
            "status": self._status.value,
            "progress": self._progress,
            "authenticated": self.authenticated,
            "waiting_mfa": self.waiting_mfa,
            "albums": self.albums,
            "scheduled": self.scheduled,
            **self._configs.model_dump(),
        }
        if excludes is not None:
            for exclude in excludes:
                policy_dict.pop(exclude, None)
        return policy_dict

    def update(self: "PolicyHandler", config_updates: dict) -> None:
        """
        Update the policy configs. Should only be called when status is STOPPED.
        """
        if self._status != PolicyStatus.STOPPED and self._status != PolicyStatus.ERRORED:
            raise ICloudPdWebServerError("Can only update policy when policy is stopped or errored")
        new_config_args = self._configs.model_dump()
        new_config_args.update(config_updates)
        self._configs = PolicyConfigs(**new_config_args)
        self._progress = 0

    def authenticate(self: "PolicyHandler", password: str) -> tuple[AuthenticationResult, str]:
        """
        Create the icloud instance with the given password. User may need to provide MFA code to
        finish authentication.
        """
        if self._status != PolicyStatus.STOPPED and self._status != PolicyStatus.ERRORED:
            raise ICloudAuthenticationError("Can only authenticate when policy is stopped")
        if self.authenticated:
            raise ICloudAuthenticationError(
                "Can only authenticate when policy is not authenticated"
            )
        try:
            self._icloud_manager.remove_instance(
                self.username
            )  # Remove the existing instance if any
            pyicloudservice_args = build_pyicloudservice_args(self._configs)
            self.icloud = PyiCloudService(
                **pyicloudservice_args,
                domain=self._configs.domain,
                apple_id=self.username,
                password=password,
                cookie_directory=self._icloud_manager.cookie_directory,
            )
        except PyiCloudFailedLoginException as e:
            self._icloud_manager.remove_instance(self.username)
            return AuthenticationResult.FAILED, e.args[0]
        if self.authenticated:
            return AuthenticationResult.SUCCESS, "Authenticated."
        else:
            if icloud := self.icloud:
                if icloud.requires_2sa and not icloud.requires_2fa:
                    # User does not have MFA enabled, request 2SA using SMS manually
                    request_2sa(icloud)
                return AuthenticationResult.MFA_REQUIRED, "MFA required."
            else:
                raise ICloudAccessError("iCloud instance should have been created")

    def provide_mfa(self: "PolicyHandler", mfa_code: str) -> tuple[AuthenticationResult, str]:
        """
        Provide the MFA code to the icloud instance to finish authentication.
        """
        if icloud := self.icloud:
            icloud.validate_2fa_code(mfa_code)
            if not self.authenticated:
                return AuthenticationResult.MFA_REQUIRED, "Wrong MFA code."
            else:
                return AuthenticationResult.SUCCESS, "Authenticated."
        else:
            raise ICloudAccessError("iCloud instance should have been created")

    def interrupt(self: "PolicyHandler") -> None:
        """
        Interrupt the policy: stop the running download and cancel the scheduled run.
        """
        if self._status == PolicyStatus.RUNNING:
            self._status = PolicyStatus.STOPPED
            self._next_run_time = None

    def cancel_scheduled_run(self: "PolicyHandler") -> bool:
        if self._next_run_time is None or self._status != PolicyStatus.STOPPED:
            return False
        self._next_run_time = None
        return True

    def maybe_schedule_next_run(self: "PolicyHandler", logger: logging.Logger) -> None:
        if self._configs.interval:
            cron = croniter(self._configs.interval, datetime.datetime.now(ZoneInfo("UTC")))
            self._next_run_time = cron.get_next(datetime.datetime)
            logger.info(f"Scheduled next run (UTC): {self._next_run_time}")

    async def start_with_zip(
        self: "PolicyHandler", logger: logging.Logger, sio: socketio.AsyncServer
    ) -> None:
        async for chunk in async_stream_zip(self.start(logger)):
            if self._configs.download_via_browser:
                encoded_chunk = base64.b64encode(chunk).decode("utf-8")
                await sio.emit("zip_chunk", {"chunk": encoded_chunk})
        if self._configs.download_via_browser:
            await sio.emit("zip_chunk", {"finished": True})

    async def start(
        self: "PolicyHandler", logger: logging.Logger
    ) -> AsyncGenerator[AsyncMemberFile]:
        """
        Start running the policy for download.
        """
        if not self.authenticated:
            raise ICloudAccessError(
                "Can only start when authenticated. Please try again after authenticating the policy."  # noqa: E501
            )
        self._status = PolicyStatus.RUNNING
        logger.setLevel(build_logger_level(self._configs.log_level))

        # Remove the dry run filter, if it exists
        for filter in logger.filters:
            if isinstance(filter, DryRunFilter):
                logger.removeFilter(filter)
        # Pprepend [DRY RUN] to all messages if dry_run is enabled
        if self._configs.dry_run:
            logger.addFilter(DryRunFilter())

        try:
            logger.info(f"Starting policy: {self._name}...")

            pyicloudservice_args = build_pyicloudservice_args(self._configs)
            self._icloud_manager.update_instance(
                username=self.username,
                attributes=pyicloudservice_args,
            )
            icloud = self.require_icloud("Can only start when icloud access is available")
            download_photo: Callable = download_builder(
                logger=logger, **build_downloader_builder_args(self._configs)
            )(icloud)

            async def async_download_photo(*args, **kwargs):  # noqa: ANN202
                loop = asyncio.get_running_loop()
                return await loop.run_in_executor(None, download_photo, *args, **kwargs)

            download_counter = Counter(0)
            async for file_info in self.download(
                icloud, logger, async_download_photo, download_counter
            ):
                yield file_info
        except Exception as e:
            logger.error(f"Error running policy: {self._name}. Exiting.")
            self._status = PolicyStatus.ERRORED
            self._progress = 0
            raise e

        logger.info(
            f"Total of {download_counter.value()} items including skipped "
            f"in {self._configs.library} from album {self._configs.album} have been downloaded "
            f"at {self._configs.directory}"
        )
        self._status = PolicyStatus.STOPPED

    async def download(  # noqa: C901
        self: "PolicyHandler",
        icloud: PyiCloudService,
        logger: logging.Logger,
        async_download_photo: Callable,
        download_counter: Counter,
    ) -> AsyncGenerator[AsyncMemberFile]:
        directory_path = os.path.abspath(os.path.expanduser(cast(str, self._configs.directory)))
        directory = os.path.normpath(directory_path)
        check_folder_structure(
            logger, directory, self._configs.folder_structure, self._configs.dry_run
        )

        if (library_name := self.library_name) is None:
            raise ValueError(f"Unavailable library: {self._configs.library}")
        library = icloud.photos.private_libraries[library_name]
        if self._configs.album not in library.albums and self._configs.album != "All Photos":
            raise ICloudAPIError(f"Album {self._configs.album} not found in library {library_name}")
        photos: PhotoAlbum = (
            library.albums[self._configs.album]
            if self._configs.album != "All Photos"
            else library.all
        )
        error_handler = build_photos_exception_handler(logger, icloud)
        photos.exception_handler = error_handler
        photos_count: int | None = len(photos)

        photos_count, photos_iterator = handle_recent_until_found(
            photos_count, photos, self._configs.recent, self._configs.until_found
        )
        log_at_download_start(
            logger, photos_count, self._configs.size, self._configs.skip_videos, directory
        )
        consecutive_files_found = Counter(0)

        while True:
            try:
                if self._status == PolicyStatus.STOPPED:  # policy is interrupted
                    logger.info(f"Policy: {self._name} is interrupted by user. Exiting.")
                    break
                if should_break(consecutive_files_found, self._configs.until_found):
                    logger.info(
                        "Found %s consecutive previously downloaded photos. Exiting",
                        self._configs.until_found,
                    )
                    break
                item: PhotoAsset = next(photos_iterator)  # type: ignore
                if should_skip(logger, item, self._configs):
                    download_counter.increment()
                    continue
                download_result = await async_download_photo(consecutive_files_found, item)
                if download_result and self._configs.keep_icloud_recent_days:
                    delete_local = partial(
                        delete_photo,
                        logger,
                        icloud.photos,
                        library,
                        item,
                    )

                    retrier(delete_local, error_handler)

                def find_file_at_path(item: PhotoAsset) -> str | None:
                    for root, _, files in os.walk(directory):
                        for file in files:
                            if item.filename in file:
                                return os.path.join(root, file)
                    return None

                if filepath := find_file_at_path(item):
                    object_name = filepath.replace(
                        directory_path, "Photos"
                    )  # preserve folder structure in zipfile
                    if self._configs.upload_to_aws_s3:
                        await self._aws_handler.upload_file(logger, filepath, object_name)
                    async with aiofiles.open(filepath, "rb") as f:
                        file_content = await f.read()
                    yield (
                        object_name,
                        item.created,
                        0o666,
                        ZIP_64,
                        self._content_generator(file_content),
                    )
                    # remove the file after sending if specified
                    if self.should_remove_local_copy:
                        os.remove(filepath)

                download_counter.increment()  # Increment counter
                if photos_count is not None:
                    if (
                        progress := int(download_counter.value() / photos_count * 100)
                    ) != self._progress:
                        self._progress = progress
                else:
                    self._progress = 0  # set progress to 0 when using until_found
            except StopIteration:
                break

        if self._configs.auto_delete:
            autodelete_photos(
                logger=logger,
                dry_run=self._configs.dry_run,
                library_object=library,
                folder_structure=self._configs.folder_structure,
                directory=directory,
                _sizes=self._configs.size,  # type: ignore # string enum
            )
        if self.should_remove_local_copy:
            shutil.rmtree(directory)

    async def _content_generator(
        self: "PolicyHandler", content: bytes
    ) -> AsyncGenerator[bytes, None]:
        yield content
