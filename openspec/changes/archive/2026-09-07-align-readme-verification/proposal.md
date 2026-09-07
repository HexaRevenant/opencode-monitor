# Proposal: Align README Verification Documentation

## Intent

Align the Portuguese README verification path with the supported workflow and correct its Windows network-helper description. Add an automated parity check so localized command drift is detected by the test suite.

## Scope

### In Scope
- Add `npm run install-plugin` and `npm run verify-installation` to the Portuguese verification block, before test, typecheck, and build commands.
- Correct the Portuguese Windows wording to describe the persistent Node helper on the Bun Windows path and PowerShell as the bounded fallback.
- Add a read-only parity test covering localized verification commands against authoritative package scripts.

### Out of Scope
- Version-example normalization; retain the current `0.1.21` examples.
- Changes to product behavior, installation helpers, or existing npm script definitions.
- Broader translation cleanup or checks for unrelated README sections.

## Capabilities

### New Capabilities
- `documentation-verification-parity`: Localized README verification instructions remain aligned with the supported command sequence and are checked automatically.

### Modified Capabilities
- None.

## Approach

Update `README.md` using the English and Spanish verification blocks as the sequence reference. Add `test/readme-parity.test.ts`, discovered by the existing `npm test` glob, to extract each localized block and compare commands with the ordered list from `package.json`. Keep the test read-only and preserve the distinction between mutating `install-plugin` and read-only `verify-installation`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `README.md` | Modified | Portuguese verification commands and Windows helper wording. |
| `test/readme-parity.test.ts` | New | Automated cross-language verification-command parity check. |
| `package.json` | Reference only | Existing script names define the expected command sequence; no edits. |
| `scripts/plugin-installation.ts`, `scripts/install-plugin.ts`, `src/metrics.ts` | Reference only | Existing behavior validating documentation; no edits. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| The parity test adds maintenance work when commands or README structure change. | Med | Keep extraction narrow and fail with a clear localized-section message. |
| Users run installation when only verification was intended. | Low | Document `install-plugin` as an active installation step and `verify-installation` as read-only. |

## Rollback Plan

Revert the README and parity-test commit. Existing product code, npm scripts, and runtime behavior remain unchanged, so rollback has no operational migration.

## Dependencies

- Existing `npm test` test discovery and current package script definitions.

## Success Criteria

- [ ] Portuguese verification lists installation, artifact verification, tests, typecheck, and build in the established order.
- [ ] Portuguese Windows wording accurately describes helper and fallback behavior.
- [ ] `npm test` fails when localized verification command parity drifts.
- [ ] `npm test`, `npm run typecheck`, and `npm run build` pass without product or npm-script changes.
