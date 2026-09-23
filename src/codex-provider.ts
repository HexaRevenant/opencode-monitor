type UserMessageModel = { role?: string; model?: { providerID?: string } }

export function getLatestUserMessageProvider(messages: readonly UserMessageModel[]): string | undefined {
  return [...messages].reverse().find((message) => message.role === "user")?.model?.providerID
}

export function selectCodexProvider(
  sessionProvider: string | undefined,
  latestUserMessageProvider: string | undefined,
): boolean {
  const provider = sessionProvider || latestUserMessageProvider
  return provider === "openai"
}
