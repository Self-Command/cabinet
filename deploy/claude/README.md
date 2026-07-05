# Claude Code external config

This directory is bind-mounted into the Cabinet container so Claude Code can be
configured without editing Cabinet source code.

Runtime mounts:

- `./claude/home` -> `/home/cabinet`
- `./claude/claude.env` -> optional Compose env file
- `./data` -> `/data` for Cabinet data and project-level Claude files

Important files after first container start:

- `home/.claude/settings.json`: Claude Code user settings.
- `home/.claude/CLAUDE.md`: User-level Claude instructions.
- `home/.claude/agents/`: User-level Claude subagents.
- `home/.claude.json`: User/global MCP and Claude Code state.
- `../data/.claude/settings.json`: Cabinet data project shared Claude settings.
- `../data/.claude/settings.local.json`: Cabinet data project local Claude settings.
- `../data/.claude/CLAUDE.md`: Project-level Claude instructions.
- `../data/.mcp.json`: Project MCP config.
- `../data/CLAUDE.md`: Optional project-root Claude instructions.

Do not commit real credentials here.
