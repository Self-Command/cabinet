# Claude Code external config

This directory is bind-mounted into the Cabinet container so Claude Code can be
configured without editing Cabinet source code.

Runtime mounts:

- `./claude/home` -> `/home/cabinet`
- `./claude/project` -> `/data/.claude`
- `./claude/claude.env` -> optional Compose env file

Important files after first container start:

- `home/.claude/settings.json`: Claude Code user settings.
- `home/.claude/CLAUDE.md`: User-level Claude instructions.
- `home/.claude/agents/`: User-level Claude subagents.
- `home/.claude.json`: User/global MCP and Claude Code state.
- `project/settings.json`: Cabinet data project shared Claude settings.
- `project/settings.local.json`: Cabinet data project local Claude settings.
- `project/CLAUDE.md`: Project-level Claude instructions.
- `project/.mcp.json`: Project MCP config, symlinked in the container as `/data/.mcp.json`.

Do not commit real credentials here.
