# Codex quota authentication path

## Objective
Make the plugin read OpenAI credentials from the same data directory used by the installed OpenCode release, so the Codex quota panel works on Windows as it does on Linux.

## Problem and rationale
The plugin's `defaultOpenCodeAuthPath` used `%APPDATA%\opencode\auth.json` on Windows. OpenCode 1.18.35 instead uses `xdg-basedir`'s data path on every platform: `$XDG_DATA_HOME/opencode/auth.json`, falling back to `$HOME/.local/share/opencode/auth.json`. The plugin therefore read the wrong Windows auth file and sent a stale token, while Linux used the correct XDG path. This—not OAuth refresh—explains the platform difference.

## Scope
- Match the installed OpenCode version's auth data path exactly on all platforms.
- Add focused path regression tests for Windows, Linux/XDG, and macOS behavior.
- Do not modify unrelated metrics, provider routing, installation configuration, or user credentials.

## Constraints
- Authorized scope: `src/opencode-auth-path.ts`, directly related tests, and task progress documentation.
- Route: delegated direct writer; code and test preparation are handled together by one writer.
- TDD: strict mode enabled by project testing-capabilities record; runner `npm test`. Require observed RED, then GREEN, then REFACTOR.
- Applicable checks: focused auth-path tests, `npm test`, `npm run typecheck`, `npm run build`.
- RDD: disabled by global preference; do not start review or change the mode.
- Delivery: `ask-on-risk`; work-unit estimate is below 400 authored changed lines.

## Acceptance criteria
- Windows resolves auth path using OpenCode's `XDG_DATA_HOME`/home fallback, not `%APPDATA%`.
- Linux, macOS, explicit XDG override, and fallback paths match upstream OpenCode's use of `xdg-basedir`.
- Existing provider auth readers continue to use the shared corrected path.
- Build and typecheck are attempted; source-level failures are fixed, and environment limitations are recorded without weakening the behavior checks.

## Tasks
- [x] ODD-1: Align the shared OpenCode auth path helper with the installed OpenCode release and add platform regression tests; focused and integration tests pass.
- [x] ODD-2: Complete parent verification, record limitations, and create the required work-unit commit (`056ae6d`).

## Progress and evidence
- 2026-10-07: The authorized quota request returned HTTP 401. Corrected the investigation by checking the exact installed OpenCode 1.18.35 source: `Global.Path.data` uses `xdg-basedir` on Windows too (`XDG_DATA_HOME` or `~/.local/share`); it does not switch to `%APPDATA%`. The plugin's Windows-specific `%APPDATA%` branch is therefore the concrete cross-platform path mismatch. Linux works because the plugin's non-Windows branch already follows XDG.
- 2026-10-07: Created branch `fix/codex-quota-auth-refresh` from the clean default branch.
- 2026-10-07: An initial delegated OAuth-refresh attempt stopped before source edits. Continued inspection of the exact installed OpenCode 1.18.35 source found the real root cause: upstream uses `xdg-basedir` on all platforms, but this plugin used `%APPDATA%` on Windows. Linux already followed XDG. The expired-token diagnosis was not the root cause.
- 2026-10-07: Added Windows, XDG override, POSIX fallback/override, and empty-XDG regression tests. Observed RED before the helper change: 3 failures; POSIX fallback/override passed. After implementation, focused tests passed 4/4. The helper now uses `XDG_DATA_HOME || ~/.local/share` on every OS with platform-native separators.
- 2026-10-07: `npx tsx --test test/opencode-auth-path.test.ts test/opencode-go-usage.test.ts test/codex-quota.test.ts` passed (12/12), verified independently after writer completion.
- 2026-10-07: `npm test` returned 76 passed, 1 failed; the only failure is README verification fence parity (`test/readme-parity.test.ts`: English verification section code fence not found), unrelated to changed files. Existing assertion for the old `%APPDATA%` expectation was updated.
- 2026-10-07: `npm run typecheck` and `npm run build` both blocked by missing `koffi` module/types in the environment (`src/native-metrics.ts`, `src/windows-network.ts`).
- 2026-10-07: Independent read-only verifier found no code or test gaps. `git diff --check` passed. RDD is disabled globally; no native review was started.
- 2026-10-07: Created work-unit commit `056ae6d` (`fix(auth): match OpenCode XDG credential path`) on `fix/codex-quota-auth-refresh`.
- Next: User can update/reinstall the plugin on Windows; no push or PR was performed.
