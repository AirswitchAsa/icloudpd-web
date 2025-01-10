from importlib import resources

import socketio

from icloudpd_web.app import create_app


# Get the path to the static files
STATIC_DIR = str(resources.files("icloudpd_web")) + "/webapp"

# Create the app with static file serving enabled
app, sio = create_app(serve_static=True, static_dir=STATIC_DIR)

# ASGI app by wrapping FastAPI with Socket.IO
socket_app = socketio.ASGIApp(sio, app)
