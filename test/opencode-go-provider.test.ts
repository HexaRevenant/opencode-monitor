import assert from "node:assert/strict"
import { it } from "node:test"
import { getLatestUserMessageProvider, selectOpenCodeGoProvider } from "../src/opencode-go-provider.js"

it("gates usage to OpenCode Go and prefers the active next-model provider", () => {
  assert.equal(selectOpenCodeGoProvider("opencode-go", "openai"), true)
  assert.equal(selectOpenCodeGoProvider("openai", "opencode-go"), false)
  assert.equal(selectOpenCodeGoProvider(undefined, "opencode-go"), true)
  assert.equal(selectOpenCodeGoProvider(undefined, undefined), false)
  assert.equal(selectOpenCodeGoProvider("opencode-go", "opencode-go", "anthropic"), false)
  assert.equal(selectOpenCodeGoProvider("anthropic", "anthropic", "opencode-go"), true)
})

it("gets the provider from the latest user message model", () => {
  assert.equal(getLatestUserMessageProvider([
    { role: "user", model: { providerID: "opencode-go" } },
    { role: "assistant", model: { providerID: "openai" } },
    { role: "user", model: { providerID: "openai" } },
  ]), "openai")
})
