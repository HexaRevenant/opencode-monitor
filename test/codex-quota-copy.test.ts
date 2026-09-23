import assert from "node:assert/strict"
import { it } from "node:test"
import { getCodexQuotaLabels } from "../src/codex-quota-copy.js"

it("localizes Codex quota labels for supported languages and falls back to English", () => {
  assert.equal(getCodexQuotaLabels("de_DE.UTF-8").heading, "Codex-Nutzung")
  assert.equal(getCodexQuotaLabels("es-MX").session, "Sesión")
  assert.equal(getCodexQuotaLabels("fr_FR").credits, "Crédits")
  assert.equal(getCodexQuotaLabels("it_IT").weekly, "Settimanale")
  assert.equal(getCodexQuotaLabels("pt_BR").available, "disponíveis")
  assert.equal(getCodexQuotaLabels("ja-JP").heading, "Codex usage")
})
