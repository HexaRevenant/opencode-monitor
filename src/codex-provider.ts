type UserMessageModel = { role?: string; model?: { providerID?: string } }

export function getLatestUserMessageProvider(messages: readonly UserMessageModel[]): string | undefined {
  return [...messages].reverse().find((message) => message.role === "user")?.model?.providerID
}

export function selectCodexProvider(
  sessionProvider: string | undefined,
  latestUserMessageProvider: string | undefined,
  selectedNextModelProvider?: string,
): boolean {
  const provider = selectedNextModelProvider || sessionProvider || latestUserMessageProvider
  return provider === "openai"
}
