import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { formatVerificationResult, shouldInstallPlugin, verifyPluginInstallation } from "./plugin-installation.js"

const execFileAsync = promisify(execFile)
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string
  version: string
}
const packageSpec = `${manifest.name}@${manifest.version}`

export async function installPlugin(): Promise<void> {
  const verificationOptions = {
    packageName: manifest.name,
    expectedVersion: manifest.version,
    cacheDirectory: process.env.OPENCODE_CACHE_DIR,
  }
  const current = await verifyPluginInstallation(verificationOptions)
  console.log(formatVerificationResult(current))
  if (!shouldInstallPlugin(current)) {
    console.log(`Installation already current for ${packageSpec}; OpenCode was not invoked.`)
    return
  }

  console.log(`Installing ${packageSpec} globally through OpenCode`)
  try {
    const result = await execFileAsync("opencode", ["plugin", "-g", packageSpec, "--force"], { windowsHide: true })
    if (result.stdout.trim()) console.log(result.stdout.trim())
    if (result.stderr.trim()) console.error(result.stderr.trim())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`OpenCode plugin installation failed: ${message}`)
    process.exitCode = 1
    return
  }

  const verification = await verifyPluginInstallation(verificationOptions)
  console.log(formatVerificationResult(verification))
  if (!verification.ok) process.exitCode = 1
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await installPlugin()
}
