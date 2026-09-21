# Exploration: GPU and VRAM metrics not visible in the TUI

Change: `gpu-vram-visibility` · Phase: explore · Date: 2026-09-07

## Current State

GPU/VRAM support exists end-to-end but is **fully dependent on one data source**: `systeminformation`'s `graphics()` module, which only populates utilization/temperature/memory fields when it can merge `nvidia-smi` output into the controllers it lists.

Collection chain:

1. `src/metrics.ts:508` — `readCachedMetric(cachedGraphics, () => si.graphics(), SLOW_METRIC_CACHE_MS, ...)` with a 2.5 s timeout and 10 s cache.
2. `src/metrics.ts:524` — `selectGpuMetrics(graphics.status === "fulfilled" ? graphics.value : undefined)`.
3. `src/metrics.ts:299-347` — `selectGpuMetrics` filters controllers that have no utilization, no temperature, and no memory fields; picks the best-scoring controller (`hasMemory` = 2 points, `utilization` = 1 point); returns `empty` (all `null`) when nothing qualifies. Memory fields are read from `memoryTotal`/`memoryFree`/`memoryUsed` **in MB**, converted to bytes at `metrics.ts:342-344` (`* 1024 ** 2`).
4. Render: `src/tui.tsx:154-158` — the GPU row (utilization + temperature) is **always rendered**; when values are `null`, `formatPercent`/`formatTemperature` emit `—` / `—°C` (`src/format.ts:3-9`). `src/tui.tsx:159-167` — the VRAM row renders when `gpuMemoryIsUnified !== true` (true on Linux/Windows), showing `— / — (—%)` via `formatGiB` when null.
5. `gpuMemoryIsUnified` is `true` only on Apple Silicon (`src/metrics.ts:574`), where VRAM fields are deliberately nulled (`528-534`) and the row label switches to RAM (`tui.tsx:117-129`, `gpuMemoryLabel` at `metrics.ts:133-141`).

So "not visible" is not a missing row — it is a **permanent em-dash state**: the rows are rendered but every value is `null`.

### Why the fields are null on this machine (empirical)

- The dev/user machine is **AMD Radeon 680M (Rembrandt APU), x86_64, no `nvidia-smi`** (verified: `command -v nvidia-smi` fails; `lspci` shows only the AMD VGA controller).
- Installed `systeminformation@5.33.8` `lib/graphics.js`:
  - `getNvidiaSmi()` returns `'nvidia-smi'` on Linux (`graphics.js:473-475`) and searches `System32\nvidia-smi.exe` / `DriverStore\FileRepository` on Windows (`440-476`).
  - `nvidiaSmi()` swallows failures (`try { execFileSync ... } catch { util.noop() }` at `486-490`) and returns `""` — **no error surfaces**.
  - Controllers get `utilizationGpu`, `temperatureGpu`, `memoryTotal`, `memoryFree`, `memoryUsed` only via `mergeControllerNvidia` (`540-568`).
  - No AMD/Intel sensor support: no `amdgpu`, `drm`, `gpu_busy_percent`, or `/sys/class` references exist in this version.
- Direct probe (`si.graphics()` on this machine): returns exactly one controller with only `{ vendor: "Advanced Micro Devices, Inc. [AMD/ATI]", model: "Rembrandt [Radeon 680M]", bus: "Onboard", vram: 256 }`. No utilization, temperature, or memory fields → `selectGpuMetrics` filters it out → `empty` → all GPU/VRAM values null.

### Platform coverage matrix

| Platform / GPU | Utilization | Temp | VRAM | TUI result |
|---|---|---|---|---|
| Linux + NVIDIA + `nvidia-smi` on PATH | ✅ | ✅ | ✅ | Works |
| Windows + NVIDIA (DriverStore) | ✅ | ✅ | ✅ | Works |
| Linux + AMD/Intel | ❌ | ❌ | ❌ | `—` rows |
| Windows + AMD/Intel | ❌ | ❌ | ❌ (WMI `AdapterRAM` maps to `vram`, not `memoryTotal`) | `—` rows |
| macOS Apple Silicon | ✅ (project `ioreg` reader) | ✅ (Stats helper) | By design: unified RAM row | Works |
| macOS Intel (NVIDIA dGPU) | ✅ (`ioreg` util + si fallback) | optional | via si | Works |

### Config surface

- **No GPU/VRAM config gate exists.** The only plugin option is `enabled` (`.opencode/tui.json` has `"enabled": true`; `src/tui.tsx:180` early-returns only when `options?.enabled === false`). No flags, thresholds, or units are configurable. The only related env var is `OPENCODE_MONITOR_NERD_FONT` (icons, `src/font.ts:28,70`).
- Docs: README (EN `155-156`, ES `46-47`, PT `266-267`) claims "GPU: utilization and temperature" / "GPU VRAM: used memory, total memory, and percentage" with only the generic caveat "when the operating system exposes the metrics" (`README.md:163`) and macOS notes (`55`, `166`). It never states the NVIDIA-only reality on Linux/Windows. The `documentation-verification-parity` spec does not cover GPU claims.
- Gates: `npm test` 52/52 pass; `npm run typecheck` clean. `selectGpuMetrics` is unit-tested (`test/metrics.test.ts:205-257`, including the "idle GPU" and "safe empty" cases); `readMetrics` itself has no tests.

