# Tasks: Align README Verification Documentation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 80–140 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Add parity enforcement and align Portuguese guidance | PR 1 | `npm test` | N/A — documentation-only; no runtime boundary | Revert `README.md` and `test/readme-parity.test.ts` |

## Phase 1: RED — Parity Test

- [x] 1.1 Create `test/readme-parity.test.ts` using `node:test`, `node:assert/strict`, and read-only filesystem reads of `README.md` and `package.json` (read-only); assert English, Spanish, and Portuguese verification fences match the authoritative ordered scripts `install-plugin`, `verify-installation`, `test`, `typecheck`, and `build`.
- [x] 1.2 Add RED assertions that missing headings/fences or omitted, reordered, or extra `npm` commands identify the affected localized section, and that `install-plugin` is mutating while `verify-installation` is read-only; run `npm test` and record the expected failure against the current Portuguese block.

## Phase 2: GREEN — Documentation and Test Pass

- [x] 2.1 Update `README.md` Portuguese `### Verificação` with `npm run install-plugin` then `npm run verify-installation` before test, typecheck, and build; preserve every `0.1.21` example.
- [x] 2.2 Correct the Portuguese Windows network-helper wording in `README.md` to identify the persistent Node helper as the Bun primary path and PowerShell as the bounded fallback when the helper or native API is unavailable.
- [x] 2.3 Run `npm test` and confirm the parity test passes without invoking commands, writing files, or changing runtime state.

## Phase 3: Verification and Refactor

- [x] 3.1 Refactor `test/readme-parity.test.ts` only as needed for clear extraction helpers and localized failure messages while preserving read-only behavior and strict assertions.
- [x] 3.2 Run `npm test`, `npm run typecheck`, and `npm run build`; verify no changes to `package.json`, installer scripts, metrics code, or runtime behavior.
