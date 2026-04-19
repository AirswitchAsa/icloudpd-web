from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles


_PLACEHOLDER = """<!doctype html>
<html><head><title>icloudpd-web</title></head>
<body><main style="font-family:sans-serif;padding:2em;max-width:40em">
<h1>Frontend not built</h1>
<p>The SPA assets are missing. Run <code>make build-web</code> or install from a
release that bundles <code>web_dist/</code>.</p>
</main></body></html>
"""


def install_static(app: FastAPI, static_dir: Path | None) -> None:
    if static_dir is None or not static_dir.exists():

        @app.get("/{full_path:path}", include_in_schema=False)
        def _placeholder(full_path: str) -> HTMLResponse:
            return HTMLResponse(_PLACEHOLDER)

        return

    index = static_dir / "index.html"
    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=assets_dir),
            name="assets",
        )

    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa(full_path: str) -> FileResponse:
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)
