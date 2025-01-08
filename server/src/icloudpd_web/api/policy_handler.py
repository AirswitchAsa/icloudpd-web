from icloudpd_web.api.data_models import PolicyConfigs, AuthenticationResult
from icloudpd_web.api.icloud_utils import (
    build_pyicloudservice_args,
    build_downloader_builder_args,
    request_2sa,
    ICloudManager,
)
from icloudpd_web.api.logger import build_logger_level, build_photos_exception_handler
from icloudpd_web.api.download_option_utils import (
    handle_recent_until_found,
    log_at_download_start,
    should_break,
    check_folder_structure,
)
from pyicloud_ipd.base import PyiCloudService
from pyicloud_ipd.exceptions import PyiCloudFailedLoginException
from pyicloud_ipd.services.photos import PhotoAlbum
from icloudpd.base import download_builder, delete_photo, retrier
from icloudpd.counter import Counter
from icloudpd.autodelete import autodelete_photos

from enum import Enum
from typing import cast, Callable
from functools import partial
import asyncio
import logging
import os


class PolicyStatus(Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    ERRORED = "errored"


class PolicyHandler:
    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str):
        assert isinstance(value, str), "Policy name must be a string"
        self._name = value

    @property
    def status(self) -> PolicyStatus:
        return self._status

    @status.setter
    def status(self, value: PolicyStatus):
        assert isinstance(value, PolicyStatus), "Status must be a PolicyStatus"
        self._status = value

    @property
    def progress(self) -> int:
        return self._progress

    @progress.setter
    def progress(self, value: int):
        assert isinstance(value, int), "Progress must be an integer"
        assert 0 <= value <= 100, "Progress must be between 0 and 100"
        self._progress = value

    @property
    def authenticated(self) -> bool:
        return (
            self.icloud is not None
            and not self.icloud.requires_2sa
            and not self.icloud.requires_2fa
        )

    @property
    def albums(self) -> list[str]:
        """
        Return a list of all albums available to the user.
        """
        if not self.authenticated:
            return []
        if library := self.library_name:
            return [str(a) for a in self.icloud.photos.libraries[library].albums.values()]
        else:
            return []

    @property
    def library_name(self) -> str:
        """
        Find the actual library name from icloud given the library name in the configs.
        """
        assert self.authenticated, "Can only get library name when authenticated"
        libraries = list(self.icloud.photos.libraries.keys())
        shared_library_name = next((lib for lib in libraries if "SharedSync" in lib), None)
        if shared_library_name and self._configs.library == "Shared Library":
            return shared_library_name
        elif self._configs.library == "Personal Library":
            return "PrimarySync"
        else:
            return None

    @property
    def icloud(self) -> PyiCloudService:
        return self._icloud_manager.get_instance(self.username)

    @icloud.setter
    def icloud(self, instance: PyiCloudService):
        self._icloud_manager.set_instance(self.username, instance)

    @property
    def username(self) -> str:
        return self._configs.username

    def __init__(self, name: str, icloud_manager: ICloudManager, **kwargs):
        self._name = name
        self._configs = PolicyConfigs(**kwargs)  # validate the configs and fill-in defaults
        self._status = PolicyStatus.STOPPED
        self._progress = 0
        self._icloud_manager = icloud_manager

    def dump(self, excludes: list[str] = []) -> dict:
        policy_dict = {
            "name": self._name,
            "status": self._status.value,
            "progress": self._progress,
            "authenticated": self.authenticated,
            "albums": self.albums,
            **self._configs.model_dump(),
        }
        for exclude in excludes:
            policy_dict.pop(exclude, None)
        return policy_dict

    def update(self, config_updates: dict):
        """
        Update the policy configs. Should only be called when status is STOPPED.
        """
        assert (
            self._status == PolicyStatus.STOPPED or self._status == PolicyStatus.ERRORED
        ), "Can only update policy when policy is stopped or errored"
        new_config_args = self._configs.model_dump()
        new_config_args.update(config_updates)
        self._configs = PolicyConfigs(**new_config_args)
        self._progress = 0

    def authenticate(self, password: str):
        """
        Create the icloud instance with the given password. User may need to provide MFA code to finish authentication.
        """
        assert self._status == PolicyStatus.STOPPED, "Can only authenticate when policy is stopped"
        assert not self.authenticated, "Can only authenticate when it is not authenticated"
        try:
            pyicloudservice_args = build_pyicloudservice_args(self._configs)
            self.icloud = PyiCloudService(
                **pyicloudservice_args,
                domain=self._configs.domain,
                apple_id=self.username,
                password=password,
            )
        except PyiCloudFailedLoginException as e:
            return AuthenticationResult.FAILED, e.args[0]
        if self.authenticated:
            return AuthenticationResult.SUCCESS, "Authenticated."
        else:
            if (
                self.icloud.requires_2sa and not self.icloud.requires_2fa
            ):  # User does not have MFA enabled, request 2SA using SMS manually
                request_2sa(self.icloud)
            return AuthenticationResult.MFA_REQUIRED, "MFA required."

    def provide_mfa(self, mfa_code: str):
        """
        Provide the MFA code to the icloud instance to finish authentication.
        """
        assert not self.authenticated, "Can only provide MFA when policy is not authenticated"
        self.icloud.validate_2fa_code(mfa_code)
        if not self.authenticated:
            return AuthenticationResult.MFA_REQUIRED, "Wrong MFA code."
        else:
            return AuthenticationResult.SUCCESS, "Authenticated."

    async def start(self, logger: logging.Logger):
        """
        Start running the policy for download.
        """
        assert self.authenticated, "Can only start when authenticated"
        self._status = PolicyStatus.RUNNING
        logger.setLevel(build_logger_level(self._configs.log_level))

        try:
            logger.info(f"Starting policy: {self._name}...")

            pyicloudservice_args = build_pyicloudservice_args(self._configs)
            self._icloud_manager.update_instance(
                username=self.username,
                attributes=pyicloudservice_args,
            )

            download_photo: Callable = download_builder(
                logger=logger, **build_downloader_builder_args(self._configs)
            )(self.icloud)

            async def async_download_photo(*args, **kwargs):
                loop = asyncio.get_running_loop()
                return await loop.run_in_executor(None, download_photo, *args, **kwargs)

            directory = os.path.normpath(cast(str, self._configs.directory))
            check_folder_structure(logger, directory, self._configs.folder_structure)

            if (library_name := self.library_name) is None:
                raise ValueError(f"Unavailable library: {self._configs.library}")
            library = self.icloud.photos.libraries[library_name]
            assert (
                self._configs.album in library.albums
            ), f"Album {self._configs.album} not found in library {library_name}"
            photos: PhotoAlbum = library.albums[self._configs.album]
            error_handler = build_photos_exception_handler(logger, self.icloud)
            photos.exception_handler = error_handler
            photos_count: int | None = len(photos)

            photos_count, photos_iterator = handle_recent_until_found(
                photos_count, photos, self._configs.recent, self._configs.until_found
            )
            log_at_download_start(
                logger, photos_count, self._configs.size, self._configs.skip_videos, directory
            )
            consecutive_files_found = Counter(0)
            photos_counter = 0
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
                    item = next(photos_iterator)
                    download_result = await async_download_photo(consecutive_files_found, item)
                    if download_result and self._configs.delete_after_download:
                        delete_local = partial(
                            delete_photo,
                            logger,
                            self.icloud.photos,
                            library,
                            item,
                        )

                        retrier(delete_local, error_handler)

                    photos_counter += 1
                    if (progress := int(photos_counter / photos_count * 100)) != self._progress:
                        self._progress = progress
                except StopIteration:
                    break

            if self._configs.auto_delete:
                autodelete_photos(
                    logger=logger,
                    dry_run=False,
                    library_object=library,
                    folder_structure=self._configs.folder_structure,
                    directory=directory,
                    primary_sizes=self._configs.size,
                )
        except Exception as e:
            logger.error(f"Error running policy: {self._name}. Exiting.")
            self._status = PolicyStatus.ERRORED
            self._progress = 0
            raise e

        logger.info(
            f"Total of {photos_counter} items in {self._configs.library} from album {self._configs.album} have been downloaded at {self._configs.directory}"
        )
        self._status = PolicyStatus.STOPPED

    def interrupt(self):
        assert self._status == PolicyStatus.RUNNING, "Can only interrupt when policy is running"
        self._status = PolicyStatus.STOPPED
