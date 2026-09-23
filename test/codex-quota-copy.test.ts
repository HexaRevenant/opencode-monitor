import assert from "node:assert/strict"
import { it } from "node:test"
import { formatCodexQuotaWindowLines, getCodexQuotaLabels } from "../src/codex-quota-copy.js"

it("localizes Codex quota labels for supported languages and falls back to English", () => {
  assert.equal(getCodexQuotaLabels("de_DE.UTF-8").heading, "Codex-Nutzung")
  assert.equal(getCodexQuotaLabels("es-MX").session, "Sesión")
  assert.equal(getCodexQuotaLabels("fr_FR").credits, "Crédits")
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
