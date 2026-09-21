# Tasks: GPU and VRAM visibility on Linux AMD

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 370–415 (PR 1 ≈ 190–210, PR 2 ≈ 125–140, PR 3 ≈ 60–65) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

> Chain strategy note: no cached user choice exists; `auto-chain` was confirmed at session preflight, so the orchestrator proceeds with the first slice under the default `stacked-to-main` (each slice lands to main independently, in order, and reverts without unrelated rollback). The user may override to `feature-branch-chain` before `sdd-apply`; do not mix strategies afterward.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Linux amdgpu sysfs provider: `AmdSysfsGpuSample`, `parseAmdSysfsCardFiles`, `readAmdSysfsGpu` in `src/native-metrics.ts` + parser/reader tests in `test/metrics.test.ts` | PR 1 — `feat(native-metrics): add Linux amdgpu sysfs GPU reader` | `npx tsx --test test/metrics.test.ts` | `npx tsx -e "import('./src/native-metrics.js').then(async ({ readAmdSysfsGpu }) => console.log(JSON.stringify(await readAmdSysfsGpu())))"` — on this Radeon 680M box, expects one or more non-empty samples | Delete the three exports from `src/native-metrics.ts` and the added parser/reader tests; nothing consumes them yet, so app behavior is unchanged |
| 2 | `src/metrics.ts` integration: `GpuSourceInfo`, `isNvidiaSmiPresent`, `mergeGraphicsSources`, widened `cachedGraphics`, composed reader at the graphics branch, `SystemMetrics.gpuSource` + `initialMetrics` one-liner in `src/tui.tsx` + merge/probe/selection tests | PR 2 — `feat(metrics): merge amdgpu sysfs GPU data and expose gpuSource` | `npx tsx --test test/metrics.test.ts` | `npx tsx -e "import('./src/metrics.js').then(async ({ readMetrics }) => { const m = await readMetrics(); console.log(JSON.stringify({ gpuPercent: m.gpuPercent, gpuTemperatureCelsius: m.gpuTemperatureCelsius, gpuMemoryUsedBytes: m.gpuMemoryUsedBytes, gpuMemoryTotalBytes: m.gpuMemoryTotalBytes, gpuSource: m.gpuSource })) })"` — expects populated GPU fields + `"amd-sysfs"` on this AMD box | Revert `src/metrics.ts` changes (import, merge, gpuSource in `SystemMetrics`/`unavailable`/return), the `src/tui.tsx` `initialMetrics` line, and the merge/probe tests → `selectGpuMetrics` falls back to prior si-only behavior |
| 3 | `src/tui.tsx` muted source note + `README.md` platform qualification (EN 155–156/163, ES 46–47, PT 266–267) + GPU matrix parity case in `test/readme-parity.test.ts` | PR 3 — `feat(tui): show muted note when GPU source is unavailable` + `docs(readme): qualify GPU platform support matrix` | `npx tsx --test test/readme-parity.test.ts` | Manual: build with `npm run build` and open the plugin TUI; on a machine without live GPU sources expect the muted note over silent em-dashes (render-only, no automated harness — see 6.1) | Revert the `src/tui.tsx` note block, the README matrix wording (3 locales), and the parity case independently |
| — | Phases 1+2 (unit 1) | — | -- | -- | -- |

> Threat matrix: every design row is `N/A` (no markdown/executable-path, VCS, commit, push, or PR automation handling), so no threat-boundary RED task is required. The one close call — `isNvidiaSmiPresent` — is a fixed-name `stat`/`access` presence probe that never executes; its non-execution guard is enforced by RED fixtures in 3.1 (stub file with non-executable throw content reported as present without ever running).

STRICT TDD: every implementation task below is a RED (failing test) → GREEN (implementation) pair; run the focused test command after each and record the exact result in the work-unit evidence.

## Phase 1: RED — Sysfs provider tests (`test/metrics.test.ts`)

