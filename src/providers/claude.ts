import { readFile, writeFile } from "fs/promises"
import { homedir } from "os"
import { join } from "path"
import type { ProviderUsage } from "../types"

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json")
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token"

interface ClaudeCredentials {
  claudeAiOauth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    subscriptionType?: string
    rateLimitTier?: string
  }
}

interface UsageWindow {
  utilization: number
  resets_at: string
}

interface ClaudeUsageResponse {
  five_hour: UsageWindow
  seven_day: UsageWindow
}

async function readCredentials(): Promise<ClaudeCredentials> {
  const raw = await readFile(CREDENTIALS_PATH, "utf-8")
  return JSON.parse(raw)
}

async function refreshToken(creds: ClaudeCredentials): Promise<string> {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: creds.claudeAiOauth.refreshToken,
    }),
  })

  if (!resp.ok) throw new Error(`Token refresh failed: ${resp.status}`)

  const data = (await resp.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  creds.claudeAiOauth.accessToken = data.access_token
  creds.claudeAiOauth.refreshToken = data.refresh_token
  creds.claudeAiOauth.expiresAt = Date.now() + data.expires_in * 1000

  await writeFile(CREDENTIALS_PATH, JSON.stringify(creds, null, 2))
  return data.access_token
}

export async function fetchClaude(): Promise<ProviderUsage> {
  const base: ProviderUsage = { id: "claude", name: "Claude Code", available: false }

  let creds: ClaudeCredentials
  try {
    creds = await readCredentials()
  } catch {
    return { ...base, error: "No credentials found" }
  }

  base.available = true

  let token = creds.claudeAiOauth.accessToken

  if (Date.now() > creds.claudeAiOauth.expiresAt - 60_000) {
    try {
      token = await refreshToken(creds)
    } catch (e) {
      return { ...base, error: `Token refresh failed: ${e}` }
    }
  }

  const plan = creds.claudeAiOauth.subscriptionType ?? "unknown"

  try {
    const resp = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    })

    if (!resp.ok) {
      return { ...base, error: `API ${resp.status}: ${await resp.text()}`, account: { plan } }
    }

    const usage = (await resp.json()) as ClaudeUsageResponse

    return {
      ...base,
      primary: {
        percent_used: Math.round(usage.five_hour.utilization),
        resets_at: usage.five_hour.resets_at,
        label: "Session (5h)",
      },
      secondary: {
        percent_used: Math.round(usage.seven_day.utilization),
        resets_at: usage.seven_day.resets_at,
        label: "Weekly (7d)",
      },
      account: { plan },
    }
  } catch (e) {
    return { ...base, error: `Fetch failed: ${e}`, account: { plan } }
  }
}
