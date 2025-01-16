#!/bin/bash

# Initialize command with base executable
CMD="icloudpd-web"

# Map environment variables to CLI arguments
[[ ! -z "$HOST" ]] && CMD="$CMD --host $HOST"
[[ ! -z "$PORT" ]] && CMD="$CMD --port $PORT"
[[ ! -z "$TOML_PATH" ]] && CMD="$CMD --toml-path $TOML_PATH"
[[ ! -z "$ALLOWED_ORIGINS" ]] && CMD="$CMD --allowed-origins $ALLOWED_ORIGINS"
[[ ! -z "$SECRET_HASH_PATH" ]] && CMD="$CMD --secret-hash-path $SECRET_HASH_PATH"
[[ ! -z "$MAX_SESSIONS" ]] && CMD="$CMD --max-sessions $MAX_SESSIONS"
[[ ! -z "$GUEST_TIMEOUT_SECONDS" ]] && CMD="$CMD --guest-timeout-seconds $GUEST_TIMEOUT_SECONDS"
[[ ! -z "$COOKIE_DIRECTORY" ]] && CMD="$CMD --cookie-directory $COOKIE_DIRECTORY"
[[ ! -z "$APPRISE_CONFIG_PATH" ]] && CMD="$CMD --apprise-config-path $APPRISE_CONFIG_PATH"
# Handle boolean flags
[[ "$NO_PASSWORD" == "true" ]] && CMD="$CMD --no-password"
[[ "$ALWAYS_GUEST" == "true" ]] && CMD="$CMD --always-guest"
[[ "$DISABLE_GUEST" == "true" ]] && CMD="$CMD --disable-guest"
[[ "$SERVER_ONLY" == "true" ]] && CMD="$CMD --server-only"
[[ "$RELOAD" == "true" ]] && CMD="$CMD --reload"

# Execute the command
exec $CMD
