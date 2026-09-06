import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join as posixJoin, win32 } from "node:path"

export type SupportedPlatform = "linux" | "darwin" | "win32"

const NERD_FONT_FILE_PATTERN = /NerdFont[A-Za-z0-9-]*[-_][A-Za-z0-9-]+\.(?:ttf|otf)$/i

export function getFontDirectories(platform: SupportedPlatform, home = homedir(), env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform === "darwin") return [posixJoin(home, "Library", "Fonts"), "/Library/Fonts", "/System/Library/Fonts"]
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA ?? win32.join(home, "AppData", "Local")
    const windows = env.WINDIR ?? "C:\\Windows"
    return [win32.join(localAppData, "Microsoft", "Windows", "Fonts"), win32.join(windows, "Fonts")]
  }
  return [posixJoin(home, ".local", "share", "fonts"), posixJoin(home, ".fonts"), "/usr/local/share/fonts", "/usr/share/fonts"]
}

export function isNerdFontFile(fileName: string): boolean {
  return NERD_FONT_FILE_PATTERN.test(fileName)
}

export const isHackNerdFontFile = isNerdFontFile

export function hasNerdFont(platform: SupportedPlatform = process.platform as SupportedPlatform, home = homedir(), env: NodeJS.ProcessEnv = process.env): boolean {
  const containsFont = (directory: string): boolean => {
    if (!existsSync(directory)) return false
    try {
      return readdirSync(directory, { withFileTypes: true }).some((entry) => {
        const path = platform === "win32" ? win32.join(directory, entry.name) : posixJoin(directory, entry.name)
        return entry.isFile() ? isNerdFontFile(entry.name) : entry.isDirectory() && containsFont(path)
      })
    } catch {
      return false
    }
  }
  return getFontDirectories(platform, home, env).some(containsFont)
}

export const hasHackNerdFont = hasNerdFont

export const nerdFontIcons = {
  title: "\u{f0379}",
  cpu: "\u{f0ee0}",
  ram: "\u{f061a}",
  gpu: "\u{f08ae}",
  vram: "\u{f035b}",
  thermometer: "\u{f2c7}",
  network: "\u{f06f3}",
} as const

export const unicodeIcons = { title: "▦", cpu: "▣", ram: "▤", gpu: "◆", vram: "◈", thermometer: "♨", network: "⇅" } as const

export function getMetricIcons(useNerdFont: boolean) {
  return useNerdFont ? nerdFontIcons : unicodeIcons
}
