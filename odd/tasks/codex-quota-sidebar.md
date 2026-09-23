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
  - Reopened by user feedback: show the Codex quota section only when the current session uses OpenAI/Codex; keep system metrics visible for every provider. Use session provider then latest user-message provider, and hide quotas when provider is unknown.
  - Reopened by user feedback: add Nerd Font and Unicode fallback icons for session/weekly windows, credit balance, quota reset credits, and additional limits. Keep provider gating, labels, line breaks, polling, and system metrics unchanged.
  - Reopened by user feedback: listen for `session.next.model.switched` for the current session; the selected provider overrides persisted session and latest user-message providers so switching away hides quota and switching to OpenAI refreshes immediately.
  - Reopened by user feedback: add visible separation between system metrics and Codex usage; show matching icons and independent MCP-style disclosure controls; canonicalize host POSIX locales and use the resulting locale for Codex reset dates and the panel date.
  - Route: delegated direct; trigger evidence: implementation requires coordinated changes to quota service, UI, tests, and documentation.
  - Acceptance: active OpenCode Codex account only; selected next-model provider overrides persisted session and latest user-message provider; current-session provider switch updates visibility and polling immediately; switching away clears quota and stops polling; switching to OpenAI fetches immediately; unknown provider hides quotas; selected-model listener is current-session-scoped and disposed; system metrics remain visible for every provider; system and Codex sections have visible separation, their own headings/icons, and independent left-click disclosure controls that hide content but keep headings; preserve five-minute polling and line-separated layout; credit balance and quota reset counters have distinct labels; reset counters render applicable / available; no expiry date is inferred or displayed; quota rows use clear Nerd Font/Unicode fallback icons; reset dates and panel date use canonicalized host locale (including POSIX locale names), with invalid/C locale fallback to runtime locale and time seconds retained where supported; missing auth/API failure degrades gracefully; secrets are never rendered/logged.
  - Checks: `npm test`, `npm run typecheck`, `npm run build`.
  - Verification evidence: Prior implementation, provider, and icon commits were verified previously. Current-session next-model refinement: RED observed because selected provider did not override stored/latest OpenAI providers; GREEN: `npm test` passed (62 tests); parent spot-check `npm test` passed (62 tests); `npm run typecheck` passed; `npm run build` passed. Follow-up UI/locale refinement RED was observed for absent locale helpers, ignored locale formatting, and missing disclosure icon mappings. GREEN: `npm test` passed (67 tests, 0 failures); parent spot-check `npm test` passed (67 tests); `npm run typecheck` passed; `npm run build` passed. Added locale coverage confirms `es_CL.UTF-8` canonicalizes to `es-CL`, invalid/`C` locales fall back, and Chile date order/time seconds are retained. No live API calls. Native review remains blocked on sync-generated untracked state; no review START occurred.
  - Commits: `e8eadea` (`feat(codex): show active account quota resets`), `e21143e` (`fix(tui): separate Codex quota reset lines`), `fb7eba9` (`fix(tui): clarify Codex quota credits`), `89e46d5` (`fix(tui): hide Codex quota for other providers`), `7875e1c` (`feat(tui): add Codex quota icons`), `c6eb25d` (`fix(tui): follow active next-model provider`).

## Delivery
- Strategy: `ask-on-risk` (default); estimate is provisional pending implementation diff.
- Chain strategy: `stacked-to-main` (selected based on the pre-commit estimate; no PR was authorized or created).
- Branch: `feat/codex-quota-sidebar`.
- Slice boundaries: one coherent behavior unit; no PR or remote action authorized.

## Progress and next step
- Exploration completed against the plugin and local `codexctl` source; active-account-only scope confirmed by the user.
- CQ-1 implementation is complete in the listed commits. Restart OpenCode to load the latest local build, then verify that switching to OpenCode Zen hides Codex quotas while system metrics remain. Native RDD review remains blocked on intended-untracked selection for sync-generated config/backups; preserve these files and do not guess a selection. No PR or remote action was taken.
