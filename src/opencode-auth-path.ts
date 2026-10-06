import { homedir } from "node:os"
import { posix, win32 } from "node:path"

export type OpenCodePlatform = "linux" | "darwin" | "win32"

export function defaultOpenCodeAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform: OpenCodePlatform = process.platform as OpenCodePlatform,
): string {
  if (platform === "win32") {
    return win32.join(env.APPDATA ?? win32.join(home, "AppData", "Roaming"), "opencode", "auth.json")
  }
  if (platform === "darwin") return posix.join(home, "Library", "Application Support", "opencode", "auth.json")
  return posix.join(env.XDG_DATA_HOME ?? posix.join(home, ".local", "share"), "opencode", "auth.json")
}
