#!/usr/bin/env bash
set -euo pipefail

: "${CABINET_APP_PORT:=4000}"
: "${CABINET_DAEMON_PORT:=4100}"
: "${CABINET_DATA_DIR:=/data}"
: "${CABINET_ENV_FILE:=/app/.cabinet.env}"
: "${HOSTNAME:=0.0.0.0}"
: "${PORT:=$CABINET_APP_PORT}"

export CABINET_APP_PORT CABINET_DAEMON_PORT CABINET_DATA_DIR HOSTNAME PORT
export NODE_ENV="${NODE_ENV:-production}"
export CABINET_TELEMETRY_DISABLED="${CABINET_TELEMETRY_DISABLED:-1}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
export DISABLE_AUTOUPDATER="${DISABLE_AUTOUPDATER:-1}"

if [ -f "$CABINET_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$CABINET_ENV_FILE"
  set +a
fi

if [ -z "${CABINET_APP_ORIGIN:-}" ]; then
  export CABINET_APP_ORIGIN="http://127.0.0.1:${CABINET_APP_PORT}"
fi
if [ -z "${CABINET_DAEMON_URL:-}" ]; then
  export CABINET_DAEMON_URL="http://127.0.0.1:${CABINET_DAEMON_PORT}"
fi
if [ -z "${CABINET_PUBLIC_DAEMON_ORIGIN:-}" ]; then
  export CABINET_PUBLIC_DAEMON_ORIGIN="http://127.0.0.1:${CABINET_DAEMON_PORT}"
fi

server_js=""
if [ -f "/app/.next/standalone/server.js" ]; then
  server_js="/app/.next/standalone/server.js"
elif [ -f "/app/.next/standalone/cabinet/server.js" ]; then
  server_js="/app/.next/standalone/cabinet/server.js"
fi

if [ -n "${ANTHROPIC_API_KEY:-}${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "[cabinet] Claude credentials detected in ${CABINET_ENV_FILE}."
else
  echo "[cabinet] WARNING: no ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN detected."
fi

if [ -n "$server_js" ]; then
  echo "[cabinet] Starting Next.js standalone server on ${CABINET_APP_PORT}..."
  node "$server_js" &
else
  echo "[cabinet] Starting Next.js server on ${CABINET_APP_PORT}..."
  ./node_modules/.bin/next start -p "$CABINET_APP_PORT" -H "$HOSTNAME" &
fi
app_pid=$!

echo "[cabinet] Starting Cabinet daemon on ${CABINET_DAEMON_PORT}..."
node ./node_modules/tsx/dist/cli.mjs server/cabinet-daemon.ts &
daemon_pid=$!

term() {
  echo "[cabinet] Stopping..."
  kill -TERM "$app_pid" "$daemon_pid" 2>/dev/null || true
  wait "$app_pid" "$daemon_pid" 2>/dev/null || true
}
trap term INT TERM

while true; do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    wait "$app_pid"
    exit $?
  fi
  if ! kill -0 "$daemon_pid" 2>/dev/null; then
    wait "$daemon_pid"
    exit $?
  fi
  sleep 2
done
