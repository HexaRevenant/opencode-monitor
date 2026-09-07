import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "node:test"
import { shouldInstallPlugin, verifyPluginInstallation } from "../scripts/plugin-installation.js"
import { buildUninstallPlan, filterPluginConfig, findCacheCandidates, getConfigPaths } from "../scripts/uninstall-plugin.js"

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

it("filters only this package from string and tuple plugin entries", () => {
  const result = filterPluginConfig(JSON.stringify({ plugin: ["other", ["opencode-system-metrics-tui@0.1.11", { enabled: true }], "opencode-system-metrics-tui@latest"], other: "unchanged" }))
  assert.deepEqual(JSON.parse(result.content), { plugin: ["other"], other: "unchanged" })
  assert.deepEqual(result.removed, ["opencode-system-metrics-tui@0.1.11", "opencode-system-metrics-tui@latest"])
})

it("plans only verified package cache entries and supports purge", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "opencode-monitor-uninstall-cache-"))
  await createCachedPlugin(cacheDirectory, "opencode-system-metrics-tui@0.1.11", "0.1.11")
  await createCachedPlugin(cacheDirectory, "opencode-system-metrics-tui@0.1.10", "0.1.10")
  await mkdir(join(cacheDirectory, "opencode-system-metrics-tui@broken"), { recursive: true })
  const normal = await findCacheCandidates(cacheDirectory, "opencode-system-metrics-tui", new Set(["0.1.11"]))
  assert.deepEqual(normal.candidates.map((entry) => entry.version), ["0.1.11"])
  const purge = await findCacheCandidates(cacheDirectory, "opencode-system-metrics-tui", new Set(["0.1.11"]), true)
  assert.deepEqual(purge.candidates.map((entry) => entry.version), ["0.1.10", "0.1.11"])
  assert.equal(purge.warnings.length, 1)
})

it("builds a plan from temporary config and cache fixtures", async () => {
  const root = await mkdtemp(join(tmpdir(), "opencode-monitor-uninstall-"))
  const configPath = join(root, "tui.json")
  const cacheRoot = join(root, "packages")
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(configPath, JSON.stringify({ plugin: ["other", "opencode-system-metrics-tui@0.1.11"] }))
  await createCachedPlugin(cacheRoot, "opencode-system-metrics-tui@0.1.11", "0.1.11")
  const plan = await buildUninstallPlan({ scope: "global", configPaths: [configPath], cacheRoot })
  assert.equal(plan.configChanges.length, 1)
  assert.equal(plan.cacheCandidates.length, 1)
  assert.match(plan.configChanges[0].content, /"other"/)
  await access(plan.cacheCandidates[0].path)
})

it("discovers both global OpenCode config roots", async () => {
  const home = await mkdtemp(join(tmpdir(), "opencode-monitor-uninstall-home-"))
  const configPaths = getConfigPaths("global", join(home, "project"), home, {})
  const cacheRoot = join(home, "cache")
  await mkdir(join(home, ".config", "opencode"), { recursive: true })
  await mkdir(join(home, ".opencode"), { recursive: true })
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(configPaths[0], JSON.stringify({ plugin: ["opencode-system-metrics-tui@0.1.11"] }))
  await writeFile(configPaths[3], JSON.stringify({ plugin: ["other", "opencode-system-metrics-tui@0.1.11"] }))
  await createCachedPlugin(cacheRoot, "opencode-system-metrics-tui@0.1.11", "0.1.11")

  const plan = await buildUninstallPlan({ scope: "global", configPaths, cacheRoot })
  assert.deepEqual(plan.configChanges.map((change) => change.path), [configPaths[0], configPaths[3]])
  assert.equal(plan.cacheCandidates.length, 1)
  assert.match(plan.configChanges[1].content, /"other"/)
})

it("plans every verified cache entry when config uses an unversioned package", async () => {
  const root = await mkdtemp(join(tmpdir(), "opencode-monitor-uninstall-unversioned-"))
  const configPath = join(root, "tui.json")
  const cacheRoot = join(root, "packages")
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(configPath, JSON.stringify({ plugin: ["opencode-system-metrics-tui"] }))
  await createCachedPlugin(cacheRoot, "opencode-system-metrics-tui@0.1.10", "0.1.10")
  await createCachedPlugin(cacheRoot, "opencode-system-metrics-tui@0.1.11", "0.1.11")
  await mkdir(join(cacheRoot, "opencode-system-metrics-tui@broken"), { recursive: true })

  const plan = await buildUninstallPlan({ scope: "global", configPaths: [configPath], cacheRoot })
  assert.deepEqual(plan.cacheCandidates.map((entry) => entry.version), ["0.1.10", "0.1.11"])
  assert.equal(plan.warnings.length, 1)
})

it("rejects malformed config before creating an uninstall plan", async () => {
  const configPath = join(await mkdtemp(join(tmpdir(), "opencode-monitor-uninstall-config-")), "tui.json")
  await writeFile(configPath, "{ not valid json")
  await assert.rejects(
    buildUninstallPlan({ scope: "global", configPaths: [configPath], cacheRoot: await mkdtemp(join(tmpdir(), "opencode-monitor-uninstall-cache-")) }),
    /Malformed OpenCode config/,
  )
})
