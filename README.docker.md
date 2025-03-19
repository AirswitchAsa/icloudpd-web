# icloudpd-web Docker Image

Current package version: 2025.3.18.dev1

## Quick Start

```bash
docker run -d --name icloudpd-web -p 5000:5000 -v /path/to/icloudpd-web:/app spicadust/icloudpd-web:latest
```

## Environment Variables

The following environment variables can be used to configure the application:

- `HOST`: Host to bind to (default: 0.0.0.0)
- `PORT`: Port to bind to (default: 5000)
- `TOML_PATH`: Path to the TOML file containing policies definition. In most cases you can leave it empty.
- `SECRET_HASH_PATH`: Path to the secret hash file. In most cases you can leave it empty.
- `COOKIE_DIRECTORY`: Path to store icloud session files.
- `APPRISE_CONFIG_PATH`: Path to store AppRise assets.
- `LOG_LOCATION`: Path to store the logs (both server and client)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins. Use `*` to allow all origins, otherwise use the address that you will use to access the web interface.
- `MAX_SESSIONS`: Maximum number of websocket sessions to allow. (default: 10)
- `GUEST_TIMEOUT_SECONDS`: Timeout for guest users in seconds.
- `NO_PASSWORD`: Set to "true" to disable server password authentication.
- `ALWAYS_GUEST`: Set to "true" to always login users as guests.
- `DISABLE_GUEST`: Set to "true" to disable guest login.

## Using Docker Compose

1. Clone the repository from Github
2. Modify the `docker-compose.yml` file as needed
3. Run:

```bash
docker compose up -d
```
