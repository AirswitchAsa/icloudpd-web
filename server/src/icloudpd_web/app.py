from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from icloudpd_web.api.session_handler import SessionHandler
from icloudpd_web.api.data_models import AuthenticationResult
from icloudpd_web.api.policy_handler import PolicyStatus
from icloudpd_web.api.logger import build_logger
from icloudpd_web.api.authentication_local import authenticate_secret, save_secret_hash

from dataclasses import dataclass
import socketio
import asyncio
import os

secret_hash_path = os.environ.get("SECRET_HASH_PATH", "~/.icloudpd_web/secret_hash")
secret_hash_path = os.path.abspath(os.path.expanduser(secret_hash_path))
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
allowed_origins = allowed_origins.split(",") if allowed_origins != "*" else "*"


@dataclass
class AppConfig:
    client_ids: set[str]
    allowed_origins: list[str]
    max_sessions: int = os.environ.get("MAX_SESSIONS", 5)
    default_client_id: str = "default-user"
    no_password: bool = os.environ.get("NO_PASSWORD", False)
    always_guest: bool = os.environ.get("ALWAYS_GUEST", False)
    disable_guest: bool = os.environ.get("DISABLE_GUEST", False)
    toml_path: str = os.environ.get("TOML_PATH", "./policies.toml")
    secret_hash_path: str = secret_hash_path


app_config = AppConfig(client_ids=set({"default-user"}), allowed_origins=allowed_origins)


