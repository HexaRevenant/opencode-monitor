# Design: Align README Verification Documentation

## Technical Approach

Make a documentation-only correction in `README.md` and add a narrow Node test that treats `package.json` as the command authority. The test extracts the fenced verification command block from the English, Spanish, and Portuguese sections and compares each ordered command list with the supported installation, artifact-verification, test, typecheck, and build sequence. No installer, metrics implementation, npm script, or version example changes.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| Keep parity validation in `test/readme-parity.test.ts` | A new npm script, a standalone linter, or manual review | Existing `npm test` discovers `test/*.test.ts`; a test adds enforcement without changing package behavior or scripts. |
| Read files and compare extracted commands; do not execute README commands | Spawn each command, snapshot the whole README, or duplicate the expected list only in the test | Read-only inspection is safe in CI and cannot mutate OpenCode state. Narrow extraction avoids coupling to unrelated translations while the package manifest remains authoritative. |
| Correct Portuguese wording to match the runtime branch order | General translation cleanup or changes to metrics code | The Bun-on-Windows path first uses the persistent Node helper, then the bounded PowerShell fallback; the implementation already provides this behavior. |

## Data Flow

```text
README.md ──extract localized verification blocks──┐
                                                   ├─ compare ordered commands ── assertions
package.json ──read scripts and build expected list┘
```

The documentation edit adds `npm run install-plugin` followed by `npm run verify-installation` before the existing `npm test`, `npm run typecheck`, and `npm run build` commands in Portuguese. It also states that Bun on Windows uses the persistent Node helper before PowerShell as a bounded fallback.

## File Changes

| File | Action | Description |
|---|---|---|
| `README.md` | Modify | Add the two omitted Portuguese verification commands in established order; correct the Portuguese Windows network-helper description; preserve all `0.1.21` examples. |
| `test/readme-parity.test.ts` | Create | Read `README.md` and `package.json`, extract the three localized verification blocks, and assert command presence, order, and script authority. |
| `package.json` | Reference only | Existing `scripts` entries define the authoritative command names; no edit. |
| `scripts/plugin-installation.ts` | Reference only | Confirms `verify-installation` is read-only cache/artifact verification. |
| `scripts/install-plugin.ts`, `src/metrics.ts`, `src/windows-metrics-helper.ts` | Reference only | Confirm installer and Windows-helper wording; no behavior changes. |

## Interfaces / Contracts

The parity test should use the project’s existing `node:test` and `node:assert/strict` conventions. Its expected ordered commands are:

```typescript
const verificationScripts = [
  "install-plugin", "verify-installation", "test", "typecheck", "build",
]
```

Before comparing README text, assert that each corresponding `npm` command is represented by an existing `package.json` script. Extract only commands beginning with `npm ` inside the verification code fence; fail with the language section name when a heading or fence is missing or commands drift. The test must use filesystem reads only and must not invoke installation, OpenCode, build, or network operations.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | All localized verification blocks match authoritative command order | Add `test/readme-parity.test.ts`; `npm test` runs it through the existing `tsx --test test/*.test.ts` glob. |
| Unit | Drift detection and read-only behavior | The assertions fail for missing/reordered commands; implementation performs no subprocess or filesystem writes. |
| Integration | N/A | No runtime or installer integration changes. |
| E2E | N/A | No product behavior or UI flow changes. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is introduced. The parity test deliberately does not execute documented commands.

## Migration / Rollout

No migration required. Roll back by reverting `README.md` and `test/readme-parity.test.ts`; existing runtime behavior and npm scripts are unaffected.

## Open Questions

None.
