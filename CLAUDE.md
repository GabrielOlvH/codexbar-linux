# CodexBar Linux

AI coding assistant usage monitor for DankBar (DMS/niri).

## Architecture

- `src/` - Bun TypeScript backend that fetches provider data and outputs JSON to stdout
- `~/.config/DankMaterialShell/plugins/CodexBar/` - DMS plugin (QML) that displays data in the bar

## Running

```bash
# Fetch all providers
bun run src/index.ts --all

# Detect active provider from focused window
bun run src/index.ts --detect

# Both
bun run src/index.ts --all --detect

# Single provider
bun run src/index.ts --provider claude
```

## Providers

| Provider | Auth Source | API |
|----------|-----------|-----|
| Claude | `~/.claude/.credentials.json` | OAuth usage API |
| Codex | `~/.codex/sessions/**/*.jsonl` | Local JSONL parsing |
| Cursor | `~/.config/Cursor/User/globalStorage/state.vscdb` | cursor.com/api/usage |
| Copilot | `gh auth token` | api.github.com/copilot_internal/user |
| Kimi | `~/.kimi/credentials/kimi-code.json` | api.kimi.com/coding/v1/usages |
