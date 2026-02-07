# CodexBar Linux

AI coding assistant usage monitor for Linux. See your Claude, Codex, Cursor, Copilot, and Kimi usage limits at a glance — right in your status bar.

A Linux port inspired by [CodexBar](https://github.com/steipete/CodexBar) by [Peter Steinberger](https://github.com/steipete). Built for [DankBar](https://github.com/nicehash/DankMaterialShell) (DMS/niri) with a Bun + TypeScript backend and QML widget frontend.

## Features

- **5 providers** — Claude, OpenAI Codex CLI, Cursor, GitHub Copilot, Kimi
- **Dual usage windows** — primary (hourly/session) and secondary (daily/weekly) limits per provider
- **Auto-detection** — detects which AI assistant is focused by walking the `/proc` process tree
- **Privacy-first** — reads local credentials only; no passwords stored, no browser cookies needed
- **Parallel fetching** — all providers load simultaneously via `Promise.allSettled`
- **DMS widget** — color-coded ring gauges, popout panel with all providers, configurable refresh intervals

## Providers

| Provider | Auth Source | Method |
|----------|-----------|--------|
| Claude | `~/.claude/.credentials.json` | OAuth token → Anthropic usage API |
| Codex | `~/.codex/sessions/` | Local JSONL session file parsing |
| Cursor | `~/.config/Cursor/.../state.vscdb` | SQLite token → api2.cursor.sh |
| Copilot | `gh auth token` | GitHub CLI → copilot_internal API |
| Kimi | `~/.kimi/credentials/kimi-code.json` | OAuth token → Kimi usage API |

## Requirements

- [Bun](https://bun.sh) runtime
- [niri](https://github.com/YaLTeR/niri) window manager (for auto-detection)
- [DankMaterialShell](https://github.com/nicehash/DankMaterialShell) (for the bar widget)

## Installation

```bash
git clone https://github.com/GabrielOlvH/codexbar-linux.git
cd codexbar-linux
bun install
```

### DMS Plugin

Copy the plugin directory to your DMS plugins folder:

```bash
cp -r plugin/ ~/.config/DankMaterialShell/plugins/CodexBar/
```

Then add the CodexBar widget to your DankBar configuration.

## Usage

### CLI

```bash
# Fetch all providers
bun run src/index.ts --all

# Detect active provider from focused window
bun run src/index.ts --detect

# Both (used by the widget)
bun run src/index.ts --all --detect

# Single provider
bun run src/index.ts --provider claude
```

### Output Format

The CLI outputs JSON to stdout:

```json
{
  "providers": [
    {
      "id": "claude",
      "name": "Claude",
      "available": true,
      "primary": { "percent_used": 42, "resets_at": "2025-01-15T18:00:00Z", "label": "5h limit" },
      "secondary": { "percent_used": 15, "resets_at": "2025-01-20T00:00:00Z", "label": "7d limit" },
      "account": { "email": "user@example.com", "plan": "pro" }
    }
  ],
  "active_provider": "claude",
  "timestamp": "2025-01-15T14:30:00.000Z"
}
```

## How Detection Works

When `--detect` is passed, CodexBar:

1. Queries niri for the focused window via `niri msg --json focused-window`
2. Checks the `app_id` for known editors (Cursor, VS Code → Copilot)
3. If the focused app is a terminal (Ghostty, Kitty, Alacritty, etc.), walks the `/proc` process tree recursively through `/proc/{pid}/task/*/children` to find child process names
4. Maps process names to providers (`claude` → Claude, `codex` → Codex, `kimi` → Kimi)

## Project Structure

```
codexbar-linux/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── types.ts           # TypeScript interfaces
│   ├── detect.ts          # Window/process detection
│   └── providers/
│       ├── claude.ts      # Claude (Anthropic OAuth)
│       ├── codex.ts       # Codex CLI (local JSONL)
│       ├── cursor.ts      # Cursor (SQLite + API)
│       ├── copilot.ts     # GitHub Copilot (gh CLI)
│       └── kimi.ts        # Kimi Code (OAuth)
└── plugin/
    ├── plugin.json             # DMS plugin metadata
    ├── CodexBarWidget.qml      # Bar widget + popout
    └── CodexBarSettings.qml    # Settings panel
```

## Attribution

This project is a Linux port inspired by [CodexBar](https://github.com/steipete/CodexBar) by [Peter Steinberger (@steipete)](https://github.com/steipete) — a macOS menu bar app for monitoring AI coding assistant usage. The original CodexBar supports 14+ providers and is available via Homebrew (`brew install --cask steipete/tap/codexbar`).

CodexBar Linux is an independent implementation built from scratch for the Linux/niri/DMS ecosystem, sharing the concept and name with permission under the MIT license.

## License

[MIT](LICENSE) — same as the original CodexBar.
