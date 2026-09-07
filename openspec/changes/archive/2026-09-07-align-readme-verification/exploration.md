## Exploration: Verify and correct README documentation against the current repository

### Current State

The repository is a TypeScript ESM OpenCode TUI plugin. `package.json` is the authoritative source for the available verification and installation commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run install-plugin`, and `npm run verify-installation` are all defined. The verification helper checks the OpenCode package cache, validates the nested package manifest version, confirms `dist/tui.js`, and reports stale entries without deleting them. The installation helper verifies before and after invoking the global OpenCode installer.

The README is broadly aligned with the repository and currently reports version `0.1.21`, matching `package.json`. English and Spanish verification sections include both installation/verification helpers followed by tests, type checking, and build. The Portuguese `### Verificação` section only includes `npm test`, `npm run typecheck`, and `npm run build`, so it omits the repository's explicit installation and artifact-verification checks identified during SDD initialization.

A secondary Portuguese drift exists in the Windows network feature description: it says PowerShell is the bounded fallback when native loading fails, but the current implementation under Bun first reuses a persistent Node helper and only retains PowerShell as a bounded fallback after that path. The English and Spanish sections already describe this newer behavior.

### Affected Areas

- `README.md:356-362` — Portuguese verification commands are incomplete compared with `package.json` and the English/Spanish sections.
- `README.md:275-280` — Portuguese feature claims should be checked against the current Windows metrics helper and the corresponding English/Spanish documentation.
- `package.json:22-29` — authoritative npm script names and command behavior used to validate README examples.
- `scripts/plugin-installation.ts:46-121` — read-only installation verification behavior, including cache, manifest-version, and `dist/tui.js` checks.
- `scripts/install-plugin.ts:14-46` — preflight/post-install verification and global OpenCode installation behavior.
- `scripts/build.ts:3-16` — build entry points and output assumptions referenced by README verification.
- `test/package.test.ts:22-67` — executable coverage for installation verification behavior.
- `src/metrics.ts:51-112` and `src/windows-metrics-helper.ts:23-42` — current persistent Node helper behavior relevant to the Portuguese Windows network claim.
- `openspec/config.yaml:3-10,29-40` — initialized SDD context, testing commands, and recorded README discrepancy.

### Concrete Discrepancies

1. **Portuguese verification omits `npm run install-plugin`.** This command is defined in `package.json` and performs the supported global OpenCode installation flow with the current package version, while avoiding the OpenCode invocation when the expected artifact is already current.
2. **Portuguese verification omits `npm run verify-installation`.** This command is defined in `package.json` and directly exercises the cache/artifact verification helper described elsewhere in the README.
3. **Portuguese verification is not command-parity aligned.** English and Spanish list installation, artifact verification, tests, type checking, and build in that order; Portuguese lists only the final three checks.
4. **Portuguese Windows network wording is behind the implementation.** The current Bun path reuses `windows-metrics-helper.js` through a persistent Node child process before falling back to bounded PowerShell execution. The Portuguese text does not mention the helper.

No discrepancy was found in the documented package version (`0.1.21`), local installation commands, safe-uninstall command names, font command names, or the root/`./tui` export statements during this exploration.

### Approaches

1. **Focused Portuguese correction** — update the Portuguese verification block with the two omitted commands and correct the Windows helper wording.
   - Pros: Directly resolves the initialization finding, keeps the change small, preserves existing language sections, and stays well below the 400-line review budget.
   - Cons: Does not create a general mechanism to prevent future drift between language sections and scripts.
   - Effort: Low

2. **Cross-language README parity audit** — normalize verification and command documentation across Spanish, English, and Portuguese, potentially adding a lightweight documentation-check script/test.
   - Pros: Reduces future inconsistencies and makes the README's verification path uniform.
   - Cons: Expands scope beyond the identified defect, risks unnecessary translation edits, and adds maintenance cost for a documentation-only change.
   - Effort: Medium

### Recommendation

Use the focused Portuguese correction as the proposed change. Add `npm run install-plugin` and `npm run verify-installation` before the existing test/typecheck/build commands, matching the established English and Spanish verification sequence. Correct the Portuguese Windows network description to mention the persistent Node helper under Bun and retain PowerShell as the bounded fallback. Treat automated cross-language parity checking as out of scope unless the product owner explicitly wants documentation tooling; the current issue can be corrected without changing scripts or product behavior.

### Open Product Decisions

- Should this change be strictly limited to the Portuguese verification section, or should the secondary Portuguese Windows network wording drift be corrected in the same README change?
- Should verification instructions remain hardcoded to the current package version elsewhere in the README, or should a future documentation change avoid version-specific examples to reduce release drift?
- Is a documentation-parity test desired, or is manual review of the three localized sections sufficient for this maintenance change?

### Risks

- `npm run install-plugin` can invoke the user's global `opencode` command when the installation is stale; the README should make clear that it is an active installation step, not merely a read-only check.
- `npm run verify-installation` depends on the local OpenCode cache and may correctly fail on a fresh checkout before installation; ordering it after installation avoids misleading verification failures.
- Documentation-only corrections can still drift if future package scripts or localized sections change without a matching README review.
- The Portuguese network wording should not imply that the Node helper is universally used; the helper is specifically part of the Bun Windows path, with native and fallback behavior remaining platform/runtime dependent.

### Ready for Proposal

Yes. The change has a narrow, evidence-backed scope: correct the Portuguese verification sequence and, preferably in the same maintenance slice, update the related Portuguese Windows network description. The proposal should explicitly state that no product code or npm scripts are being changed and include command ordering plus the read-only versus mutating behavior of the two installation helpers.
