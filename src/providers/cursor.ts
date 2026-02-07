import { Database } from "bun:sqlite"
import { homedir } from "os"
import { join } from "path"
import { existsSync } from "fs"
import type { ProviderUsage } from "../types"

const DB_PATH = join(homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb")
const USAGE_URL = "https://api2.cursor.sh/auth/usage"
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

export async function fetchCursor(): Promise<ProviderUsage> {
  const base: ProviderUsage = { id: "cursor", name: "Cursor", available: false }

  const token = readDbValue("cursorAuth/accessToken")
  if (!token) {
    return { ...base, error: "No Cursor auth token found" }
  }

  base.available = true

  const email = readDbValue("cursorAuth/cachedEmail") ?? undefined
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-cursor-client-version": "2.3.35",
  }

  let plan: string | undefined
  try {
    const profileResp = await fetch(PROFILE_URL, { headers })
    if (profileResp.ok) {
      const profile = (await profileResp.json()) as { membershipType?: string }
      plan = profile.membershipType
    }
  } catch {}

  plan ??= readDbValue("cursorAuth/stripeMembershipType") ?? undefined

  try {
    const resp = await fetch(USAGE_URL, { headers })

    if (!resp.ok) {
      return { ...base, error: `API ${resp.status}`, account: { email, plan } }
    }

    const usage = (await resp.json()) as Record<string, unknown>
    const gpt4 = usage["gpt-4"] as { numRequests?: number; maxRequestUsage?: number | null } | undefined
    const maxRequests = gpt4?.maxRequestUsage

    const result: ProviderUsage = {
      ...base,
      account: { email, plan },
    }

    if (maxRequests && maxRequests > 0 && gpt4?.numRequests != null) {
      const startOfMonth = usage.startOfMonth as string | undefined
      let resetsAt: string | undefined
      if (startOfMonth) {
        const end = new Date(startOfMonth)
        end.setMonth(end.getMonth() + 1)
        resetsAt = end.toISOString()
      }

      result.primary = {
        percent_used: Math.round((gpt4.numRequests / maxRequests) * 100),
        resets_at: resetsAt,
        label: "Premium Requests",
      }
    }

    return result
  } catch (e) {
    return { ...base, error: `Fetch failed: ${e}`, account: { email, plan } }
  }
}