## Affected Areas

- `src/metrics.ts` — GPU collection (`cachedGraphics`/`si.graphics()` at 396-400, 508; `selectGpuMetrics` 299-347; `gpuMemoryIsUnified` 574; Apple Silicon nulling 528-534). The fix lives here.
- `src/tui.tsx` — GPU row 154-158 and VRAM row 159-167 always/conditionally render dashes; diagnostics surfacing would be added here.
- `src/native-metrics.ts` — pattern reference: native read-only readers with platform dispatch (`createLinuxReader` etc.); a sysfs GPU reader would follow this shape.
- `test/metrics.test.ts` — `selectGpuMetrics` cases may need extension for a merged AMD/NVIDIA source; a new sysfs-parser would be unit-tested here.
- `README.md` (ES/EN/PT) — feature claims overpromise on AMD/Intel; parity tests (`test/readme-parity.test.ts`) must stay green if wording changes.

## Approaches

1. **Linux sysfs GPU provider (AMD-first)** — add a native GPU reader reading `/sys/class/drm/card*/device/gpu_busy_percent` (amdgpu), hwmon temperature, and `mem_info_vram_total`/`mem_info_vram_used`; merge results into `selectGpuMetrics` input.
   - Pros: real fix on this machine; read-only, no subprocesses; extends the existing native-reader pattern; deterministic.
   - Cons: Linux-only (Windows AMD stays broken); Intel i915 has no `gpu_busy_percent` equivalent (busy needs `perf`/`gt_cur_freq` — weaker, defer or exclude); multi-GPU selection heuristic may need rework.
   - Effort: Medium.

2. **Surface collection diagnostics + honest rendering** — have `readMetrics` expose why GPU data is absent (e.g. `gpuSource: "nvidia-smi-not-found" | "amd-sysfs" | "empty-controllers"`) and render a muted "GPU source unavailable" note instead of silent dashes.
   - Pros: honest UX; small scope; helps every platform; pairs with any provider work.
   - Cons: does not restore the metrics themselves.
   - Effort: Low.

3. **Docs parity fix** — qualify README GPU/VRAM claims with the platform/source matrix and add a spec requirement; extend `readme-parity` checks.
   - Pros: stops overpromising; testable; spec-governed repo convention.
   - Cons: documentation only; user still sees dashes.
   - Effort: Low.

4. **Hide empty GPU/VRAM rows** — change the render conditions so rows vanish when data is null.
   - Cons: makes the complaint literal (rows truly "not visible"); hides degradation. Not recommended.

## Recommendation

Approach 1 (Linux AMD sysfs provider, structured so Windows/Intel can follow later) as the core fix, plus Approach 2 (diagnostics surfacing) so every platform reports *why* GPU data is absent. Approach 3 (docs qualification) is cheap and matches the repo's documentation-parity convention — include it in the same change or as an immediate follow-up. Reject Approach 4.

Note for design: the lspci-derived `vram: 256` must NOT be used as a VRAM source — it is a wrong-size estimate and is not `memoryTotal`.

## Risks

- **AMD driver variability**: sysfs paths differ between `amdgpu` and legacy `radeon`; `gpu_busy_percent` and `mem_info_vram_*` exist only on `amdgpu`. The reader must tolerate missing files and unknown sizes.
- **Intel iGPU**: no equivalent busy signal — Intel Linux may remain unavailable; scope must say so explicitly rather than promising full coverage.
- **Windows AMD**: no sysfs; WMI exposes only `AdapterRAM` (total). Utilization/temperature on Windows AMD may stay unavailable — set expectations per platform.
- **Multi-GPU hybrids**: AMD + NVIDIA laptops — the controller selection heuristic may pick the wrong source; the merge should prefer the controller with live sensor data.
- **Cache/timeout contract**: the new reader must run inside the existing `readCachedMetric`/`withTimeout` contract (`metrics.ts:263-382`) so a hung sysfs read cannot freeze the panel.
- **Docs parity tests**: any README wording change must keep `readme-parity.test.ts` and the `documentation-verification-parity` spec in sync.
- **Feedback loop**: no error currently escapes `si.graphics()` (`nvidiaSmi` swallows exceptions) — today's failure mode is silent by design; Approach 2 is the mitigation.

## Ready for Proposal

Yes. The orchestrator should tell the user: the plugin collects GPU/VRAM **only from NVIDIA's `nvidia-smi`** (via `systeminformation`); on this AMD Radeon 680M machine there is no sensor source at all, so the rows render as permanent em-dashes. Recommended proposal: Linux AMD sysfs provider + GPU-source diagnostics + README platform qualification.