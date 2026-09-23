# OpenCode Go usage in the sidebar

## Objective
Show remaining OpenCode Go usage and reset timing in the OpenCode monitor sidebar, refreshing every five minutes.

## Problem and rationale
Replace the former Codex-specific panel with OpenCode Go usage for sessions using the `opencode-go` provider. Show remaining rolling, weekly, and monthly usage alongside the existing system metrics.

## Scope
- Read only the `opencode-go` API-key entry from OpenCode's existing auth store; do not manage or switch providers/accounts.
- Fetch rolling, weekly, and monthly usage windows, preserve status, compute remaining percentage from consumed `percent`, and format valid reset timestamps.
- Fetch immediately on entering an OpenCode Go session, then refresh every five minutes independently of system metrics.
- Clear stale usage and stop polling when the selected provider changes away from OpenCode Go.
- Keep system metrics visible for every provider and document the behavior in Spanish, English, and Portuguese.

## Constraints
- Never log, display, copy to plugin-owned storage, or otherwise persist the API key.
- The endpoint `https://opencode.ai/zen/go/v1/usage` and response shape are publicly observed behavior, not a guaranteed stable/documented contract.
- No live endpoint/account requests or network/package operations during implementation or verification.
- Missing or malformed usage fields render unavailable; do not infer status, remaining values, or reset times.
- Keep technical artifacts in English; localize new user-facing strings consistently with the existing supported locales.

## Effective TDD and verification
- TDD: enabled from existing project configuration (`openspec/config.yaml`); runner: `npm test` (`tsx --test test/*.test.ts`).
- Applicable checks: `npm test`, `npm run typecheck`, `npm run build`.
- Runtime harness: N/A; no automated OpenCode TUI runtime harness is configured.

## Authorized scope
- `src/` Go usage adapter, provider gating, formatting, polling and sidebar presentation.
- `test/` focused auth, parser, provider, formatting and documentation tests.
- `README.md` feature notes in Spanish, English, and Portuguese.
- This renamed task document and its Engram full-document mirror.

## Tasks
- [ ] **CQ-1** — Replace Codex quota UI with secure OpenCode Go remaining-usage indicators.
  - User clarification: this is a replacement, not an additional provider panel; never render a Codex section.
  - Evidence supplied for the observed API: GET `https://opencode.ai/zen/go/v1/usage`, bearer API key, and `usage.rolling`, `usage.weekly`, `usage.monthly` windows with `status`, `percent`, and `resetsAt`. This behavior is not guaranteed stable.
  - Route: delegated direct; trigger evidence: implementation requires coordinated changes to quota service, UI, tests, and documentation.
  - Acceptance: read only `auth["opencode-go"] = { type: "api", key }` from OpenCode's existing auth file using injectable file IO; never persist or expose the key; gate usage to the selected `opencode-go` provider, with next-model choice overriding session/latest-message providers; show rolling (5-hour), weekly, and monthly remaining percentages as `clamp(100 - percent, 0, 100)`; preserve each status including `rate-limited`; display valid ISO reset times with host locale; render malformed/missing values unavailable; fetch immediately on provider entry, refresh every five minutes, and clear/stop on provider switch away; retain independent collapsible sections, solid `▼` / `▶` arrows, spacing, and visible system metrics for every provider; remove all Codex quota API/UI/credit code and update README in Spanish, English, and Portuguese; errors remain generic and sanitized.
  - Checks: exactly `npm test`, `npm run typecheck`, and `npm run build`; no automated TUI runtime harness exists.
  - Parent spot-check: `npm test` passed (67 tests, 0 failures).
  - TDD evidence: RED observed after adding Go auth, response parsing, and provider-gating tests; 68 tests passed and the two new Go test files failed to resolve the not-yet-created Go modules. A subsequent malformed-calendar regression (`2026-02-31`) also failed before strict date validation was added; an intermediate README assertion caught capitalization drift and was corrected. Final GREEN: `npm test` passed (67 tests, 0 failures); `npm run typecheck` passed; `npm run build` passed. No TUI visual harness is configured. No live API calls or network/package operations were made.
  - Unsupported assumptions: endpoint/response are observed but undocumented and may change; percent is treated as consumed based on public observations, and `resetsAt` as an ISO timestamp.

## Delivery
- Strategy: `ask-on-risk` (default); estimate is provisional pending implementation diff.
- Chain strategy: `stacked-to-main` (selected based on the pre-commit estimate; no PR was authorized or created).
- Branch: `feat/codex-quota-sidebar`.
- Slice boundaries: one coherent behavior unit; no PR or remote action authorized.

## Progress and next step
- Previously committed Codex quota UI is being replaced per explicit user clarification. Go work remains uncommitted and CQ-1 unchecked pending parent verification/commit.
- Native RDD preflight remains blocked by sync-generated untracked config/backups; do not attempt selection/review or alter those files. No live API calls, global config edits, managed sync, or PR.
