import { readFile, writeFile } from "fs/promises"
import { homedir } from "os"
import { join } from "path"
import type { ProviderUsage } from "../types"

const CREDS_PATH = join(homedir(), ".kimi", "credentials", "kimi-code.json")
const USAGE_URL = "https://api.kimi.com/coding/v1/usages"
const REFRESH_URL = "https://auth.kimi.com/api/oauth/token"
const CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098"

interface KimiCredentials {
  access_token: string
  refresh_token: string
  expires_at: number
  scope: string
  token_type: string
}

async function readCredentials(): Promise<KimiCredentials> {
  const raw = await readFile(CREDS_PATH, "utf-8")
  return JSON.parse(raw)
}

async function refreshToken(creds: KimiCredentials): Promise<string> {
  const resp = await fetch(REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
    }).toString(),
  })

  if (!resp.ok) throw new Error(`Token refresh failed: ${resp.status}`)

  const data = (await resp.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
    token_type: string
  }

  const updated: KimiCredentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() / 1000 + data.expires_in,
    scope: data.scope,
    token_type: data.token_type,
  }
  await writeFile(CREDS_PATH, JSON.stringify(updated, null, 4))
  return data.access_token
}

interface KimiUsageResponse {
  usage?: { used?: number; limit?: number; remaining?: number; name?: string }
  limits?: Array<{
    detail?: { used?: number; limit?: number; remaining?: number; name?: string }
    window?: { duration?: number; timeUnit?: string }
  }>
}

export async function fetchKimi(): Promise<ProviderUsage> {
  const base: ProviderUsage = { id: "kimi", name: "Kimi Code", available: false }

  let creds: KimiCredentials
  try {
    creds = await readCredentials()
  } catch {
    return { ...base, error: "No credentials found" }
  }

  base.available = true

  let token = creds.access_token

  if (Date.now() / 1000 > creds.expires_at - 60) {
    try {
      token = await refreshToken(creds)
    } catch (e) {
      return { ...base, error: `Token refresh failed: ${e}` }
    }
  }

  try {
    const resp = await fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (resp.status === 403) {
      return { ...base, error: "Usage requires paid plan" }
    }

    if (!resp.ok) {
      return { ...base, error: `API ${resp.status}` }
    }

    const data = (await resp.json()) as KimiUsageResponse
    const result: ProviderUsage = { ...base }

    if (data.usage) {
      const u = data.usage
      const limit = u.limit ?? 0
      const used = u.used ?? (limit - (u.remaining ?? 0))
      result.primary = {
        percent_used: limit > 0 ? Math.round((used / limit) * 100) : 0,
        label: u.name ?? "Weekly",
      }
    }

    if (data.limits) {
      for (const item of data.limits) {
        const d = item.detail
        if (!d) continue

        const limit = d.limit ?? 0
        const used = d.used ?? (limit - (d.remaining ?? 0))
        const dur = item.window?.duration
        const unit = item.window?.timeUnit ?? ""

        let label = d.name ?? "Limit"
        if (dur) {
          if (unit.includes("MINUTE") && dur >= 60) label = `${dur / 60}h limit`
          else if (unit.includes("HOUR")) label = `${dur}h limit`
          else if (unit.includes("DAY")) label = `${dur}d limit`
        }

        const window = {
          percent_used: limit > 0 ? Math.round((used / limit) * 100) : 0,
          label,
        }

        if (!result.primary) result.primary = window
        else if (!result.secondary) result.secondary = window
      }
    }

    return result
  } catch (e) {
    return { ...base, error: `Fetch failed: ${e}` }
  }
}
