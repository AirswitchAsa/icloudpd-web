import uvicorn
import click
import os


@click.command()
@click.option("--host", default="0.0.0.0", help="Host to bind to. Default: 0.0.0.0")
@click.option("--port", default=5000, help="Port to bind to. Default: 5000")
@click.option(
    "--toml-path",
    help="Path to the toml file containing policies definition. The policies will be save to ./policies.toml by default.",
)
@click.option(
    "--allowed-origins",
    multiple=True,
    help="Allowed CORS origins. Pass values with space to specify multiple origins. Warning: '*' will be used if not specified, and this is not recommended for production.",
)
# dev options
@click.option(
    "--server-only",
    is_flag=True,
    help="Only run the server without webui. Use it when running the Next.JS server separately.",
)
@click.option(
    "--reload",
    is_flag=True,
    help="Enable auto-reload. This is intended to be used during development.",
)
def main(
    host: str,
    port: int,
    reload: bool,
    server_only: bool,
    toml_path: str,
    allowed_origins: tuple[str],
):
    """Launch the iCloud Photos Downloader server with the Web interface"""

    if toml_path:
        os.environ["TOML_PATH"] = toml_path

    if allowed_origins:
        os.environ["ALLOWED_ORIGINS"] = ",".join(allowed_origins)

    if server_only:
        uvicorn.run("icloudpd_web.dev:socket_app", host=host, port=port, reload=reload)
    else:
        uvicorn.run("icloudpd_web.main:socket_app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()