#!/usr/bin/env bash
set -euo pipefail

: "${CABINET_DATA_DIR:=/data}"
: "${CABINET_ENV_FILE:=/app/.cabinet.env}"
: "${HOME:=/home/cabinet}"
: "${CLAUDE_CONFIG_DIR:=$HOME/.claude}"

mkdir -p \
  "$CABINET_DATA_DIR" \
  "$CABINET_DATA_DIR/.claude" \
  "$HOME" \
  "$CLAUDE_CONFIG_DIR" \
  "$HOME/.config" \
  /app/.next/cache

ensure_json_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    printf '{}\n' > "$file"
  fi
}

ensure_text_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    : > "$file"
  fi
}

ensure_json_file "$CLAUDE_CONFIG_DIR/settings.json"
ensure_text_file "$CLAUDE_CONFIG_DIR/CLAUDE.md"
ensure_json_file "$HOME/.claude.json"
ensure_json_file "$CABINET_DATA_DIR/.claude/settings.json"
ensure_json_file "$CABINET_DATA_DIR/.claude/settings.local.json"
ensure_text_file "$CABINET_DATA_DIR/.claude/CLAUDE.md"
ensure_json_file "$CABINET_DATA_DIR/.claude/.mcp.json"

if [ ! -e "$CABINET_DATA_DIR/.mcp.json" ]; then
  ln -s ".claude/.mcp.json" "$CABINET_DATA_DIR/.mcp.json"
fi

if [ ! -f "$CABINET_ENV_FILE" ]; then
  install -m 0600 -o cabinet -g cabinet /dev/null "$CABINET_ENV_FILE"
fi

chown -R cabinet:cabinet "$CABINET_DATA_DIR" "$HOME" /app/.next/cache
chown cabinet:cabinet "$CABINET_ENV_FILE" 2>/dev/null || true
chmod 0600 "$CABINET_ENV_FILE" 2>/dev/null || true

if [ ! -f "$CABINET_DATA_DIR/.cabinet" ]; then
  mkdir -p "$CABINET_DATA_DIR/.agents" "$CABINET_DATA_DIR/.jobs" "$CABINET_DATA_DIR/.cabinet-state"
  cat > "$CABINET_DATA_DIR/.cabinet" <<'EOF'
schemaVersion: 1
id: cloud-home-root
name: Cloud Home
kind: root
version: 0.1.0
description: Cloud-hosted Cabinet workspace.
entry: index.md
EOF
  cat > "$CABINET_DATA_DIR/index.md" <<'EOF'
---
title: "Cloud Home"
---

# Cloud Home

Welcome to your cloud-hosted Cabinet.
EOF
  chown -R cabinet:cabinet "$CABINET_DATA_DIR"
fi

exec gosu cabinet "$@"
