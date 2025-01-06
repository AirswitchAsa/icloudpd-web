from icloudpd_api.session_handler import SessionHandler
from icloudpd_api.data_models import AuthenticationResult
from icloudpd_api.policy_handler import PolicyStatus
from icloudpd_api.logger import build_logger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
import socketio
import asyncio

MAX_SESSIONS = 5
DEFAULT_CLIENT_ID = "default-user"

# Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi", cors_allowed_origins=["http://pulse.local:3000", "http://localhost:3000"]
)

# FastAPI app
app = FastAPI(title="iCloudPD API", description="API for iCloud Photos Downloader", version="0.1.0")


# Configure CORS for REST endpoints
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://pulse.local:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ASGI app by wrapping FastAPI with Socket.IO
socket_app = socketio.ASGIApp(sio, app)

handler_manager: dict[str, SessionHandler] = {}
# Mapping to track which sids ownership by clientId
sid_to_client: dict[str, str] = {}


@sio.event
async def connect(sid, environ, auth):
    """
    Connect a client to the server using clientId for identification.
    """

    # TODO: handle authentication
    client_id = auth.get("clientId", DEFAULT_CLIENT_ID)

    # Store the sid to client mapping
    sid_to_client[sid] = client_id

    if len(sid_to_client) <= MAX_SESSIONS:
        if client_id in handler_manager:
            print(f"New session {sid} created for client {client_id}")
        else:
            print(f"New client {client_id} connected with session {sid}")
            handler_manager[client_id] = SessionHandler(
                saved_policies_path="../policy/example.toml"
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
    Disconnect handling using sid to client mapping.
    """
    if client_id := sid_to_client.pop(sid, None):
        print(f"Client session disconnected: {client_id} (sid: {sid})")
        # Only remove handler if no other sids are using this client_id
        if not any(cid == client_id for cid in sid_to_client.values()):
            if client_id in handler_manager:
                del handler_manager[client_id]
                print(f"Removed handler for {client_id}")

    # print clients and relevant handlers
    for client_id, _ in handler_manager.items():
        print(
            f"Client {client_id} owns sessions {[sid for sid in sid_to_client if sid_to_client[sid] == client_id]}"
        )


@sio.event
async def uploadPolicies(sid, policies):
    """
    Create policies for the user with sid. Existing policies are replaced.
    """
    if client_id := sid_to_client.get(sid):
        if handler := handler_manager.get(client_id):
            try:
                handler.replace_policies(policies)
                await sio.emit("uploaded_policies", handler.policies, to=sid)
            except Exception as e:
                await sio.emit("error_uploading_policies", {"error": repr(e)}, to=sid)


@sio.event
async def getPolicies(sid):
    """
    Get the policies for the user with sid as a list of dictionaries.
    """
    if client_id := sid_to_client.get(sid):
        if handler := handler_manager.get(client_id):
            try:
                await sio.emit("policies", handler.policies, to=sid)
            except Exception as e:
                await sio.emit("internal_error", {"error": repr(e)}, to=sid)


@sio.event
async def savePolicy(sid, policy_name, policy_update):
    """
    Save the policy with the given name and update the parameters. Create a new policy if the name does not exist.
    """
    if client_id := sid_to_client.get(sid):
        if handler := handler_manager.get(client_id):
            try:
                handler.save_policy(policy_name, **policy_update)
                await sio.emit("policies_after_save", handler.policies, to=sid)
            except Exception as e:
                await sio.emit(
                    "error_saving_policy",
                    {"policy_name": policy_name, "error": repr(e)},
                    to=sid,
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
                await sio.emit("policies_after_delete", handler.policies, to=sid)
            except Exception as e:
                await sio.emit(
                    "error_deleting_policy",
                    {"policy_name": policy_name, "error": repr(e)},
                    to=sid,
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
                            await sio.emit("authenticated", msg, to=sid)
                        case AuthenticationResult.FAILED:
                            await sio.emit("authentication_failed", msg, to=sid)
                        case AuthenticationResult.MFA_REQUIRED:
                            await sio.emit("mfa_required", msg, to=sid)
            except Exception as e:
                await sio.emit("authentication_failed", repr(e), to=sid)


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
                            await sio.emit("authenticated", msg, to=sid)
                        case AuthenticationResult.MFA_REQUIRED:
                            await sio.emit("mfa_required", msg, to=sid)
            except Exception as e:
                await sio.emit("authentication_failed", repr(e), to=sid)


@sio.event
async def start(sid, policy_name):
    """
    Start the download for the policy with the given name.
    """
    if client_id := sid_to_client.get(sid):
        if handler := handler_manager.get(client_id):
            try:
                if policy := handler.get_policy(policy_name):
                    # Set up logging
                    logger, log_capture_stream = build_logger(policy_name)

                    task = asyncio.create_task(policy.start(logger))
                    last_progress = 0
                    while not task.done():
                        await asyncio.sleep(1)
                        if policy.status == PolicyStatus.RUNNING and (
                            logs := log_capture_stream.read_new_lines()
                            or policy.progress != last_progress
                        ):
                            await sio.emit(
                                "download_progress",
                                {
                                    "policy_name": policy_name,
                                    "progress": policy.progress,
                                    "logs": logs,
                                },
                                to=sid,
                            )
                            last_progress = policy.progress
                    if task.exception() is not None:
                        await sio.emit(
                            "download_failed",
                            {
                                "policy_name": policy_name,
                                "error": repr(task.exception()),
                                "logs": log_capture_stream.read_new_lines(),
                            },
                            to=sid,
                        )
                        return

                    await sio.emit(
                        "download_finished",
                        {
                            "policy_name": policy_name,
                            "logs": log_capture_stream.read_new_lines(),
                        },
                        to=sid,
                    )
            except Exception as e:
                await sio.emit(
                    "download_failed",
                    {
                        "policy_name": policy_name,
                        "error": repr(e),
                        "logs": "",
                    },
                    to=sid,
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
                    await sio.emit("policies_after_interrupt", handler.policies, to=sid)
            except Exception as e:
                await sio.emit(
                    "error_interrupting_download",
                    {"policy_name": policy_name, "error": repr(e)},
                    to=sid,
                )


@app.get("/")
async def root():
    """Root endpoint to verify API is running."""
    return {"status": "ok", "message": "iCloudPD API is running"}
