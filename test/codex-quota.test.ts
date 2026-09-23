import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseCodexQuota, readCodexAuth, CODEX_USAGE_URL } from "../src/codex-quota.js"

describe("Codex quota", () => {
  it("reads only OpenCode's active OpenAI OAuth credential using an injected file reader", async () => {
    const credential = await readCodexAuth({
      filePath: "/mock/auth.json",
      readFile: async (path) => {
        assert.equal(path, "/mock/auth.json")
        return JSON.stringify({ openai: { type: "oauth", access: "secret", accountId: "account" }, other: { access: "ignored" } })
      },
    })
    assert.deepEqual(credential, { accessToken: "secret", accountId: "account" })
  })

  it("parses quota windows, reset times, credits, and additional limits", () => {
    const quota = parseCodexQuota({
      rate_limit: {
        primary_window: { used_percent: 25, limit_window_seconds: 18000, reset_at: 1900000000 },
        secondary_window: { used_percent: 60, limit_window_seconds: 604800 },
      },
      credits: { balance: 12, unlimited: false },
      rate_limit_reset_credits: { available_count: 3, applicable_available_count: 2 },
      additional_rate_limits: [{ limit_name: "reviews", metered_feature: "reviews", rate_limit: { used_percent: 10, reset_after_seconds: 3600 } }],
    })
    assert.equal(quota.primary?.usedPercent, 25)
    assert.equal(quota.primary?.resetAt, 1900000000)
    assert.equal(quota.secondary?.resetAt, undefined)
    assert.deepEqual(quota.credits, { balance: 12, unlimited: false, available: 3, applicable: 2 })
    assert.equal(quota.additional[0].resetAfterSeconds, 3600)
  })

  it("fetches usage with account-scoped headers without exposing errors or response bodies", async () => {
    let request: Request | undefined
    const quota = await (await import("../src/codex-quota.js")).fetchCodexQuota(
      { accessToken: "secret", accountId: "account" },
      async (input, init) => {
        request = new Request(input, init)
        return Response.json({ rate_limit: { primary_window: { used_percent: 4, limit_window_seconds: 18000 } } })
      },
    )
    assert.equal(new URL(request!.url).href, CODEX_USAGE_URL)
    assert.equal(request!.headers.get("authorization"), "Bearer secret")
    assert.equal(request!.headers.get("chatgpt-account-id"), "account")
    assert.equal(quota.primary?.usedPercent, 4)
    await assert.rejects((await import("../src/codex-quota.js")).fetchCodexQuota({ accessToken: "secret" }, async () => new Response("sensitive", { status: 401 })), /unavailable/)
  })
})
