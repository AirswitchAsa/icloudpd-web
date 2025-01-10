import socketio

from icloudpd_web.app import create_app


# Create the app without static file serving
app, sio = create_app(serve_static=False)

# ASGI app by wrapping FastAPI with Socket.IO
socket_app = socketio.ASGIApp(sio, app)
