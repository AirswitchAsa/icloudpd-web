#!/bin/bash
set -euo pipefail

# Map env vars to icloudpd-web CLI flags. Only flags that actually exist
# on the current CLI are forwarded. Anything unset is omitted so the CLI
# falls back to its built-in defaults.
#
# Also recognized directly by the CLI (no mapping needed):
#   ICLOUDPD_WEB_PASSWORD_HASH
#   ICLOUDPD_WEB_SESSION_SECRET

args=()
[[ -n "${HOST:-}" ]]                && args+=(--host "$HOST")
[[ -n "${PORT:-}" ]]                && args+=(--port "$PORT")
[[ -n "${DATA_DIR:-}" ]]            && args+=(--data-dir "$DATA_DIR")
[[ -n "${PASSWORD_HASH:-}" ]]       && args+=(--password-hash "$PASSWORD_HASH")
[[ -n "${SESSION_SECRET:-}" ]]      && args+=(--session-secret "$SESSION_SECRET")
[[ -n "${ICLOUDPD_COOKIE_DIR:-}" ]] && args+=(--cookie-dir "$ICLOUDPD_COOKIE_DIR")

# Running as root (the image default): remap appuser to PUID/PGID, take
# ownership of the mount points, and drop privileges. This makes bind
# mounts owned by an arbitrary host user (Synology/NAS setups) writable
# without host-side chown. With `--user` the container skips this block
# and runs as-is (the old behavior).
if [[ "$(id -u)" == "0" ]]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  groupmod -o -g "$PGID" appuser
  usermod  -o -u "$PUID" appuser

  # /data is small (policies, secrets, cookies, logs) — chown recursively.
  # /downloads can be a huge photo library — only claim the top level; files
  # the app writes are created as PUID:PGID anyway. If you change PUID over
  # an existing download tree, chown it once on the host.
  chown -R "$PUID:$PGID" "${DATA_DIR:-/data}" /home/appuser || true
  chown "$PUID:$PGID" /downloads || true

  export HOME=/home/appuser
  exec gosu appuser icloudpd-web "${args[@]}"
fi

exec icloudpd-web "${args[@]}"
