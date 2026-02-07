import type { ProviderUsage } from "../types"

const COPILOT_URL = "https://api.github.com/copilot_internal/user"

async function getGhToken(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" })
    const output = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code === 0 && output.trim()) return output.trim()
  } catch {}

  return null
}

interface QuotaSnapshot {
  entitlement: number
  percent_remaining: number
  quota_remaining: number
  unlimited: boolean
  quota_id: string
}

interface CopilotUser {
  copilot_plan?: string
  access_type_sku?: string
  quota_reset_date?: string
  quota_reset_date_utc?: string
  quota_snapshots?: Record<string, QuotaSnapshot>
}

export async function fetchCopilot(): Promise<ProviderUsage> {
  const base: ProviderUsage = { id: "copilot", name: "GitHub Copilot", available: false }

  const token = await getGhToken()
  if (!token) {
    return { ...base, error: "No GitHub token found" }
  }

  base.available = true

  try {
    const resp = await fetch(COPILOT_URL, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
        "User-Agent": "codexbar-linux/0.1.0",
      },
    })

    if (!resp.ok) {
      return { ...base, error: `API ${resp.status}` }
    }

    const user = (await resp.json()) as CopilotUser
    const plan = user.copilot_plan ?? user.access_type_sku ?? "unknown"
    const resetDate = user.quota_reset_date_utc ?? user.quota_reset_date

    const result: ProviderUsage = {
      ...base,
      account: { plan },
    }

    const snapshots = user.quota_snapshots
    if (!snapshots) return result

    const premium = snapshots.premium_interactions
    if (premium) {
      if (premium.unlimited) {
        result.primary = { percent_used: 0, label: "Premium (Unlimited)" }
      } else {
        const used = premium.entitlement - premium.quota_remaining
        const pct = premium.entitlement > 0 ? Math.round((used / premium.entitlement) * 100) : 0
        result.primary = {
          percent_used: Math.max(0, pct),
          resets_at: resetDate,
          label: `Premium (${premium.entitlement})`,
        }
      }
    }

    const chat = snapshots.chat
    if (chat && !chat.unlimited) {
      const used = chat.entitlement - chat.quota_remaining
      const pct = chat.entitlement > 0 ? Math.round((used / chat.entitlement) * 100) : 0
      result.secondary = {
        percent_used: Math.max(0, pct),
        resets_at: resetDate,
        label: "Chat",
      }
    }

    return result
  } catch (e) {
    return { ...base, error: `Fetch failed: ${e}` }
  }
}
