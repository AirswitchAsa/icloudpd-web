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
[[ -n "${HOST:-}" ]]            && args+=(--host "$HOST")
[[ -n "${PORT:-}" ]]            && args+=(--port "$PORT")
[[ -n "${DATA_DIR:-}" ]]        && args+=(--data-dir "$DATA_DIR")
[[ -n "${PASSWORD_HASH:-}" ]]   && args+=(--password-hash "$PASSWORD_HASH")
[[ -n "${SESSION_SECRET:-}" ]]  && args+=(--session-secret "$SESSION_SECRET")

exec icloudpd-web "${args[@]}"
