import { fetchClaude } from "./providers/claude"
import { fetchCodex } from "./providers/codex"
import { fetchCursor } from "./providers/cursor"
import { fetchCopilot } from "./providers/copilot"
import { fetchKimi } from "./providers/kimi"
import { detectActiveProvider, getFocusedWindow } from "./detect"
import type { CodexBarOutput, ProviderUsage } from "./types"

const PROVIDERS: Record<string, () => Promise<ProviderUsage>> = {
  claude: fetchClaude,
  codex: fetchCodex,
  cursor: fetchCursor,
  copilot: fetchCopilot,
  kimi: fetchKimi,
}

function parseArgs() {
  const args = process.argv.slice(2)
  return {
    all: args.includes("--all"),
    detect: args.includes("--detect"),
    provider: args.find((_, i, a) => a[i - 1] === "--provider"),
  }
}

async function main() {
  const { all, detect, provider } = parseArgs()

  const output: CodexBarOutput = {
    providers: [],
    timestamp: new Date().toISOString(),
  }

  if (all) {
    const results = await Promise.allSettled(Object.values(PROVIDERS).map((fn) => fn()))
    output.providers = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { id: "unknown", name: "Unknown", available: false, error: String(r.reason) },
    )
  } else if (provider && PROVIDERS[provider]) {
    output.providers = [await PROVIDERS[provider]()]
  }

  if (detect) {
    const result = await getFocusedWindow()
    if (result) {
      output.active_provider = detectActiveProvider(result.window, result.childProcessNames) ?? undefined
    }
  }

  console.log(JSON.stringify(output))
}

main()
