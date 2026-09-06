import { access, readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"
import { join, resolve } from "node:path"

export type PluginVerificationOptions = {
  cacheDirectory?: string
  packageName: string
  expectedVersion: string
  distPath?: string
}

export type PluginVerification = {
  ok: boolean
  packagePath?: string
  actualVersion?: string
  staleEntries: string[]
  warnings: string[]
  errors: string[]
}

type PackageManifest = { name?: unknown; version?: unknown }

export function getDefaultOpenCodeCacheDirectory(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const cacheRoot = env.OPENCODE_CACHE_DIR ?? env.XDG_CACHE_HOME ?? join(home, ".cache")
  return join(cacheRoot, "opencode", "packages")
}

async function readManifest(path: string): Promise<PackageManifest | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PackageManifest
  } catch {
    return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function verifyPluginInstallation(options: PluginVerificationOptions): Promise<PluginVerification> {
  const cacheDirectory = resolve(options.cacheDirectory ?? getDefaultOpenCodeCacheDirectory())
  const errors: string[] = []
  const staleEntries: string[] = []
  const warnings: string[] = []
  let packagePath: string | undefined
  let actualVersion: string | undefined
  let expectedArtifactFound = false
  let expectedPackagePath: string | undefined

  let entries: string[]
  try {
    entries = (await readdir(cacheDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${options.packageName}@`))
      .map((entry) => entry.name)
  } catch {
    return { ok: false, staleEntries, warnings, errors: [`OpenCode package cache not found: ${cacheDirectory}`] }
  }

  for (const entry of entries) {
    const candidatePath = join(cacheDirectory, entry, "node_modules", options.packageName)
    const manifest = await readManifest(join(candidatePath, "package.json"))
    if (manifest?.name !== options.packageName || typeof manifest.version !== "string") {
      staleEntries.push(join(cacheDirectory, entry))
      continue
    }
    if (manifest.version === options.expectedVersion) {
      expectedArtifactFound = true
      expectedPackagePath ??= candidatePath
      if (await exists(join(candidatePath, options.distPath ?? "dist", "tui.js")) && packagePath === undefined) {
        packagePath = candidatePath
        actualVersion = manifest.version
      }
    } else {
      staleEntries.push(join(cacheDirectory, entry))
    }
  }

  if (!expectedArtifactFound) {
    errors.push(`Installed ${options.packageName}@${options.expectedVersion} was not found in ${cacheDirectory}`)
  } else if (packagePath === undefined) {
    errors.push(`Required dist/tui.js is missing from an expected ${options.packageName}@${options.expectedVersion} artifact in ${cacheDirectory}`)
    packagePath = expectedPackagePath
    actualVersion = options.expectedVersion
  } else if (actualVersion !== options.expectedVersion) {
    errors.push(`Installed version is ${actualVersion ?? "unknown"}; expected ${options.expectedVersion}`)
  }

  if (staleEntries.length > 0) warnings.push(`Stale OpenCode cache entries detected: ${staleEntries.join(", ")}`)

  return { ok: errors.length === 0, packagePath, actualVersion, staleEntries, warnings, errors }
}

export function shouldInstallPlugin(result: PluginVerification): boolean {
  return !result.ok
}

export function formatVerificationResult(result: PluginVerification): string {
  const lines = result.ok
    ? [`Verified OpenCode plugin ${result.actualVersion} at ${result.packagePath}`]
    : result.errors
  return [...lines, ...result.warnings].join("\n")
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const packageManifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    name: string
    version: string
  }
  const result = await verifyPluginInstallation({
    packageName: packageManifest.name,
    expectedVersion: packageManifest.version,
    cacheDirectory: process.env.OPENCODE_CACHE_DIR,
  })
  console.log(formatVerificationResult(result))
  if (!result.ok) process.exitCode = 1
}
