import { homedir } from "node:os"
import { posix, win32 } from "node:path"

export type OpenCodePlatform = "linux" | "darwin" | "win32"

export function defaultOpenCodeAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform: OpenCodePlatform = process.platform as OpenCodePlatform,
): string {
  const dataHome = env.XDG_DATA_HOME || (platform === "win32"
    ? win32.join(home, ".local", "share")
    : posix.join(home, ".local", "share"))
  const path = platform === "win32" ? win32 : posix
  return path.join(dataHome, "opencode", "auth.json")
}
