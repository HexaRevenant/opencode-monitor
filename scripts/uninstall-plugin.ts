import { lstat, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export type UninstallScope = "global" | "local"

export type ConfigChange = {
  path: string
  removed: string[]
  content: string
}

export type CacheCandidate = {
  path: string
  version: string
}

export type UninstallPlan = {
  configChanges: ConfigChange[]
  cacheCandidates: CacheCandidate[]
  warnings: string[]
}

type PackageManifest = { name?: unknown; version?: unknown }

const packageManifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { name: string }
const packageName = packageManifest.name

function isPackageSpec(value: unknown, name: string): value is string {
  return typeof value === "string" && (value === name || value.startsWith(`${name}@`))
}

function filterPluginArrays(value: unknown, name: string, removed: string[]): unknown {
  if (Array.isArray(value)) return value
  if (value === null || typeof value !== "object") return value

  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if ((key === "plugin" || key === "plugins") && Array.isArray(child)) {
      result[key] = child.filter((entry) => {
        const spec = typeof entry === "string" ? entry : Array.isArray(entry) ? entry[0] : undefined
        if (!isPackageSpec(spec, name)) return true
        removed.push(spec)
        return false
      })
    } else {
      result[key] = filterPluginArrays(child, name, removed)
    }
  }
  return result
}

export function filterPluginConfig(content: string, name = packageName): { content: string; removed: string[] } {
  const parsed: unknown = JSON.parse(content)
  const removed: string[] = []
  const filtered = filterPluginArrays(parsed, name, removed)
  const newline = content.includes("\r\n") ? "\r\n" : "\n"
  const serialized = JSON.stringify(filtered, null, 2)
  return { content: `${serialized.replaceAll("\n", newline)}${newline}`, removed }
}

export function getConfigPaths(scope: UninstallScope, cwd = process.cwd(), home = homedir(), env: NodeJS.ProcessEnv = process.env): string[] {
  if (scope === "local") return [join(cwd, ".opencode", "tui.json"), join(cwd, ".opencode", "opencode.json"), join(cwd, "opencode.json")]
  const configRoot = env.XDG_CONFIG_HOME ?? join(home, ".config")
  const globalRoots = [join(configRoot, "opencode"), join(home, ".config", "opencode"), join(home, ".opencode")]
  return [...new Set([
    ...globalRoots.flatMap((root) => [join(root, "tui.json"), join(root, "opencode.json")]),
    join(configRoot, "opencode.json"),
  ])]
}

export function getCachePackagesRoot(home = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  const cacheRoot = env.OPENCODE_CACHE_DIR ?? env.XDG_CACHE_HOME ?? join(home, ".cache")
  return join(cacheRoot, "opencode", "packages")
}

function isWithin(root: string, candidate: string): boolean {
  const fromRoot = relative(resolve(root), resolve(candidate))
  return fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot)
}

async function readPackageManifest(path: string): Promise<PackageManifest | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PackageManifest
  } catch {
    return undefined
  }
}

