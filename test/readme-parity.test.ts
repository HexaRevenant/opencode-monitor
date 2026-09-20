import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { it } from "node:test"

const localizedVerificationSections = [
  { heading: "Verification", label: "English" },
  { heading: "Verificación", label: "Spanish" },
  { heading: "Verificação", label: "Portuguese" },
] as const

const verificationScripts = ["install-plugin", "verify-installation", "test", "typecheck", "build"]

function extractVerificationCommands(readme: string, label: string, heading: string): string[] {
  const headingIndex = readme.indexOf(`### ${heading}`)
  if (headingIndex === -1) throw new Error(`${label} verification section heading not found`)

  const section = readme.slice(headingIndex + heading.length + 4)
  const fence = section.match(/```(?:bash|sh|powershell)\n([\s\S]*?)```/)
  if (fence === null) throw new Error(`${label} verification section code fence not found`)

  return fence[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("npm "))
    .map((line) => {
      const match = line.match(/^npm (?:run )?([a-z-]+)$/)
      if (match === null) throw new Error(`${label} verification section contains an invalid npm command`)
      return match[1]
    })
}

function assertVerificationParity(readme: string, label: string, heading: string, scripts: Record<string, string>): void {
  const commands = extractVerificationCommands(readme, label, heading)
  assert.deepEqual(commands, verificationScripts, `${label} verification commands drifted`)
  for (const script of commands) assert.equal(typeof scripts[script], "string", `${label} references missing npm script: ${script}`)
}

it("keeps every localized verification block aligned with package scripts", async () => {
  const [readme, packageJson] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ])
  const scripts = (JSON.parse(packageJson) as { scripts: Record<string, string> }).scripts

  for (const section of localizedVerificationSections) {
    assertVerificationParity(readme, section.label, section.heading, scripts)
  }
})

it("identifies missing localized sections and command drift", () => {
  const scripts = Object.fromEntries(verificationScripts.map((script) => [script, script]))
  assert.throws(
    () => assertVerificationParity("", "Portuguese", "Verificação", scripts),
    /Portuguese verification section heading not found/,
  )
  assert.throws(
    () => assertVerificationParity("### Verificação\n", "Portuguese", "Verificação", scripts),
    /Portuguese verification section code fence not found/,
  )
  assert.throws(
    () => assertVerificationParity("### Verificação\n```bash\nnpm test\n```", "Portuguese", "Verificação", scripts),
    /Portuguese verification commands drifted/,
  )
  for (const commands of [
    ["npm run verify-installation", "npm run install-plugin", "npm test", "npm run typecheck", "npm run build"],
    ["npm run install-plugin", "npm run verify-installation", "npm test", "npm run typecheck"],
    ["npm run install-plugin", "npm run verify-installation", "npm test", "npm run typecheck", "npm run build", "npm run uninstall-plugin"],
  ]) {
    assert.throws(
      () => assertVerificationParity(`### Verificação\n\`\`\`bash\n${commands.join("\n")}\n\`\`\``, "Portuguese", "Verificação", scripts),
      /Portuguese verification commands drifted/,
    )
  }
})

it("keeps installation and verification roles explicit", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> }
  assert.match(packageJson.scripts["install-plugin"], /scripts\/install-plugin\.ts/)
  assert.match(packageJson.scripts["verify-installation"], /scripts\/plugin-installation\.ts/)
  assert.notEqual(verificationScripts[0], verificationScripts[1])
})

it("preserves the README package examples at version 0.1.21", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")
  for (const example of [
    "npm install -g opencode-system-metrics-tui@0.1.21",
    "opencode plugin -g opencode-system-metrics-tui@0.1.21 --force",
    "opencode plugin opencode-system-metrics-tui@0.1.21",
  ]) {
    assert.match(readme, new RegExp(example.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `README version example changed: ${example}`)
  }
})

it("documents the Portuguese Windows helper primary path", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")
  const portugueseFeatures = readme.slice(readme.indexOf("## Português"), readme.indexOf("### Requisitos", readme.indexOf("## Português")))
  assert.match(portugueseFeatures, /sob Bun, reutiliza um helper Node persistente/)
})

it("documents bounded Portuguese PowerShell fallback wording", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")
  const portugueseFeatures = readme.slice(readme.indexOf("## Português"), readme.indexOf("### Requisitos", readme.indexOf("## Português")))
  assert.match(portugueseFeatures, /PowerShell permanece como fallback limitado quando o helper ou a API nativa não podem ser carregados/)
})

const localizedFeatureSections = [
  { heading: "Features", locale: "English" },
  { heading: "Características", locale: "Spanish" },
  { heading: "Funcionalidades", locale: "Portuguese" },
] as const

// Platform matrix: NVIDIA on Linux/Windows via nvidia-smi; Linux AMD via
// amdgpu sysfs; Intel i915 and Windows AMD note their limits; macOS unified RAM.
const gpuMatrixWording = [/nvidia-smi/i, /amdgpu|AMD/i] as const

const gpuLimitationMarkers = /limit|\b(?:only|no busy|no live|sem|sin|não|not|unavail|apenas|solo)\b/i

function extractFeatureSection(readme: string, heading: string): string {
  const start = readme.indexOf(`### ${heading}\n`)
  if (start === -1) throw new Error(`Features section heading not found: ${heading}`)
  const contentStart = start + heading.length + 5
  const end = readme.slice(contentStart).search(/\n#{1,3} /)
  return end === -1 ? readme.slice(contentStart) : readme.slice(contentStart, contentStart + end)
}

function lineOverpromises(line: string): boolean {
  // Windows AMD and Intel i915 cannot report live utilization/busy signals; a
  // claim to the contrary without a limitations note is an overpromise.
  const claimsLiveSensors = /\b(?:Windows AMD|Intel i915)\b/i.test(line) && /utiliz|busy/i.test(line)
  return claimsLiveSensors && !gpuLimitationMarkers.test(line)
}

function assertGpuMatrixParity(section: string, locale: string): void {
  for (const pattern of gpuMatrixWording) {
    assert.match(section, pattern, `${locale} GPU features section is missing platform matrix wording (${pattern})`)
  }
  for (const line of section.split("\n")) {
    if (lineOverpromises(line)) throw new Error(`${locale} GPU features section overpromises GPU data: "${line.trim()}"`)
  }
}

it("keeps GPU platform matrix parity in every localized Features section", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")
  for (const section of localizedFeatureSections) {
    assertGpuMatrixParity(extractFeatureSection(readme, section.heading), section.locale)
  }
})

it("identifies the affected locale when GPU data overpromises", () => {
  const overpromise = [
    "- GPU: utilización y temperatura.",
    "- GPU: Windows AMD utilization and VRAM via WMI.",
    "- Utilización NVIDIA en Linux/Windows via `nvidia-smi`; AMD Linux via amdgpu sysfs.",
  ].join("\n")
  assert.throws(() => assertGpuMatrixParity(overpromise, "Spanish"), /Spanish GPU features section overpromises/)
  const qualified = [
    "- GPU: utilization via `nvidia-smi`; AMD via amdgpu sysfs.",
    "- Intel i915 and Windows AMD note their limits (no busy signal; WMI `AdapterRAM` total only).",
  ].join("\n")
  assert.doesNotThrow(() => assertGpuMatrixParity(qualified, "English"))
})
