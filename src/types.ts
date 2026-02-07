export interface ProviderUsage {
  id: string
  name: string
  available: boolean
  error?: string
  primary?: UsageWindow
  secondary?: UsageWindow
  cost?: CostInfo
  account?: AccountInfo
}

export interface UsageWindow {
  percent_used: number
  resets_at?: string
  label: string
}

export interface CostInfo {
  session_usd?: number
  period_usd?: number
  period_label?: string
}

export interface AccountInfo {
  email?: string
  plan?: string
}

export interface NiriWindow {
  app_id: string
  title: string
}

export interface CodexBarOutput {
  providers: ProviderUsage[]
  active_provider?: string
  timestamp: string
}
