import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { basename, join } from "node:path"
import { execFile as execFileCallback } from "node:child_process"
import { promisify } from "node:util"
import { getFontDirectories, hasHackNerdFont, isHackNerdFontFile, type SupportedPlatform } from "../src/font.js"

const execFile = promisify(execFileCallback)
const RELEASE_URL = "https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/Hack.zip"

function printHelp(): void {
  console.log(`Install Hack Nerd Font for the current user.

Usage:
  npm run install-font          Ask before downloading and installing
  npm run install-font --check  Detect only; never downloads or changes files
  npm run install-font --help   Show this help
  npm run install-font --yes    Skip the download confirmation`)
}

async function confirm(): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  process.stdout.write("Download Hack Nerd Font from the official Nerd Fonts release? [y/N] ")
  for await (const chunk of process.stdin) return /^y(es)?$/i.test(String(chunk).trim())
  return false
}

async function findFontFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await findFontFiles(path)))
    else if (entry.isFile() && isHackNerdFontFile(entry.name)) files.push(path)
  }
  return files
}

async function extractZip(zipPath: string, destination: string, platform: SupportedPlatform): Promise<void> {
  try {
    if (platform === "win32") {
      await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", zipPath, destination])
    } else {
      await execFile("unzip", ["-q", "-o", zipPath, "-d", destination])
    }
  } catch (error) {
    throw new Error(`Could not extract the ZIP archive. Install unzip (Linux/macOS) or use PowerShell (Windows). ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function registerWindowsFonts(fontFiles: string[]): Promise<void> {
  const script = "$key='HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'; New-Item -Path $key -Force | Out-Null; foreach ($font in $args) { New-ItemProperty -Path $key -Name ([IO.Path]::GetFileNameWithoutExtension($font)) -Value $font -PropertyType String -Force | Out-Null }"
  await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script, ...fontFiles])
}

async function install(): Promise<void> {
  const platform = process.platform as SupportedPlatform
  const supportedPlatforms: SupportedPlatform[] = ["linux", "darwin", "win32"]
  if (!supportedPlatforms.includes(platform)) throw new Error(`Unsupported platform: ${process.platform}`)
  if (hasHackNerdFont(platform)) return console.log("Hack Nerd Font is already installed; nothing to do.")
  if (!(process.argv.includes("--yes") || (await confirm()))) return console.log("Installation cancelled. Use --yes to confirm non-interactively.")

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "opencode-monitor-font-"))
  try {
    console.log(`Downloading ${RELEASE_URL}`)
    const response = await fetch(RELEASE_URL)
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status} ${response.statusText}`)
    const zipPath = join(temporaryDirectory, "Hack.zip")
    await writeFile(zipPath, Buffer.from(await response.arrayBuffer()))
    const extractedDirectory = join(temporaryDirectory, "extracted")
    await mkdir(extractedDirectory)
    await extractZip(zipPath, extractedDirectory, platform)
    const fontFiles = await findFontFiles(extractedDirectory)
    if (fontFiles.length === 0) throw new Error("The downloaded archive did not contain Hack Nerd Font files.")
    const targetDirectory = getFontDirectories(platform)[0]
    await mkdir(targetDirectory, { recursive: true })
    const installedFiles = fontFiles.map((file) => join(targetDirectory, basename(file)))
    for (let index = 0; index < fontFiles.length; index += 1) await cp(fontFiles[index], installedFiles[index], { force: true })
    if (platform === "win32") {
      try { await registerWindowsFonts(installedFiles) }
      catch { console.warn("Fonts were copied, but Windows font registration failed. Select Hack Nerd Font in the terminal manually.") }
    }
    console.log(`Installed ${fontFiles.length} font files in ${targetDirectory}. Select Hack Nerd Font in your terminal and restart OpenCode.`)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

if (process.argv.includes("--help")) printHelp()
else if (process.argv.includes("--check")) console.log(hasHackNerdFont() ? "Hack Nerd Font is installed." : "Hack Nerd Font is not installed.")
else install().catch((error: unknown) => { console.error(`Hack Nerd Font installation could not be completed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
