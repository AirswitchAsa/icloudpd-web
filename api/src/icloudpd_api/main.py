from icloudpd_api.session_handler import SessionHandler
from icloudpd_api.data_models import AuthenticationResult
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio


# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi", cors_allowed_origins=["http://pulse.local:3000", "http://localhost:3000"]
)

# Create FastAPI app
app = FastAPI(title="iCloudPD API", description="API for iCloud Photos Downloader", version="0.1.0")


# Configure CORS for REST endpoints
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://pulse.local:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create ASGI app by wrapping FastAPI with Socket.IO
socket_app = socketio.ASGIApp(sio, app)

handler_manager: dict[str, SessionHandler] = {}


@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")
    handler_manager[sid] = SessionHandler(saved_policies_path="../policy/example.toml")
    print(handler_manager)


@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    del handler_manager[sid]


@sio.event
async def getPolicies(sid):
    if handler := handler_manager.get(sid):
        await sio.emit("policies", handler.policies, to=sid)


@sio.event
async def savePolicy(sid, policy_name, policy_update):
    if handler := handler_manager.get(sid):
        handler.save_policy(policy_name, **policy_update)


@sio.event
async def authenticate(sid, policy_name, password):
    if handler := handler_manager.get(sid):
        if policy := handler.get_policy(policy_name):
            result, msg = policy.authenticate(password)
            match result:
                case AuthenticationResult.SUCCESS:
                    await sio.emit("authenticated", msg, to=sid)
                case AuthenticationResult.FAILED:
                    await sio.emit("authentication_failed", msg, to=sid)
                case AuthenticationResult.MFA_REQUIRED:
                    await sio.emit("mfa_required", msg, to=sid)


@sio.event
async def provideMFA(sid, policy_name, mfa_code):
    if handler := handler_manager.get(sid):
        if policy := handler.get_policy(policy_name):
            result, msg = policy.provide_mfa(mfa_code)
            match result:
                case AuthenticationResult.SUCCESS:
                    await sio.emit("authenticated", msg, to=sid)
                case AuthenticationResult.MFA_REQUIRED:
                    await sio.emit("mfa_required", msg, to=sid)


@app.get("/")
async def root():
    """Root endpoint to verify API is running."""
    return {"status": "ok", "message": "iCloudPD API is running"}
