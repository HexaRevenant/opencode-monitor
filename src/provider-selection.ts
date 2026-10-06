type UserMessageModel = { role?: string; model?: { providerID?: string } }

export type UsagePanel = "codex" | "opencode-go"

export function getLatestUserMessageProvider(messages: readonly UserMessageModel[]): string | undefined {
  return [...messages].reverse().find((message) => message.role === "user")?.model?.providerID
}

export function resolveActiveProvider(
  sessionProvider: string | undefined,
  latestUserMessageProvider: string | undefined,
  selectedNextModelProvider?: string,
): string | undefined {
  return selectedNextModelProvider ?? sessionProvider ?? latestUserMessageProvider
}

export function usagePanelForProvider(provider: string | undefined): UsagePanel | undefined {
  if (provider === "openai") return "codex"
  if (provider === "opencode-go") return "opencode-go"
  return undefined
}