def create_app(
    serve_static: bool = False, static_dir: str = None
) -> tuple[FastAPI, socketio.AsyncServer]:
    # Socket.IO server
    sio = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins=app_config.allowed_origins,
    )

    print(f"Allowed origins: {app_config.allowed_origins}")

    # FastAPI app
    app = FastAPI(
        title="iCloudPD API", description="API for iCloud Photos Downloader", version="0.1.0"
    )

    # Configure CORS for REST endpoints
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_config.allowed_origins if app_config.allowed_origins != "*" else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount static files if requested
    if serve_static and static_dir:
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    # State
    handler_manager: dict[str, SessionHandler] = {}
    # Mapping to track which sids ownership by clientId
    sid_to_client: dict[str, str] = {}

    def find_active_client_id(client_id: str) -> str | None:
        for sid, cid in sid_to_client.items():
            if cid == client_id:
                return sid
        return None

    async def maybe_emit(event: str, client_id: str, preferred_sid: str, *args, **kwargs):
        if preferred_sid in sid_to_client:
            await sio.emit(event, *args, **kwargs, to=preferred_sid)
        elif sid := find_active_client_id(client_id):
            await sio.emit(event, *args, **kwargs, to=sid)
        else:
            print(f"No active session found for client {client_id} when emitting {event}")

    @sio.event
    async def updateAppConfig(sid, key, value):
        try:
            client_id = sid_to_client.get(sid)
            assert client_id, "Client ID not found"
            assert key in {
                "always_guest",
                "disable_guest",
                "no_password",
            }, "Invalid setting to update"
            if (key != "always_guest" or value) and client_id not in app_config.client_ids:
                raise ValueError("Guest user is not allowed to update this setting")

            setattr(app_config, key, value)
            await maybe_emit("app_config_updated", client_id, sid)
        except Exception as e:
            await maybe_emit("error_updating_app_config", client_id, sid, {"error": repr(e)})

    @sio.event
    async def authenticate_local(sid, password):
        if client_id := sid_to_client.get(sid):
            try:
                if authenticate_secret(password, app_config.secret_hash_path):
                    await maybe_emit("server_authenticated", client_id, sid)
                else:
                    await maybe_emit(
                        "server_authentication_failed",
                        client_id,
                        sid,
                        {"error": "Invalid password"},
                    )
            except Exception as e:
                await maybe_emit("server_authentication_failed", client_id, sid, {"error": repr(e)})

    @sio.event
    async def save_secret(sid, old_password, new_password):
        if client_id := sid_to_client.get(sid):
            try:
                if authenticate_secret(old_password, app_config.secret_hash_path):
                    save_secret_hash(new_password, app_config.secret_hash_path)
                    await maybe_emit("server_secret_saved", client_id, sid)
                    await maybe_emit("server_authenticated", client_id, sid)
                else:
                    await maybe_emit(
                        "failed_saving_server_secret",
                        client_id,
                        sid,
                        {"error": "Invalid old password"},
                    )
            except Exception as e:
                await maybe_emit("failed_saving_server_secret", client_id, sid, {"error": repr(e)})

    @sio.event
    async def reset_secret(sid):
        if client_id := sid_to_client.get(sid):
            try:
                print("Resetting server secret, removing all sessions")
                handler_manager.clear()
                try:
                    os.remove(app_config.secret_hash_path)
                except FileNotFoundError:
                    pass
                await maybe_emit("server_secret_reset", client_id, sid)
            except Exception as e:
                await maybe_emit(
                    "failed_resetting_server_secret", client_id, sid, {"error": repr(e)}
                )

    @sio.event
    async def connect(sid, environ, auth):
        """
        Connect a client to the server using clientId for identification.
        """
        # TODO: handle authentication
        client_id = auth.get("clientId", app_config.default_client_id)

        # Store the sid to client mapping
        sid_to_client[sid] = client_id

        if len(sid_to_client) <= app_config.max_sessions:
            if client_id in handler_manager:
                print(f"New session {sid} created for client {client_id}")
            else:
                print(f"New client {client_id} connected with session {sid}")
                handler_manager[client_id] = SessionHandler(
                    saved_policies_path=app_config.toml_path
                )
        else:
            print(f"Disconnecting client {client_id} due to reaching max sessions")
            for sid in sid_to_client.keys():
                if sid_to_client[sid] == client_id:
                    disconnect(sid)

        print(f"Current clients: {list(handler_manager.keys())}")

    @sio.event
    async def disconnect(sid):
        """
        Disconnect and remove handler using sid to client mapping for guest clients.
        """
        if client_id := sid_to_client.pop(sid, None):
            print(f"Client session disconnected: {client_id} (sid: {sid})")
            # Only remove handler if no other sids are using this client_id and the client is a guest
            if client_id not in app_config.client_ids and not any(
                cid == client_id for cid in sid_to_client.values()
            ):
                if client_id in handler_manager:
                    del handler_manager[client_id]
                    print(f"Removed handler for guest {client_id}")

        # print clients and relevant handlers
        for client_id, _ in handler_manager.items():
            print(
                f"Client {client_id} owns sessions {[sid for sid in sid_to_client if sid_to_client[sid] == client_id]}"
            )

    @sio.event
    async def logOut(sid, client_id):
        """
        Log out a client and remove the handler.
        """
        if client_id := sid_to_client.get(sid, None) and client_id in handler_manager:
            del handler_manager[client_id]
            print(f"Removed handler for client {client_id}")

    @sio.event
    async def getServerConfig(sid):
        """
        Get the server config for the client with sid.
        """
        if client_id := sid_to_client.get(sid):
            try:
                viewable_configs = {
                    "always_guest": app_config.always_guest,
                    "disable_guest": app_config.disable_guest,
                    "no_password": app_config.no_password,
                }
                await maybe_emit("server_config", client_id, sid, viewable_configs)
            except Exception as e:
                await maybe_emit("server_config_not_found", client_id, sid, {"error": repr(e)})

    @sio.event
    async def uploadPolicies(sid, toml_content):
        """
        Create policies for the user with sid. Existing policies are replaced.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    handler.replace_policies(toml_content)
                    await maybe_emit("uploaded_policies", client_id, sid, handler.policies)
                except Exception as e:
                    await maybe_emit("error_uploading_policies", client_id, sid, {"error": repr(e)})

    @sio.event
    async def downloadPolicies(sid):
        """
        Download the policies for the user with sid as a TOML string.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    await maybe_emit(
                        "downloaded_policies", client_id, sid, handler.dump_policies_as_toml()
                    )
                except Exception as e:
                    await maybe_emit(
                        "error_downloading_policies", client_id, sid, {"error": repr(e)}
                    )

    @sio.event
    async def getPolicies(sid):
        """
        Get the policies for the user with sid as a list of dictionaries.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    await maybe_emit("policies", client_id, sid, handler.policies)
                except Exception as e:
                    await maybe_emit("internal_error", client_id, sid, {"error": repr(e)})

    @sio.event
    async def savePolicy(sid, policy_name, policy_update):
        """
        Save the policy with the given name and update the parameters. Create a new policy if the name does not exist.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    handler.save_policy(policy_name, **policy_update)
                    await maybe_emit("policies_after_save", client_id, sid, handler.policies)
                except Exception as e:
                    await maybe_emit(
                        "error_saving_policy",
                        client_id,
                        sid,
                        {"policy_name": policy_name, "error": repr(e)},
                    )

    @sio.event
    async def createPolicy(sid, policy):
        """
        Create a new policy with the given name and update the parameters.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    handler.create_policy(**policy)
                    await maybe_emit("policies_after_create", client_id, sid, handler.policies)
                except Exception as e:
                    await maybe_emit(
                        "error_creating_policy",
                        client_id,
                        sid,
                        {"policy_name": policy.get("name", ""), "error": repr(e)},
                    )

    @sio.event
    async def deletePolicy(sid, policy_name):
        """
        Delete a policy with the given name.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    handler.delete_policy(policy_name)
                    await maybe_emit("policies_after_delete", client_id, sid, handler.policies)
                except Exception as e:
                    await maybe_emit(
                        "error_deleting_policy",
                        client_id,
                        sid,
                        {"policy_name": policy_name, "error": repr(e)},
                    )

    @sio.event
    async def authenticate(sid, policy_name, password):
        """
        Authenticate the policy with the given password. Note that this may lead to a MFA request.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    if policy := handler.get_policy(policy_name):
                        result, msg = policy.authenticate(password)
                        match result:
                            case AuthenticationResult.SUCCESS:
                                await maybe_emit(
                                    "authenticated",
                                    client_id,
                                    sid,
                                    {"msg": msg, "policies": handler.policies},
                                )
                            case AuthenticationResult.FAILED:
                                await maybe_emit("authentication_failed", client_id, sid, msg)
                            case AuthenticationResult.MFA_REQUIRED:
                                await maybe_emit("mfa_required", client_id, sid, msg)
                except Exception as e:
                    await maybe_emit("authentication_failed", client_id, sid, repr(e))

    @sio.event
    async def provideMFA(sid, policy_name, mfa_code):
        """
        Finish the authentication for a policy with the MFA code. Note that this may lead to a MFA request if the MFA code is incorrect.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    if policy := handler.get_policy(policy_name):
                        result, msg = policy.provide_mfa(mfa_code)
                        match result:
                            case AuthenticationResult.SUCCESS:
                                await maybe_emit(
                                    "authenticated",
                                    client_id,
                                    sid,
                                    {"msg": msg, "policies": handler.policies},
                                )
                            case AuthenticationResult.MFA_REQUIRED:
                                await maybe_emit("mfa_required", client_id, sid, msg)
                except Exception as e:
                    await maybe_emit("authentication_failed", client_id, sid, repr(e))

    @sio.event
    async def start(sid, policy_name):
        """
        Start the download for the policy with the given name.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                # Set up logging
                logger, log_capture_stream = build_logger(policy_name)
                try:
                    if policy := handler.get_policy(policy_name):
                        # Check if another policy using the iCloud instance is running
                        if occupying_policy_name := handler.icloud_instance_occupied_by(
                            policy.username
                        ):
                            await maybe_emit(
                                "icloud_is_busy",
                                client_id,
                                sid,
                                f"iCloud user {policy.username} has another policy running: {occupying_policy_name}",
                            )
                            return

                        task = asyncio.create_task(policy.start(logger))
                        last_progress = 0
                        while not task.done():
                            await asyncio.sleep(1)
                            if policy.status == PolicyStatus.RUNNING and (
                                logs := log_capture_stream.read_new_lines()
                                or policy.progress != last_progress
                            ):
                                await maybe_emit(
                                    "download_progress",
                                    client_id,
                                    sid,
                                    {
                                        "policy": policy.dump(),
                                        "logs": logs,
                                    },
                                )
                                last_progress = policy.progress
                        if exception := task.exception():
                            policy.status = PolicyStatus.ERRORED
                            logger.error(f"Download failed: {repr(exception)}")
                            await maybe_emit(
                                "download_failed",
                                client_id,
                                sid,
                                {
                                    "policy": policy.dump(),
                                    "error": repr(exception),
                                    "logs": log_capture_stream.read_new_lines(),
                                },
                            )
                            return

                        await maybe_emit(
                            "download_finished",
                            client_id,
                            sid,
                            {
                                "policy_name": policy_name,
                                "progress": policy.progress,
                                "logs": log_capture_stream.read_new_lines(),
                            },
                        )
                except Exception as e:
                    policy.status = PolicyStatus.ERRORED
                    await maybe_emit(
                        "download_failed",
                        client_id,
                        sid,
                        {
                            "policy": policy.dump(),
                            "error": repr(e),
                            "logs": f"Internal error: {repr(e)}\n",
                        },
                    )
                finally:
                    # Clean up logger and log capture stream
                    if logger and hasattr(logger, "handlers"):
                        for handler in logger.handlers[:]:
                            handler.close()
                            logger.removeHandler(handler)

                    if log_capture_stream and hasattr(log_capture_stream, "close"):
                        log_capture_stream.close()

    @sio.event
    async def interrupt(sid, policy_name):
        """
        Interrupt the download for the policy with the given name.
        """
        if client_id := sid_to_client.get(sid):
            if handler := handler_manager.get(client_id):
                try:
                    if policy := handler.get_policy(policy_name):
                        policy.interrupt()
                except Exception as e:
                    await maybe_emit(
                        "error_interrupting_download",
                        client_id,
                        sid,
                        {"policy_name": policy_name, "error": repr(e)},
                    )

    return app, sio
