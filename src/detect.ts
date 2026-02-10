import { readFile } from "fs/promises"
import type { NiriWindow } from "./types"

const TERMINAL_APP_IDS = [
  "com.mitchellh.ghostty",
  "kitty",
  "alacritty",
  "foot",
  "org.wezfurlong.wezterm",
  "org.gnome.terminal",
  "com.raggesilver.blackbox",
]

const PROCESS_TO_PROVIDER: Record<string, string> = {
  claude: "claude",
  codex: "codex",
  kimi: "kimi",
}

function isTerminal(appId: string): boolean {
  return TERMINAL_APP_IDS.some((id) => appId.toLowerCase().includes(id.toLowerCase()))
}

async function getChildPids(pid: number): Promise<number[]> {
  const childPids: Set<number> = new Set()
  try {
    const { readdir } = await import("fs/promises")
    const threads = await readdir(`/proc/${pid}/task`).catch(() => [])
    for (const tid of threads) {
      const raw = await readFile(`/proc/${pid}/task/${tid}/children`, "utf-8").catch(() => "")
      for (const p of raw.trim().split(/\s+/).filter(Boolean)) {
        childPids.add(Number(p))
      }
    }
  } catch {}
  return [...childPids]
}

async function getTmuxPaneProcessNames(clientPid: number): Promise<string[]> {
  try {
    const clientsProc = Bun.spawn(["tmux", "list-clients", "-F", "#{client_pid} #{session_name}"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const clientsOutput = await new Response(clientsProc.stdout).text()
    if ((await clientsProc.exited) !== 0) return []

    let sessionName: string | null = null
    for (const line of clientsOutput.trim().split("\n")) {
      const spaceIdx = line.indexOf(" ")
      if (spaceIdx === -1) continue
      if (Number(line.slice(0, spaceIdx)) === clientPid) {
        sessionName = line.slice(spaceIdx + 1)
        break
      }
    }
    if (!sessionName) return []

    const panesProc = Bun.spawn(["tmux", "list-panes", "-s", "-t", sessionName, "-F", "#{pane_pid}"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const panesOutput = await new Response(panesProc.stdout).text()
    if ((await panesProc.exited) !== 0) return []

    const names: string[] = []
    for (const line of panesOutput.trim().split("\n").filter(Boolean)) {
      const panePid = Number(line)
      if (isNaN(panePid)) continue
      const comm = (await readFile(`/proc/${panePid}/comm`, "utf-8").catch(() => "")).trim()
      if (comm) names.push(comm)
      names.push(...(await getChildProcessNames(panePid)))
    }
    return names
  } catch {
    return []
  }
}

async function getChildProcessNames(pid: number, depth = 4): Promise<string[]> {
  if (depth <= 0) return []

  const names: string[] = []
  const childPids = await getChildPids(pid)

  for (const childPid of childPids) {
    try {
      const comm = (await readFile(`/proc/${childPid}/comm`, "utf-8")).trim()
      names.push(comm)

      if (comm === "tmux") {
        names.push(...(await getTmuxPaneProcessNames(childPid)))
      }

      const grandchildren = await getChildProcessNames(childPid, depth - 1)
      names.push(...grandchildren)
    } catch {}
  }

  return names
}

export function detectActiveProvider(window: NiriWindow, childProcessNames?: string[]): string | null {
  const appId = window.app_id?.toLowerCase() ?? ""

  if (appId.includes("cursor")) return "cursor"
  if (appId === "code" || appId === "code-oss" || appId.includes("vscode")) return "copilot"

  if (isTerminal(appId) && childProcessNames) {
    for (const name of childProcessNames) {
      const provider = PROCESS_TO_PROVIDER[name.toLowerCase()]
      if (provider) return provider
    }
  }

  return null
}

export async function getFocusedWindow(): Promise<{ window: NiriWindow; childProcessNames: string[] } | null> {
  try {
    const proc = Bun.spawn(["niri", "msg", "--json", "focused-window"], {
      stdout: "pipe",
      stderr: "pipe",
    })

    const output = await new Response(proc.stdout).text()
    const code = await proc.exited

    if (code !== 0 || !output.trim() || output.trim() === "null") return null

    const window = JSON.parse(output) as NiriWindow & { pid?: number }
    const childProcessNames = window.pid ? await getChildProcessNames(window.pid) : []

    return { window, childProcessNames }
  } catch {
    return null
  }
}