- [x] 1.1 Add failing parser tests for `parseAmdSysfsCardFiles` (import the new export from `../src/native-metrics.js`) using content-string fixtures only, mirroring the `native CPU and RAM parsing` suite:
  - full fixture `{ busyPercent: "42", vramTotal: "8589934592", vramUsed: "2147483648", hwmonNames: ["k10temp", "amdgpu"], hwmonTemps: ["45000", "61000"] }` → `{ gpuPercent: 42, gpuTemperatureCelsius: 61, gpuMemoryUsedBytes: 2147483648, gpuMemoryTotalBytes: 8589934592 }` — the `amdgpu`-named hwmon dir wins over `k10temp` even when it comes second;
  - per-field nulls: empty file bag → all null; missing `busyPercent` → `gpuPercent` null while VRAM still parses;
  - malformed/out-of-range → null: `busyPercent` `"abc"` or `"150"` (mirror `parseMacGpuUtilization` rejecting `101`), `vramTotal` `"not-a-number"`;
  - `vramTotal` ≤ 0 → memory fields null and percent null (lspci `vram` never used as total).
  Run `npx tsx --test test/metrics.test.ts` and record the expected failures (export missing).
- [x] 1.2 Add failing reader-seam tests for `readAmdSysfsGpu(root?)` using `fs.mkdtemp` fixture trees (real fs through the injected root, mirroring the design seam):
  - full card: `card0/device/gpu_busy_percent` `"42"`, `card0/device/mem_info_vram_total` `"8589934592"`, `card0/device/mem_info_vram_used` `"2147483648"`, `card0/device/hwmon/hwmon0/name` `"amdgpu"`, `card0/device/hwmon/hwmon0/temp1_input` `"61000"` → the full sample above;
  - missing root → `[]` without throwing; partial card (only `gpu_busy_percent`) → `{ 42, null, null, null }` without throwing;
  - sibling entries not matching `card*` (e.g. `controlD64`, `version`) are ignored;
  - card with no `mem_info_*` files → `gpuMemoryTotalBytes` stays null, proving the lspci `vram` estimate is never synthesized.
  Run `npx tsx --test test/metrics.test.ts` and record the expected failures.

## Phase 2: GREEN — Sysfs provider (`src/native-metrics.ts`)

- [x] 2.1 Implement and export `AmdSysfsGpuSample` and the pure `parseAmdSysfsCardFiles(files)` per the design interfaces contract: hwmon dir named `amdgpu` preferred, else first parseable `temp1_input` (millidegrees ÷ 1000); malformed or out-of-range values → null per field; `gpuMemoryPercent` null when total ≤ 0; never throws. Run `npx tsx --test test/metrics.test.ts` — 1.1 tests green.
- [x] 2.2 Implement and export `readAmdSysfsGpu(root = "/sys/class/drm")`: `readdir` with `card*` filter, per-card tolerant reads under `/sys/class/drm/card*/device/` (read-only) for `gpu_busy_percent`, hwmon enumeration (`name` + `temp1_input`), and `mem_info_vram_total|used`; root `ENOENT` → `[]`; per-file read failure → null; never throws (a hung read is tolerated here and bounded later by the existing cache timeout in Phase 4). Runs standalone and is not yet wired. Run `npx tsx --test test/metrics.test.ts` (1.2 green) + `npm run typecheck`.

## Phase 3: RED — Merge, probe, and selection tests (`test/metrics.test.ts`)

- [x] 3.1 Add failing tests for `isNvidiaSmiPresent` and `mergeGraphicsSources` (injected args only, no subprocess):
  - probe: `mkdtemp` stub `nvidia-smi` (linux) / `nvidia-smi.exe` (win32) → hit; dir without the file → miss; the stub contains non-executable throw content and is still reported present → proves the probe never spawns or executes;
  - merge attribution: si-live (no live sysfs) on linux/win32 → `"nvidia-smi"`; sysfs-live → `"amd-sysfs"`; nothing live + probe false → `"nvidia-smi-not-found"`; nothing live + probe true → `"empty-controllers"`; darwin never `"nvidia-smi"` even with a live si controller;
  - merged shape: sysfs samples append as `{ utilizationGpu, temperatureGpu, memoryUsed: MiB, memoryTotal: MiB }` to `controllers` (integer-MiB round-trip of the byte sample).
  Run `npx tsx --test test/metrics.test.ts` and record the expected failures (exports missing).
- [x] 3.2 Add failing hybrid-selection tests that run `mergeGraphicsSources` output through `selectGpuMetrics`: one live sysfs card + one dead si controller on linux → the live card's values are shown (extends the existing `metric cache and GPU fallback` suite pattern at `test/metrics.test.ts:205-210`/`252-257`); no qualifying controller → all GPU fields null. Record the expected failures.

