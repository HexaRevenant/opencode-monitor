# Documentation Verification Parity Specification

## Purpose

Keep localized README verification instructions aligned with the supported package
workflow, while making documentation drift detectable without changing product
behavior or npm scripts.

## Requirements

### Requirement: Portuguese verification commands match the supported sequence

The Portuguese `### Verificação` block MUST list the commands
`npm run install-plugin`, `npm run verify-installation`, `npm test`,
`npm run typecheck`, and `npm run build`, in that order. The documentation MUST
retain the current `0.1.21` version examples elsewhere in the README.

#### Scenario: Portuguese users see the complete verification workflow

- GIVEN the Portuguese README section is displayed
- WHEN a user follows its verification command block
- THEN installation, artifact verification, tests, type checking, and build run in the established order

#### Scenario: Version examples remain unchanged

- GIVEN the README contains package installation examples using version `0.1.21`
- WHEN verification documentation is updated
- THEN those version examples remain `0.1.21`

### Requirement: Portuguese Windows helper wording reflects current behavior

The Portuguese Windows network-speed description MUST state that the Bun path
reuses a persistent Node helper and that PowerShell is only a bounded fallback
when the helper or native API is unavailable. The documentation MUST NOT imply
that this change alters runtime behavior.

#### Scenario: Portuguese Windows guidance describes the primary path

- GIVEN a Portuguese reader reviews the Windows network-speed guidance
- WHEN the reader determines which helper is used under Bun
- THEN the guidance identifies the persistent Node helper as the primary path
- AND identifies PowerShell as a bounded fallback

#### Scenario: Unavailable helper or native API is covered

- GIVEN the Node helper or native Windows API cannot be loaded
- WHEN the reader follows the documented fallback description
- THEN the guidance permits the bounded PowerShell fallback without promising a new product behavior

### Requirement: Automated parity check detects localized command drift

The test suite MUST include a read-only documentation-parity check that extracts
the localized verification blocks and compares their command sequence with the
authoritative ordered script names in `package.json`. The check MUST cover the
Portuguese block, fail with a clear localized-section message when parity drifts,
and distinguish the mutating `install-plugin` step from the read-only
`verify-installation` step. It MUST NOT modify README, package scripts, or runtime
state.

#### Scenario: Matching commands pass

- GIVEN the localized verification block contains the authoritative command sequence
- WHEN `npm test` runs
- THEN the parity check passes without changing repository or runtime state

#### Scenario: Command drift fails clearly

- GIVEN a localized verification block omits, reorders, or adds a command
- WHEN `npm test` runs
- THEN the parity check fails and identifies the affected localized section

#### Scenario: Read-only verification remains distinct

- GIVEN the localized block includes both installation and verification commands
- WHEN the parity check evaluates their roles
- THEN `install-plugin` is treated as the active installation step and `verify-installation` as read-only
