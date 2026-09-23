import { readFile as nodeReadFile } from "node:fs/promises"
import { homedir } from "node:os"
import { posix, win32 } from "node:path"

export const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
export const OPENCODE_GO_USAGE_REFRESH_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 10_000

export type OpenCodeGoCredential = { apiKey: string }
export type OpenCodeGoWindow = {
  status?: string
  remainingPercent?: number
  resetsAt?: string
}
export type OpenCodeGoUsage = {
  rolling?: OpenCodeGoWindow
  weekly?: OpenCodeGoWindow
  monthly?: OpenCodeGoWindow
}

type Platform = "linux" | "darwin" | "win32"

export function defaultOpenCodeAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform: Platform = process.platform as Platform,
): string {
  if (platform === "win32") {
    return win32.join(env.APPDATA ?? win32.join(home, "AppData", "Roaming"), "opencode", "auth.json")
  }
  if (platform === "darwin") return posix.join(home, "Library", "Application Support", "opencode", "auth.json")
  return posix.join(env.XDG_DATA_HOME ?? posix.join(home, ".local", "share"), "opencode", "auth.json")
}

export async function readOpenCodeGoAuth(options: {
  filePath?: string
  readFile?: (path: string) => Promise<string>
} = {}): Promise<OpenCodeGoCredential | undefined> {
  try {
    const contents = await (options.readFile ?? ((path) => nodeReadFile(path, "utf8")))(
      options.filePath ?? defaultOpenCodeAuthPath(),
    )
    const auth: unknown = JSON.parse(contents)
    if (typeof auth !== "object" || auth === null || Array.isArray(auth)) return undefined
    const entry = (auth as Record<string, unknown>)["opencode-go"]
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined
    const credentials = entry as Record<string, unknown>
    if (credentials.type !== "api" || typeof credentials.key !== "string" || credentials.key.length === 0) return undefined
    return { apiKey: credentials.key }
  } catch {
    return undefined
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function validIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
  if (!match) return undefined
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond] = match
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)
  const hour = Number(rawHour)
  const minute = Number(rawMinute)
  const second = Number(rawSecond)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || hour > 23 || minute > 59 || second > 59) return undefined
  return Number.isFinite(Date.parse(value)) ? value : undefined
}

function parseWindow(value: unknown): OpenCodeGoWindow | undefined {
  const source = record(value)
  if (!source) return undefined
  const result: OpenCodeGoWindow = {}
  if (typeof source.status === "string" && source.status.trim().length > 0) result.status = source.status
  if (typeof source.percent === "number" && Number.isFinite(source.percent)) {
    result.remainingPercent = Math.min(100, Math.max(0, 100 - source.percent))
  }
  const resetsAt = validIsoTimestamp(source.resetsAt)
  if (resetsAt !== undefined) result.resetsAt = resetsAt
  return result
}

export function parseOpenCodeGoUsage(value: unknown): OpenCodeGoUsage {
  const usage = record(record(value)?.usage)
  if (!usage) return {}
  return {
    ...(record(usage.rolling) ? { rolling: parseWindow(usage.rolling)! } : {}),
    ...(record(usage.weekly) ? { weekly: parseWindow(usage.weekly)! } : {}),
    ...(record(usage.monthly) ? { monthly: parseWindow(usage.monthly)! } : {}),
  }
}

export async function fetchOpenCodeGoUsage(
  credential: OpenCodeGoCredential,
  fetcher: typeof fetch = fetch,
): Promise<OpenCodeGoUsage> {
  try {
    const response = await fetcher(OPENCODE_GO_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error("request failed")
    return parseOpenCodeGoUsage(await response.json())
  } catch {
    throw new Error("OpenCode Go usage unavailable")
  }
}
