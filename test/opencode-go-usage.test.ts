import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  fetchOpenCodeGoUsage,
  OPENCODE_GO_USAGE_URL,
  parseOpenCodeGoUsage,
  readOpenCodeGoAuth,
} from "../src/opencode-go-usage.js"
import { defaultOpenCodeAuthPath } from "../src/opencode-auth-path.js"

describe("OpenCode Go usage", () => {
  it("reads only the OpenCode Go API key using the injected auth file reader", async () => {
    const credential = await readOpenCodeGoAuth({
      filePath: "/mock/auth.json",
      readFile: async (path) => {
        assert.equal(path, "/mock/auth.json")
        return JSON.stringify({
          "opencode-go": { type: "api", key: "secret" },
          openai: { type: "oauth", access: "must-not-be-used" },
        })
      },
    })
    assert.deepEqual(credential, { apiKey: "secret" })
    assert.equal(await readOpenCodeGoAuth({
      filePath: "/mock/auth.json",
      readFile: async () => JSON.stringify({ "opencode-go": { type: "oauth", access: "wrong-auth-kind" } }),
    }), undefined)
  })

  it("uses the existing platform OpenCode auth-store path", () => {
    assert.equal(defaultOpenCodeAuthPath({}, "/home/test", "linux"), "/home/test/.local/share/opencode/auth.json")
    assert.equal(defaultOpenCodeAuthPath({ XDG_DATA_HOME: "/data" }, "/home/test", "linux"), "/data/opencode/auth.json")
    assert.equal(defaultOpenCodeAuthPath({}, "C:\\Users\\test", "win32"), "C:\\Users\\test\\.local\\share\\opencode\\auth.json")
  })

  it("maps consumption to clamped remaining percentages and preserves status/reset timestamps", () => {
    const usage = parseOpenCodeGoUsage({
      usage: {
        rolling: { status: "ok", percent: 25, resetsAt: "2026-09-23T12:00:00Z" },
        weekly: { status: "rate-limited", percent: 100, resetsAt: "2026-09-28T00:00:00Z" },
        monthly: { status: "ok", percent: 140, resetsAt: "malformed" },
      },
    })
    assert.deepEqual(usage.rolling, {
      status: "ok", remainingPercent: 75, resetsAt: "2026-09-23T12:00:00Z",
    })
    assert.deepEqual(usage.weekly, {
      status: "rate-limited", remainingPercent: 0, resetsAt: "2026-09-28T00:00:00Z",
    })
    assert.deepEqual(usage.monthly, { status: "ok", remainingPercent: 0 })
  })

  it("leaves missing or malformed usage fields unavailable", () => {
    const usage = parseOpenCodeGoUsage({
      usage: {
        rolling: { status: 4, percent: "25", resetsAt: "not-a-date" },
        weekly: null,
        monthly: { status: "", percent: Number.NaN, resetsAt: "2026-02-31T12:00:00Z" },
      },
    })
    assert.deepEqual(usage.rolling, {})
    assert.equal(usage.weekly, undefined)
    assert.deepEqual(usage.monthly, {})
    assert.deepEqual(parseOpenCodeGoUsage({}), {})
  })

  it("fetches usage with the API key and never exposes the key or response body in errors", async () => {
    let request: Request | undefined
    let requestSignal: AbortSignal | null | undefined
    const usage = await fetchOpenCodeGoUsage({ apiKey: "secret" }, async (input, init) => {
      request = new Request(input, init)
      requestSignal = init?.signal as AbortSignal | null | undefined
      return Response.json({ usage: { rolling: { status: "ok", percent: 40 } } })
    })
    assert.equal(new URL(request!.url).href, OPENCODE_GO_USAGE_URL)
    assert.equal(request!.headers.get("authorization"), "Bearer secret")
    assert.ok(requestSignal instanceof AbortSignal)
    assert.equal(usage.rolling?.remainingPercent, 60)

    await assert.rejects(
      fetchOpenCodeGoUsage({ apiKey: "secret" }, async () => new Response("secret response", { status: 401 })),
      (error: Error) => error.message === "OpenCode Go usage unavailable" && !error.message.includes("secret"),
    )
  })
})
