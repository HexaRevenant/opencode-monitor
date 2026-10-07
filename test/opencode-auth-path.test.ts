import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { defaultOpenCodeAuthPath } from "../src/opencode-auth-path.js"

describe("defaultOpenCodeAuthPath", () => {
  it("uses the XDG fallback with native Windows separators", () => {
    assert.equal(
      defaultOpenCodeAuthPath({}, "C:\\Users\\test", "win32"),
      "C:\\Users\\test\\.local\\share\\opencode\\auth.json",
    )
  })

  it("uses XDG_DATA_HOME on Windows", () => {
    assert.equal(
      defaultOpenCodeAuthPath({ XDG_DATA_HOME: "D:\\Data" }, "C:\\Users\\test", "win32"),
      "D:\\Data\\opencode\\auth.json",
    )
  })

  it("uses POSIX XDG fallback and override", () => {
    assert.equal(defaultOpenCodeAuthPath({}, "/home/test", "linux"), "/home/test/.local/share/opencode/auth.json")
    assert.equal(defaultOpenCodeAuthPath({ XDG_DATA_HOME: "/data" }, "/home/test", "linux"), "/data/opencode/auth.json")
  })

  it("falls back when XDG_DATA_HOME is empty", () => {
    assert.equal(defaultOpenCodeAuthPath({ XDG_DATA_HOME: "" }, "/home/test", "darwin"), "/home/test/.local/share/opencode/auth.json")
  })
})
