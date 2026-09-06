import solidPlugin from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["src/tui.tsx", "scripts/install-hack-font.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
  plugins: [solidPlugin],
  external: ["@opencode-ai/plugin/tui", "@opentui/core", "@opentui/solid", "solid-js", "systeminformation"],
  naming: "[name].js",
})

if (!result.success) {
  console.error(result.logs)
  process.exit(1)
}
