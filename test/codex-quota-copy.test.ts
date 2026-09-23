import assert from "node:assert/strict"
import { it } from "node:test"
import { formatCodexQuotaWindowLines, formatQuotaResetCredits, getCodexQuotaLabels } from "../src/codex-quota-copy.js"
import { getLatestUserMessageProvider, selectCodexProvider } from "../src/codex-provider.js"

it("localizes Codex quota labels for supported languages and falls back to English", () => {
  assert.equal(getCodexQuotaLabels("de_DE.UTF-8").heading, "Codex-Nutzung")
  assert.equal(getCodexQuotaLabels("es-MX").session, "Sesión")
  assert.equal(getCodexQuotaLabels("fr_FR").creditBalance, "Solde de crédits")
  assert.equal(getCodexQuotaLabels("it_IT").weekly, "Settimanale")
  assert.equal(getCodexQuotaLabels("pt_BR").available, "disponíveis")
  assert.equal(getCodexQuotaLabels("ja-JP").heading, "Codex usage")
})

it("formats quota usage and reset as separate display lines", () => {
  const labels = getCodexQuotaLabels("en")
  assert.deepEqual(formatCodexQuotaWindowLines({ usedPercent: 42, limitWindowSeconds: 18000, resetAt: 1900000000 }, labels), [
    "42% used",
    `resets ${new Date(1900000000 * 1000).toLocaleString()}`,
  ])
  assert.deepEqual(formatCodexQuotaWindowLines(undefined, labels), ["unavailable"])
})

it("labels credit balance separately from quota reset credits and formats applicable before available", () => {
  const spanish = getCodexQuotaLabels("es")
  assert.equal(spanish.creditBalance, "Saldo de créditos")
  assert.equal(spanish.quotaResetCredits, "Créditos de reinicio de cuota")
  assert.equal(formatQuotaResetCredits(0, 3, spanish), "0 aplicables / 3 disponibles")

  const english = getCodexQuotaLabels("en")
  assert.equal(english.creditBalance, "Credit balance")
  assert.equal(english.quotaResetCredits, "Quota reset credits")
  assert.equal(formatQuotaResetCredits(2, 5, english), "2 applicable / 5 available")

  const portuguese = getCodexQuotaLabels("pt-BR")
  assert.equal(portuguese.creditBalance, "Saldo de créditos")
  assert.equal(portuguese.quotaResetCredits, "Créditos de reinicialização da cota")
  assert.equal(formatQuotaResetCredits(0, 3, portuguese), "0 aplicáveis / 3 disponíveis")
})

it("selects stored session provider before latest user message and hides unknown providers", () => {
  assert.equal(selectCodexProvider("openai", "anthropic"), true)
  assert.equal(selectCodexProvider("anthropic", "openai"), false)
  assert.equal(selectCodexProvider(undefined, "openai"), true)
  assert.equal(selectCodexProvider(undefined, "anthropic"), false)
  assert.equal(selectCodexProvider(undefined, undefined), false)
})

it("prioritizes the active next-model provider over stored and message providers", () => {
  assert.equal(selectCodexProvider("openai", "openai", "opencode"), false)
  assert.equal(selectCodexProvider("opencode", "opencode", "openai"), true)
})

it("reads provider directly from the latest user-message model", () => {
  assert.equal(getLatestUserMessageProvider([
    { role: "user", model: { providerID: "anthropic" } },
    { role: "assistant", model: { providerID: "openai" } },
    { role: "user", model: { providerID: "openai" } },
  ]), "openai")
  assert.equal(getLatestUserMessageProvider([
    { role: "user", model: { providerID: "openai" } },
    { role: "user" },
  ]), undefined)
})