export async function findCacheCandidates(
  cacheRoot: string,
  name = packageName,
  versions: Set<string> | undefined = undefined,
  purgeCache = false,
): Promise<{ candidates: CacheCandidate[]; warnings: string[] }> {
  const root = resolve(cacheRoot)
  const candidates: CacheCandidate[] = []
  const warnings: string[] = []
  let entries
  try {
    if ((await lstat(root)).isSymbolicLink()) throw new Error(`Unexpected symbolic link cache root: ${root}`)
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { candidates, warnings }
    if (error instanceof Error && error.message.startsWith("Unexpected symbolic link cache root:")) throw error
    throw new Error(`Cannot inspect OpenCode cache root: ${root}`)
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${name}@`)) continue
    const candidatePath = join(root, entry.name)
    if (!isWithin(root, candidatePath) || basename(candidatePath) !== entry.name) throw new Error(`Unexpected cache path: ${candidatePath}`)
    const manifest = await readPackageManifest(join(candidatePath, "node_modules", name, "package.json"))
    if (manifest?.name !== name || typeof manifest.version !== "string") {
      warnings.push(`Skipped unverified cache entry: ${candidatePath}`)
      continue
    }
    if (purgeCache || versions?.has(manifest.version)) candidates.push({ path: candidatePath, version: manifest.version })
  }
  candidates.sort((left, right) => left.path.localeCompare(right.path))
  return { candidates, warnings }
}

export async function buildUninstallPlan(options: {
  scope: UninstallScope
  configPaths?: string[]
  cacheRoot?: string
  packageName?: string
  purgeCache?: boolean
}): Promise<UninstallPlan> {
  const name = options.packageName ?? packageName
  const configChanges: ConfigChange[] = []
  const versions = new Set<string>()
  const warnings: string[] = []
  let hasUnversionedPackage = false

  for (const path of options.configPaths ?? getConfigPaths(options.scope)) {
    let content: string
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error(`Unexpected symbolic link config path: ${path}`)
      content = await readFile(path, "utf8")
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw new Error(`Cannot read OpenCode config: ${path}`)
    }
    let filtered: { content: string; removed: string[] }
    try { filtered = filterPluginConfig(content, name) }
    catch { throw new Error(`Malformed OpenCode config: ${path}`) }
    if (filtered.removed.length === 0) continue
    for (const spec of filtered.removed) {
      if (spec === name) hasUnversionedPackage = true
      const version = spec.slice(name.length + 1)
      if (version && version !== "latest") versions.add(version)
    }
    configChanges.push({ path, removed: filtered.removed, content: filtered.content })
  }

  const cache = await findCacheCandidates(options.cacheRoot ?? getCachePackagesRoot(), name, versions, options.purgeCache || hasUnversionedPackage)
  return { configChanges, cacheCandidates: cache.candidates, warnings: [...warnings, ...cache.warnings] }
}

function printPlan(plan: UninstallPlan, dryRun: boolean): void {
  console.log(dryRun ? "Uninstall dry run (no changes will be made):" : "Uninstall plan:")
  for (const change of plan.configChanges) console.log(`Config ${dryRun ? "would remove" : "remove"} ${change.removed.join(", ")} from ${change.path}`)
  for (const candidate of plan.cacheCandidates) console.log(`Cache ${dryRun ? "would remove" : "remove"} ${candidate.path} (${candidate.version})`)
  if (plan.configChanges.length === 0 && plan.cacheCandidates.length === 0) console.log("No matching plugin configuration or verified cache entries found.")
  for (const warning of plan.warnings) console.warn(`Warning: ${warning}`)
}

export async function uninstallPlugin(args = process.argv.slice(2)): Promise<void> {
  const scope: UninstallScope = args.includes("--local") ? "local" : "global"
  if (args.includes("--local") && args.includes("--global")) throw new Error("Choose only one scope: --local or --global")
  const purgeCache = args.includes("--purge-cache")
  const dryRun = args.includes("--dry-run") || args.includes("--report")
  const yes = args.includes("--yes")
  const plan = await buildUninstallPlan({ scope, purgeCache })
  printPlan(plan, dryRun)
  if (dryRun || (plan.configChanges.length === 0 && plan.cacheCandidates.length === 0)) return
  if (!yes) {
    console.log("Destructive uninstall requires --yes; no changes were made.")
    return
  }

  for (const change of plan.configChanges) {
    if (!isAbsolute(change.path) || (await lstat(change.path)).isSymbolicLink()) throw new Error(`Unexpected config path: ${change.path}`)
    const mode = (await stat(change.path)).mode
    await writeFile(change.path, change.content, { mode })
  }
  const cacheRoot = resolve(getCachePackagesRoot())
  for (const candidate of plan.cacheCandidates) {
    if (!isWithin(cacheRoot, candidate.path) || !basename(candidate.path).startsWith(`${packageName}@`) || (await lstat(candidate.path)).isSymbolicLink()) throw new Error(`Unexpected cache path: ${candidate.path}`)
    await rm(candidate.path, { recursive: true, force: false })
  }
  console.log("Uninstall completed. Restart OpenCode if it was running.")
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try { await uninstallPlugin() }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
