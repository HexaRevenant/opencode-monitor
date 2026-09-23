import { readFile as nodeReadFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
export const CODEX_QUOTA_REFRESH_MS = 5 * 60_000

export type CodexCredential = { accessToken: string; accountId?: string }
export type QuotaWindow = { usedPercent: number; limitWindowSeconds: number; resetAt?: number }
export type CodexQuota = {
  primary?: QuotaWindow
  secondary?: QuotaWindow
  credits?: { balance?: number; unlimited?: boolean; available?: number; applicable?: number }
  additional: Array<{ name: string; feature: string; usedPercent?: number; resetAt?: number; resetAfterSeconds?: number }>
}

type AuthEntry = { type?: unknown; access?: unknown; accountId?: unknown }
type AuthFile = Record<string, AuthEntry>

export function defaultOpenCodeAuthPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (process.platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "opencode", "auth.json")
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "opencode", "auth.json")
  return join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), "opencode", "auth.json")
}

export async function readCodexAuth(options: {
  filePath?: string
  readFile?: (path: string) => Promise<string>
} = {}): Promise<CodexCredential | undefined> {
  try {
    const contents = await (options.readFile ?? ((path) => nodeReadFile(path, "utf8")))(options.filePath ?? defaultOpenCodeAuthPath())
    const auth = JSON.parse(contents) as AuthFile
    const entry = auth.openai
    if (entry?.type !== "oauth" || typeof entry.access !== "string" || entry.access.length === 0) return undefined
    return { accessToken: entry.access, ...(typeof entry.accountId === "string" ? { accountId: entry.accountId } : {}) }
  } catch {
    return undefined
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function number(value: unknown): number | undefined {
  const result = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  return Number.isFinite(result) ? result : undefined
}

function windowFrom(value: unknown): QuotaWindow | undefined {
  const item = record(value)
  const usedPercent = number(item?.used_percent)
  const limitWindowSeconds = number(item?.limit_window_seconds)
  if (usedPercent === undefined || limitWindowSeconds === undefined) return undefined
  const resetAt = number(item?.reset_at)
  return { usedPercent, limitWindowSeconds, ...(resetAt === undefined ? {} : { resetAt }) }
}

export function parseCodexQuota(value: unknown): CodexQuota {
  const root = record(value) ?? {}
  const rate = record(root.rate_limit) ?? {}
  const credits = record(root.credits)
  const resetCredits = record(root.rate_limit_reset_credits)
  const additional = Array.isArray(root.additional_rate_limits) ? root.additional_rate_limits.flatMap((raw) => {
    const item = record(raw)
    if (typeof item?.limit_name !== "string" || typeof item.metered_feature !== "string") return []
    const window = record(item.rate_limit)
    const usedPercent = number(window?.used_percent)
    const resetAt = number(window?.reset_at)
    const resetAfterSeconds = number(window?.reset_after_seconds)
    return [{ name: item.limit_name, feature: item.metered_feature, ...(usedPercent === undefined ? {} : { usedPercent }), ...(resetAt === undefined ? {} : { resetAt }), ...(resetAfterSeconds === undefined ? {} : { resetAfterSeconds }) }]
  }) : []
  const balance = number(credits?.balance)
  const available = number(resetCredits?.available_count)
  const applicable = number(resetCredits?.applicable_available_count)
  return {
    primary: windowFrom(rate.primary_window),
    secondary: windowFrom(rate.secondary_window),
    ...(credits || resetCredits ? { credits: {
      ...(balance === undefined ? {} : { balance }),
      ...(typeof credits?.unlimited === "boolean" ? { unlimited: credits.unlimited } : {}),
      ...(available === undefined ? {} : { available }),
      ...(applicable === undefined ? {} : { applicable }),
    } } : {}),
    additional,
  }
}

export async function fetchCodexQuota(
  credential: CodexCredential,
  fetcher: typeof fetch = fetch,
): Promise<CodexQuota> {
  try {
    const response = await fetcher(CODEX_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "codex-cli",
        ...(credential.accountId ? { "ChatGPT-Account-Id": credential.accountId } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error("Codex quota unavailable")
    return parseCodexQuota(await response.json())
  } catch {
    throw new Error("Codex quota unavailable")
  }
}
