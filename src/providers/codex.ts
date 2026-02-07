import { readFile } from "fs/promises"
import { homedir } from "os"
import { join } from "path"
import type { ProviderUsage } from "../types"

const AUTH_PATH = join(homedir(), ".codex", "auth.json")
const SESSIONS_DIR = join(homedir(), ".codex", "sessions")

interface CodexAuth {
  tokens: {
    id_token: string
    access_token: string
  }
}

interface TokenCountEvent {
  timestamp: string
  type: "event_msg"
  payload: {
    type: "token_count"
    rate_limits: {
      primary: { used_percent: number; window_minutes: number; resets_at: number }
      secondary: { used_percent: number; window_minutes: number; resets_at: number }
      credits: { has_credits: boolean; unlimited: boolean; balance: number | null }
      plan_type: string | null
    }
  }
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split(".")[1]
  return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
}

async function findSessionFiles(): Promise<string[]> {
  const now = new Date()
  const allFiles: string[] = []

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now)
    date.setDate(date.getDate() - dayOffset)

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")

    const dayDir = join(SESSIONS_DIR, String(year), month, day)

    try {
      const glob = new Bun.Glob("*.jsonl")
      for await (const file of glob.scan(dayDir)) {
        allFiles.push(join(dayDir, file))
      }
    } catch {
      continue
    }
  }

  allFiles.sort()
  allFiles.reverse()
  return allFiles
}

async function getLatestRateLimits(filePath: string): Promise<TokenCountEvent["payload"]["rate_limits"] | null> {
  const content = await readFile(filePath, "utf-8")
  const lines = content.trim().split("\n")

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]) as TokenCountEvent
      if (event.payload?.type === "token_count" && event.payload.rate_limits) {
        return event.payload.rate_limits
      }
    } catch {
      continue
    }
  }

  return null
}

export async function fetchCodex(): Promise<ProviderUsage> {
  const base: ProviderUsage = { id: "codex", name: "Codex", available: false }

  let auth: CodexAuth
  try {
    const raw = await readFile(AUTH_PATH, "utf-8")
    auth = JSON.parse(raw)
  } catch {
    return { ...base, error: "No credentials found" }
  }

  base.available = true

  let email: string | undefined
  let plan: string | undefined
  try {
    const claims = decodeJwtPayload(auth.tokens.id_token)
    email = claims.email as string | undefined
    const authInfo = claims["https://api.openai.com/auth"] as Record<string, unknown> | undefined
    plan = authInfo?.chatgpt_plan_type as string | undefined
  } catch {}

  const sessionFiles = await findSessionFiles()
  if (sessionFiles.length === 0) {
    return { ...base, error: "No recent sessions found", account: { email, plan } }
  }

  let rateLimits: TokenCountEvent["payload"]["rate_limits"] | null = null
  for (const file of sessionFiles) {
    rateLimits = await getLatestRateLimits(file)
    if (rateLimits) break
  }

  if (!rateLimits) {
    return { ...base, error: "No rate limit data in sessions", account: { email, plan } }
  }

  return {
    ...base,
    primary: {
      percent_used: Math.round(rateLimits.primary.used_percent),
      resets_at: new Date(rateLimits.primary.resets_at * 1000).toISOString(),
      label: `Session (${rateLimits.primary.window_minutes / 60}h)`,
    },
    secondary: {
      percent_used: Math.round(rateLimits.secondary.used_percent),
      resets_at: new Date(rateLimits.secondary.resets_at * 1000).toISOString(),
      label: `Weekly (${Math.round(rateLimits.secondary.window_minutes / 60 / 24)}d)`,
    },
    account: { email, plan },
  }
}
