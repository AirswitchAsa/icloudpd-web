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
@click.option(
    "--secret-hash-path",
    help="Path to the secret hash file. The secret hash will be saved to ~/.icloudpd_web/secret_hash by default.",
)
@click.option(
    "--max-sessions",
    type=int,
    help="Maximum number of sessions to allow. Default: 5",
)

@click.option(
    "--no-password",
    is_flag=True,
    help="Disable server password authentication. Use it only when access is trusted. This can be configured later in the web interface.",
)

@click.option(
    "--always-guest",
    is_flag=True,
    help="Always login the user as a guest. This can be configured later in the web interface.",
)

@click.option(
    "--disable-guest",
    is_flag=True,
    help="Disable guest login. This can be configured later in the web interface.",
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
    secret_hash_path: str,
    max_sessions: int,
    no_password: bool,
    always_guest: bool,
    disable_guest: bool,
):
    """Launch the iCloud Photos Downloader server with the Web interface"""

    if toml_path:
        os.environ["TOML_PATH"] = toml_path

    if allowed_origins:
        os.environ["ALLOWED_ORIGINS"] = ",".join(allowed_origins)

    if secret_hash_path:
        os.environ["SECRET_HASH_PATH"] = secret_hash_path

    if max_sessions:
        os.environ["MAX_SESSIONS"] = str(max_sessions)

    if no_password and always_guest:
        raise click.BadParameter("Cannot enable --no-password and --always-guest together")
    if always_guest and disable_guest:
        raise click.BadParameter("Cannot enable --always-guest and --disable-guest together")

    if no_password:
        os.environ["NO_PASSWORD"] = "true"

    if always_guest:
        os.environ["ALWAYS_GUEST"] = "true"

    if disable_guest:
        os.environ["DISABLE_GUEST"] = "true"

    if server_only:
        uvicorn.run("icloudpd_web.dev:socket_app", host=host, port=port, reload=reload)
    else:
        uvicorn.run("icloudpd_web.main:socket_app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()