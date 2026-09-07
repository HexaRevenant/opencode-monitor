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

it("keeps the README package examples aligned with package.json", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
  const version = packageJson.version
  for (const example of [
    `npm install -g opencode-system-metrics-tui@${version}`,
    `opencode plugin -g opencode-system-metrics-tui@${version} --force`,
    `opencode plugin opencode-system-metrics-tui@${version}`,
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
