# icloudpd-web Docker Image

Current package version: 2026.4.20.post1

## Quick Start

```bash
docker run -d \
  --name icloudpd-web \
  -p 5000:5000 \
  -v ./data:/data \
  -v ./downloads:/downloads \
  spicadust/icloudpd-web:latest
```

`/data` holds policies, secrets, cookies and run logs. `/downloads` is where
your policies write photos — mount any host directories your policies'
`directory` field points at.

The server starts passwordless unless `PASSWORD_HASH` is set (see below).

## Environment Variables

- `HOST`: host to bind to (default: `0.0.0.0`)
- `PORT`: port to bind to (default: `5000`)
- `DATA_DIR`: path for persistent state inside the container (default: `/data`)
- `PASSWORD_HASH`: scrypt hash of the server password. Generate with:
  ```bash
  docker run --rm spicadust/icloudpd-web:latest icloudpd-web init-password 'yourpw'
  ```
  If unset, the server runs passwordless and logs a warning on startup.
- `SESSION_SECRET`: stable session secret across restarts. If unset, a random
  one is generated on each boot and all sessions are invalidated on restart.
  Generate with: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

## Using Docker Compose

1. Clone the repository from Github
2. Modify the `docker-compose.yml` file as needed
3. Run:

```bash
docker compose up -d
```
