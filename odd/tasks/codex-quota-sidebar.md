# Codex quota indicators in the sidebar

## Objective
Show usage and reset timing for the currently active Codex account in the OpenCode monitor sidebar, refreshing quota data every five minutes.

## Problem and rationale
The plugin currently displays local system metrics only. `codexctl` also exposes Codex quota windows, credits, and reset information. Bringing those indicators into the existing sidebar makes current Codex usage visible without switching tools.

## Scope
- Read the active OpenCode Codex OAuth credentials from OpenCode's existing auth store; do not manage or switch accounts in this task.
- Fetch Codex usage indicators (primary/secondary quota windows and supported additional/credit indicators) and display their reset times when available.
- Refresh quota data every five minutes, independently of the existing two-second system-metrics polling.
- Handle missing credentials, unavailable optional fields, and request errors without exposing tokens or blocking system metrics.
- Keep source, tests, and concise user-facing documentation together; README feature notes cover Spanish, English, and Portuguese.

## Constraints
- Do not copy credentials into plugin-owned storage or log credentials, request headers, or raw sensitive API responses.
- Use existing Codex quota API behavior evidenced in the local `codexctl` reference; do not make remote calls during implementation or verification.
- Render absent reset timestamps as unavailable; do not infer reset values.
- Keep technical artifacts in English; localize new user-facing strings consistently with the existing supported locales.

## Effective TDD and verification
- TDD: enabled from existing project configuration (`openspec/config.yaml`); runner: `npm test` (`tsx --test test/*.test.ts`).
- Applicable checks: `npm test`, `npm run typecheck`, `npm run build`.
- Runtime harness: N/A; no automated OpenCode TUI runtime harness is configured.

## Authorized scope
- `src/` quota reader, parsing/formatting, polling and sidebar presentation.
- `test/` focused quota and polling tests.
- `README.md` documentation for the new sidebar indicators and requirements.
- This task document and its Engram mirror.

## Tasks
- [ ] **CQ-1** — Add secure active-account quota reading, five-minute polling, sidebar usage/reset indicators, and focused tests/docs.
  - Reopened by user feedback: the `credits.balance` value was ambiguous beside `rate_limit_reset_credits`; identify credit balance and quota reset credits separately, and render reset counters applicable / available, in that order.
  - Route: delegated direct; trigger evidence: implementation requires coordinated changes to quota service, UI, tests, and documentation.
  - Acceptance: active OpenCode Codex account only; credit balance and quota reset counters have distinct labels; reset counters render applicable / available; no expiry date is inferred or displayed; preserve five-minute polling and line-separated layout; missing auth/API failure degrades gracefully; secrets are never rendered/logged.
  - Checks: `npm test`, `npm run typecheck`, `npm run build`.
  - Verification evidence: Original implementation commit `e8eadea` verified previously. First visual refinement commit `e21143e` separated quota display lines. Credits clarification: RED observed after adding tests for missing localized balance/reset-credit labels and applicable-first ordering; GREEN: `npm test` passed (59 tests); parent spot-check `npm test` passed (59 tests); `npm run typecheck` passed; `npm run build` passed. No live API calls were made.
  - Commits: `e8eadea` (`feat(codex): show active account quota resets`), `e21143e` (`fix(tui): separate Codex quota reset lines`); credits-label refinement commit pending.

## Delivery
- Strategy: `ask-on-risk` (default); estimate is provisional pending implementation diff.
- Chain strategy: `stacked-to-main` (selected for work-unit delivery before the next commit; no PR was authorized or created).
- Branch: `feat/codex-quota-sidebar`.
- Slice boundaries: one coherent behavior unit; no PR or remote action authorized.

## Progress and next step
- Exploration completed against the plugin and local `codexctl` source; active-account-only scope confirmed by the user.
- CQ-1 is reopened for the credits-label and reset-counter-order clarification. Clarification checks passed; do not mark complete until its work-unit commit is recorded. No PR or remote action was taken.
