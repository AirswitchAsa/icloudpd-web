from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

# Create Socket.IO server
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=["http://localhost:3000"])

# Create FastAPI app
app = FastAPI(title="iCloudPD API", description="API for iCloud Photos Downloader", version="0.1.0")


# Configure CORS for REST endpoints
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create ASGI app by wrapping FastAPI with Socket.IO
socket_app = socketio.ASGIApp(sio, app)


@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")


@sio.event
async def getPolicies(sid):
    # Example response
    policies = [
        {"name": "Test", "account": "test@example.com", "album": "Test Album", "status": "active"}
    ]
    await sio.emit("policies", policies, to=sid)


@app.get("/")
async def root():
    """Root endpoint to verify API is running."""
    return {"status": "ok", "message": "iCloudPD API is running"}
