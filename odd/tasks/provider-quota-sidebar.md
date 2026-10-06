# Provider-specific quota panels in the sidebar

## Objective
Show a provider-specific quota panel for the active Codex or OpenCode Go provider, refreshing every five minutes while keeping system metrics visible for all providers.

## Problem and rationale
Codex and OpenCode Go are distinct services with different credentials, endpoints, and response schemas. Preserve the existing Codex quota feature and add Go usage without showing both panels at once.

## Scope
- Codex (`openai`): read OAuth `access` and optional `accountId`, call the Codex usage endpoint, and display session/weekly quota, credits/reset credits, additional limits, and reset timing.
- OpenCode Go (`opencode-go`): read the API key, call the observed Go endpoint, and display rolling 5-hour/weekly/monthly remaining usage, status, and reset time.
- Resolve the active provider by selected next-model choice, then session model, then latest user message. Next-model selection overrides the other sources.
- Fetch only the active provider's quota immediately on entry and then every five minutes; clear stale data and stop polling on provider change.
- Keep system metrics visible for every provider and document both integrations in Spanish, English, and Portuguese.

## Constraints
- Keep Codex OAuth and Go API credentials, readers, endpoints, response types, and labels separate. Never log, display, copy to plugin-owned storage, or otherwise persist credentials.
- The Go endpoint `https://opencode.ai/zen/go/v1/usage` and response schema are publicly observed, not a guaranteed stable/documented contract. Treat `percent` as consumed and clamp remaining `100 - percent` to 0–100; preserve status and valid ISO `resetsAt`.
- Automated implementation checks make no live endpoint/account requests or network/package operations. A later, user-authorized read-only diagnostic request was made to compare the Go API's current usage response with the website; credentials were not exposed.
- Missing or malformed values render unavailable; do not infer status, remaining values, or reset times.
- Keep technical artifacts in English; localize new user-facing strings consistently with the existing supported locales.

## Effective TDD and verification
- TDD: enabled from existing project configuration (`openspec/config.yaml`); runner: `npm test` (`tsx --test test/*.test.ts`).
- Applicable checks: `npm test`, `npm run typecheck`, `npm run build`.
- Runtime harness: N/A; no automated OpenCode TUI runtime harness is configured.

## Authorized scope
- `src/` separate Codex/Go adapters, shared provider selection, formatting, polling and sidebar presentation.
- `test/` auth, parser, provider-gating, formatting and documentation tests.
- `README.md` feature notes in Spanish, English, and Portuguese.
- This renamed existing task document and its Engram full-document mirror identity.

## Tasks
- [x] **CQ-1** — Preserve Codex quota support and add provider-gated OpenCode Go remaining usage.
  - User correction: deleting Codex was not authorized; Go augments the feature rather than replacing it. Show Codex only for `openai`, Go only for `opencode-go`, and never show either panel for another provider.
  - Codex evidence from prior source `084396e^`: `auth.openai` OAuth (`access`, optional `accountId`), `https://chatgpt.com/backend-api/wham/usage`, `rate_limit` primary/secondary windows, credits/reset credits, and additional limits.
  - Go evidence supplied: `GET https://opencode.ai/zen/go/v1/usage`, bearer API key, and `usage.rolling`, `usage.weekly`, `usage.monthly` windows with `status`, `percent`, and `resetsAt`; this behavior is not guaranteed stable.
  - Route: delegated direct; trigger evidence: implementation requires coordinated changes to quota service, UI, tests, and documentation.
  - Acceptance: shared provider resolution applies selected next-model override before session/latest-message provider; Codex appears only for `openai`, Go only for `opencode-go`; provider switch hides/clears old data and stops old polling before fetching the new panel; preserve separate provider-specific auth, endpoints, parsers, response types, labels and icons; both panels refresh every five minutes; Go remaining is clamped `100 - percent`, with status and valid ISO reset preserved; malformed values are unavailable; retain localized reset dates, collapsible UI, spacing, solid arrows, and system metrics for all providers; API keys/tokens are never exposed/persisted; README describes both integrations and Go API caveat in ES/EN/PT.
  - Checks: exactly `npm test`, `npm run typecheck`, and `npm run build`; no automated TUI runtime harness exists.
  - Prior Go-only replacement commit `084396e` is retained as historical context; commit `b267f69` restores Codex alongside Go.
  - TDD evidence: RED observed after adding provider-resolution/mutual-exclusion and Codex OAuth/parser/endpoint tests; 67 tests passed while three new tests failed to resolve the absent Codex/provider modules. GREEN: `npm test` passed (73 tests, 0 failures); `npm run typecheck` passed; `npm run build` passed. The automated checks made no live API calls or network/package operations; a separate user-authorized usage diagnostic occurred later. No TUI visual harness.
  - Unsupported assumption: Go endpoint/schema are publicly observed, undocumented, and may change; `percent` is treated as consumed based on supplied public observations.

## Delivery
- Strategy: `ask-on-risk` (default); estimate is provisional pending implementation diff.
- Chain strategy: `stacked-to-main` (selected based on the pre-commit estimate; no PR was authorized or created).
- Branch: `feat/codex-quota-sidebar`.
- Slice boundaries: one coherent behavior unit; no PR was authorized or created. User-authorized branch push completed to `origin/feat/codex-quota-sidebar`.

## Progress and next step
- Commit `b267f69` contains the verified dual-provider correction. `npm test` passed (73/73), `npm run typecheck`, `npm run build`, and `git diff --check` passed; independent verification found no blocking issue.
- Post-commit assessment was high risk; exact native STATUS stopped with `rdd_disabled`, confirmed by read-only mode status showing global off. No review START, receipt, or approval was created. Local OpenCode configuration/backups remain excluded and untouched. The user-authorized feature branch was pushed to `origin/feat/codex-quota-sidebar`; no PR was created.