## Phase 4: GREEN — metrics.ts integration (`src/metrics.ts`, one line in `src/tui.tsx`)

- [x] 4.1 Implement and export `GpuSourceInfo` (closed union: `"nvidia-smi" | "amd-sysfs" | "nvidia-smi-not-found" | "empty-controllers"` — no new values per spec constraint), `isNvidiaSmiPresent` (fixed-name `nvidia-smi`/`nvidia-smi.exe` presence probe via `stat`/`access` over the injected PATH split — never executes, no subprocess), and `mergeGraphicsSources` per the design priority (sysfs live → `amd-sysfs`; si live on linux/win32 → `nvidia-smi`; darwin → `empty-controllers`; none live and probe absent → `nvidia-smi-not-found`; else `empty-controllers`). Run `npx tsx --test test/metrics.test.ts` — 3.1 green — + `npm run typecheck`.
- [x] 4.2 Wire the composed reader into `readMetrics` at the graphics branch (`src/metrics.ts:508`): widen `cachedGraphics` (`src/metrics.ts:396-400`) to the composed shape; on linux run `si.graphics()` + `readAmdSysfsGpu()` together under the existing `readCachedMetric(..., 2_500)` so a hung sysfs read cannot block past the 2.5s bound (covered by the existing timeout tests at `test/metrics.test.ts:217-227`); add `gpuSource: GpuSourceInfo | null` to `SystemMetrics` (`src/metrics.ts:18-32`), `unavailable` (`235-249`), and the return wiring (`559-577`); add `gpuSource: null` to `initialMetrics` in `src/tui.tsx` (`15-29`) so typecheck stays green in this slice (this one-liner belongs to the type-widening unit, not the note unit).
  RED via runtime harness: before this task, `readMetrics()` on this AMD box shows null GPU fields; after, the harness shows populated GPU/VRAM values and `gpuSource: "amd-sysfs"`. Run `npx tsx --test test/metrics.test.ts` (3.2 green) + `npm run typecheck`.

## Phase 5: Documentation parity — RED then GREEN (`test/readme-parity.test.ts`, `README.md`)

- [ ] 5.1 RED: add a GPU platform-matrix parity case to `test/readme-parity.test.ts` (read-only reads of `README.md`; every existing verification check stays untouched): for each locale, extract the Features section (`### Features` / `### Características` / `### Funcionalidades`) and assert it matches `nvidia-smi` and `amdgpu|AMD` matrix wording; a synthetic overpromise (GPU data claimed on an unsupported platform, e.g. Windows AMD utilization) fails the check and identifies the affected section. Run `npx tsx --test test/readme-parity.test.ts` and record the expected failure against the current unqualified README.
- [ ] 5.2 GREEN: qualify `README.md` per the platform matrix — EN GPU bullets (`155-156`) and platform-support line (`163`), ES (`46-47`), PT (`266-267`): NVIDIA on Linux/Windows via `nvidia-smi`; Linux AMD via amdgpu sysfs where supported; Intel i915 and Windows AMD note their limits (no busy signal; WMI `AdapterRAM` total only); macOS unified RAM. Keep every existing localized bullet intact. Run `npx tsx --test test/readme-parity.test.ts` (5.1 green) + `npm test`.

## Phase 6: TUI note and final verification

- [ ] 6.1 Add a muted source note in `src/tui.tsx` after the VRAM block (after `167`): when `gpuSource` ∈ `{ "nvidia-smi-not-found", "empty-controllers" }` and all GPU/VRAM fields are null, render a muted note naming the unavailable source instead of silent em-dashes (spec scenario "Absence reason surfaced"). No automated RED is possible: TUI rendering has no unit harness within the change's allowed test files, so verification is `npm run typecheck` + `npm run build` + a manual TUI run (runtime harness N/A with this reason).
- [ ] 6.2 Final verification: `npm test` (baseline 52/6 plus the ≈20 new tests all green), `npm run typecheck`, `npm run build`; confirm `gpuSource` only ever carries one of the four closed-union values and that no lspci `vram` read, WMI change, or new `GpuSourceInfo` value was introduced.