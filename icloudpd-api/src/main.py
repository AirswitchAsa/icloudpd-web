from fastapi import FastAPI, WebSocket, Path
from fastapi.middleware.cors import CORSMiddleware
from .websockets import handle_websocket

app = FastAPI(
    title="iCloudPD API",
    description="API for iCloud Photos Downloader",
    version="0.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint to verify API is running."""
    return {"status": "ok", "message": "iCloudPD API is running"}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: str = Path(..., description="Unique identifier for the client")
):
    """WebSocket endpoint for real-time communication."""
    await handle_websocket(websocket, client_id) 