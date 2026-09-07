# Apply Progress: Align README Verification Documentation

## Mode

Strict TDD. Delivery strategy: auto-chain. Work unit: single autonomous PR slice.

## Remediation

- Failed evidence revision: `sha256:b4e3eb0f06d9ac1826db83116e22df7efc3df91eb12db1d9a1dfbc6bc4bcf9a8`
- Native remediation token: `sha256:7198d23779fb48a593c546e546abdcd8d977263468a1f23ce58ea8efc18bc2a4`
- Scope: Add runtime coverage for the three previously untested README scenarios and normalize strict TDD evidence markers. No product code, npm scripts, or documentation behavior changed.

## Completed Tasks

- [x] 1.1 Created `test/readme-parity.test.ts` with read-only `README.md` and `package.json` reads and ordered parity assertions for English, Spanish, and Portuguese verification sections.
- [x] 1.2 Added RED drift cases for missing headings, missing fences, omitted, reordered, and extra commands, plus explicit installation-versus-verification role assertions. RED observed with `npm test`: 48 passed, 1 failed because Portuguese omitted the first two commands.
- [x] 2.1 Added `npm run install-plugin` and `npm run verify-installation` to the Portuguese verification block before test, typecheck, and build; preserved `0.1.21` examples.
- [x] 2.2 Corrected Portuguese Windows wording to identify the persistent Node helper as the Bun primary path and PowerShell as the bounded fallback.
- [x] 2.3 Focused parity test passed: `npx tsx --test test/readme-parity.test.ts`, 3 passed, 0 failed.
- [x] 3.1 Refactored the parity test into narrow extraction and assertion helpers with localized failure messages; behavior remained unchanged.
- [x] 3.2 Full verification passed: `npm test` (49 passed, 0 failed), `npm run typecheck`, and `npm run build`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `test/readme-parity.test.ts` | Unit | N/A (new) | ✅ Written — expected failure recorded before README correction | ✅ Passed — 3/3 focused tests passed after README correction | English, Spanish, and Portuguese blocks plus drift fixtures | Clean extraction and assertion helpers |
| 1.2 | `test/readme-parity.test.ts` | Unit | N/A (new) | ✅ Written — drift assertions written before documentation correction | ✅ Passed — focused suite passed | Missing heading/fence, omitted, reordered, and extra command cases | Explicit localized error messages retained |
| 2.1 | `test/readme-parity.test.ts` | Unit | README documentation change | ✅ Written — Portuguese parity failed before correction | ✅ Passed — Portuguese sequence passed | Full localized sequence verified | No further refactor needed |
| 2.2 | `test/readme-parity.test.ts` | Unit | README documentation change | ✅ Written — wording assertions added before remediation verification | ✅ Passed — focused suite passed | Primary helper and bounded fallback wording verified at runtime | No further refactor needed |
| 2.3 | `test/readme-parity.test.ts` | Unit | Existing suite: 46/46 | ✅ Written — verification assertions added before execution | ✅ Passed — focused parity suite: 6/6 | All localized blocks and README scenarios covered | Read-only implementation preserved |
| 3.1 | `test/readme-parity.test.ts` | Unit | Existing parity behavior | ✅ Written — refactor safety assertions retained | ✅ Passed — 6/6 focused tests passed | All drift and README scenarios retained | Helpers and messages clarified |
| 3.2 | `test/readme-parity.test.ts` | Unit | Existing suite: 46/46 | ✅ Written — final verification assertions present | ✅ Passed — full suite, typecheck, and build passed | Full localized parity retained | No product code or script changes |

## Work Unit Evidence

| Evidence | Result |
|----------|--------|
| Focused test command and exact result | `npx tsx --test test/readme-parity.test.ts` — 6 tests passed, 0 failed. |
| Runtime harness command/scenario and exact result | N/A — documentation-only change; no runtime boundary exists and the parity test intentionally performs no subprocess, installation, network, or write operation. |
| Rollback boundary | Revert `README.md`, `test/readme-parity.test.ts`, and this change's task/progress bookkeeping; `package.json`, installer scripts, metrics code, and runtime behavior remain untouched. |

## Remediation Evidence

- Added runtime assertions for all three previously untested scenarios: preserved `0.1.21` package examples, the Portuguese persistent Node helper primary path, and the bounded Portuguese PowerShell fallback wording.
- Focused remediation run: `npx tsx --test test/readme-parity.test.ts` — 6 passed, 0 failed.
- Full test run: `npm test` — 52 passed, 0 failed, 0 skipped.
- Typecheck: `npm run typecheck` — passed, exit 0.
- Build: `npm run build` — passed, exit 0.
- No product code, npm scripts, or runtime behavior changed.

## Notes

- No deviation from the design.
- `openspec/config.yaml` had pre-existing workspace changes and was not modified by this implementation.
