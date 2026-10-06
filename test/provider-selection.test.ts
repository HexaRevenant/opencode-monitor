import assert from "node:assert/strict"
import { it } from "node:test"
import { getLatestUserMessageProvider, resolveActiveProvider, usagePanelForProvider } from "../src/provider-selection.js"

it("resolves the selected next-model provider before session and latest-message providers", () => {
  assert.equal(resolveActiveProvider("openai", "opencode-go"), "openai")
  assert.equal(resolveActiveProvider("opencode-go", "openai"), "opencode-go")
  assert.equal(resolveActiveProvider("openai", "opencode-go", "opencode-go"), "opencode-go")
  assert.equal(resolveActiveProvider("opencode-go", "openai", "openai"), "openai")
  assert.equal(resolveActiveProvider("openai", "opencode-go", "anthropic"), "anthropic")
})

it("selects exactly one quota panel for the active provider", () => {
  assert.equal(usagePanelForProvider("openai"), "codex")
  assert.equal(usagePanelForProvider("opencode-go"), "opencode-go")
  assert.equal(usagePanelForProvider("anthropic"), undefined)
  assert.equal(usagePanelForProvider(undefined), undefined)
})

it("gets the provider from the latest user message model", () => {
  assert.equal(getLatestUserMessageProvider([
    { role: "user", model: { providerID: "openai" } },
    { role: "assistant", model: { providerID: "opencode-go" } },
    { role: "user", model: { providerID: "opencode-go" } },
  ]), "opencode-go")
})
