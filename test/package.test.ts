import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "node:test"
import { shouldInstallPlugin, verifyPluginInstallation } from "../scripts/plugin-installation.js"

it("publishes the root and ./tui exports to the same TUI bundle", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
  assert.equal(manifest.exports["."].import, manifest.exports["./tui"].import)
  assert.equal(manifest.exports["."].types, manifest.exports["./tui"].types)
})

async function createCachedPlugin(cacheDirectory: string, entry: string, version: string, hasBundle = true): Promise<void> {
  const packageDirectory = join(cacheDirectory, entry, "node_modules", "opencode-system-metrics-tui")
  await mkdir(join(packageDirectory, "dist"), { recursive: true })
  await writeFile(join(packageDirectory, "package.json"), JSON.stringify({ name: "opencode-system-metrics-tui", version }))
  if (hasBundle) await writeFile(join(packageDirectory, "dist", "tui.js"), "export {}")
}

it("verifies the installed manifest version and required bundle", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "opencode-monitor-cache-"))
  await createCachedPlugin(cacheDirectory, "opencode-system-metrics-tui@0.1.6", "0.1.6")

  const result = await verifyPluginInstallation({
    cacheDirectory,
    packageName: "opencode-system-metrics-tui",
    expectedVersion: "0.1.6",
  })

  assert.equal(result.ok, true)
  assert.equal(result.actualVersion, "0.1.6")
  assert.equal(shouldInstallPlugin(result), false)
})

it("reports stale cache entries without requiring reinstall when expected artifact is valid", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "opencode-monitor-cache-"))
  await createCachedPlugin(cacheDirectory, "opencode-system-metrics-tui@latest", "0.1.0")
  await createCachedPlugin(cacheDirectory, "opencode-system-metrics-tui@0.1.6", "0.1.6")

  const result = await verifyPluginInstallation({
    cacheDirectory,
    packageName: "opencode-system-metrics-tui",
    expectedVersion: "0.1.6",
  })

  assert.equal(result.ok, true)
  assert.equal(result.staleEntries.length, 1)
  assert.match(result.warnings.join("\n"), /Stale OpenCode cache entries/)
  assert.equal(shouldInstallPlugin(result), false)
})

it("requires reinstall when the expected bundle is missing", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "opencode-monitor-cache-"))
  await createCachedPlugin(cacheDirectory, "opencode-system-metrics-tui@0.1.6", "0.1.6", false)

  const result = await verifyPluginInstallation({
    cacheDirectory,
    packageName: "opencode-system-metrics-tui",
    expectedVersion: "0.1.6",
  })

  assert.equal(result.ok, false)
  assert.equal(shouldInstallPlugin(result), true)
  assert.match(result.errors.join("\n"), /dist\/tui\.js/)
})
