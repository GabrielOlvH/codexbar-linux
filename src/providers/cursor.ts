import { Database } from "bun:sqlite"
import { homedir } from "os"
import { join } from "path"
import { existsSync } from "fs"
import type { ProviderUsage } from "../types"

const DB_PATH = join(homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb")
const USAGE_URL = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage"
const PROFILE_URL = "https://api2.cursor.sh/auth/full_stripe_profile"

function readDbValue(key: string): string | null {
  if (!existsSync(DB_PATH)) return null

  const db = new Database(DB_PATH, { readonly: true })
  try {
    const row = db.query("SELECT value FROM ItemTable WHERE key = ?").get(key) as { value: string } | null
    return row?.value ?? null
  } finally {
    db.close()
  }
}

interface PlanUsage {
  totalSpend?: number
  includedSpend?: number
  remaining?: number
  limit?: number
}

interface SpendLimitUsage {
  individualLimit?: number
  individualRemaining?: number
}

interface UsageResponse {
  billingCycleEnd?: string
  planUsage?: PlanUsage
  spendLimitUsage?: SpendLimitUsage
  enabled?: boolean
}

export async function fetchCursor(): Promise<ProviderUsage> {
  const base: ProviderUsage = { id: "cursor", name: "Cursor", available: false }

  const token = readDbValue("cursorAuth/accessToken")
  if (!token) {
    return { ...base, error: "No Cursor auth token found" }
  }

  base.available = true

  const email = readDbValue("cursorAuth/cachedEmail") ?? undefined

  let plan: string | undefined
  try {
    const profileResp = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (profileResp.ok) {
      const profile = (await profileResp.json()) as { membershipType?: string }
      plan = profile.membershipType
    }
  } catch {}

  plan ??= readDbValue("cursorAuth/stripeMembershipType") ?? undefined

  try {
    const resp = await fetch(USAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      body: JSON.stringify({}),
    })

    if (!resp.ok) {
      return { ...base, error: `API ${resp.status}`, account: { email, plan } }
    }

    const usage = (await resp.json()) as UsageResponse
    const spendLimit = usage.spendLimitUsage?.individualLimit
      ? `$${(usage.spendLimitUsage.individualLimit / 100).toFixed(0)} limit`
      : undefined
    const planLabel = [plan, spendLimit].filter(Boolean).join(" · ")

    const result: ProviderUsage = {
      ...base,
      account: { email, plan: planLabel || plan },
    }

    let resetsAt: string | undefined
    if (usage.billingCycleEnd) {
      resetsAt = new Date(Number(usage.billingCycleEnd)).toISOString()
    }

    if (usage.planUsage && usage.planUsage.limit && usage.planUsage.limit > 0) {
      const limitDollars = usage.planUsage.limit / 100
      const usedDollars = (usage.planUsage.totalSpend ?? 0) / 100
      const pct = Math.round((usedDollars / limitDollars) * 100)

      result.primary = {
        percent_used: pct,
        resets_at: resetsAt,
        label: `Plan ($${usedDollars.toFixed(2)} / $${limitDollars.toFixed(2)})`,
      }
    }

    if (usage.spendLimitUsage && usage.spendLimitUsage.individualLimit && usage.spendLimitUsage.individualLimit > 0) {
      const limitDollars = usage.spendLimitUsage.individualLimit / 100
      const usedDollars = limitDollars - (usage.spendLimitUsage.individualRemaining ?? 0) / 100
      const pct = Math.round((usedDollars / limitDollars) * 100)

      result.secondary = {
        percent_used: pct,
        resets_at: resetsAt,
        label: `Limit ($${usedDollars.toFixed(2)} / $${limitDollars.toFixed(2)})`,
      }
    }

    return result
  } catch (e) {
    return { ...base, error: `Fetch failed: ${e}`, account: { email, plan } }
  }
}
