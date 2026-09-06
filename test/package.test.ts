import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { it } from "node:test"

it("publishes the root and ./tui exports to the same TUI bundle", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
  assert.equal(manifest.exports["."].import, manifest.exports["./tui"].import)
  assert.equal(manifest.exports["."].types, manifest.exports["./tui"].types)
})
