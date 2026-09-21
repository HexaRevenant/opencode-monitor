# Design: GPU and VRAM visibility on Linux AMD

## Technical Approach

Add a read-only Linux amdgpu sysfs provider in the `native-metrics` shape (pure parser + thin fs shell with an injectable root defaulting to `/sys/class/drm`), compose it with `si.graphics()` inside the existing `cachedGraphics` reader so the 2.5s `withTimeout` bound already covers a hung sysfs read, merge normalized sysfs cards into the `selectGpuMetrics` input (its scoring = "prefer live sensors"), and expose the closed `gpuSource` union for a muted TUI note and README platform qualification. Additive behind the existing cache — rollback removes the reader and falls back to prior si-only behavior. Approaches 1+2+3 per proposal/spec; row-hiding and lspci `vram` rejected.

## Architecture Decisions

### Decision: sysfs reader shape and seam

| Option | Tradeoff | Decision |
|---|---|---|
| `readAmdSysfsGpu(root = "/sys/class/drm")` + pure `parseAmdSysfsCardFiles` | Root-injectable seam (spec risk #3); parser unit-tested without fs, mirroring `parseLinuxCpuCounters`/`parseLinuxMemoryInfo` | ✓ |
| `createLinuxGpuReader()` closure factory (proposal name) | Matches `createLinuxReader` naming, but reader is stateless — closure adds indirection without benefit | No |

### Decision: merge point

| Option | Tradeoff | Decision |
|---|---|---|
| Widen `cachedGraphics` type; composed reader runs `si.graphics()` + `readAmdSysfsGpu()` (linux) under the existing `readCachedMetric(..., 2_500)` | Single cache, one `SLOW_METRIC_CACHE_MS`, single timeout owner; hung read → cached/null at 2.5s | ✓ |
| Separate `cachedAmdGpu` cache merged after selection | Two caches and ordering hazards; timeout contract split | No |

### Decision: units at the merge boundary

| Option | Tradeoff | Decision |
|---|---|---|
| Normalize sysfs bytes → si controller shape (`memoryUsed/Total` in MiB), append to `controllers`; `selectGpuMetrics` scoring untouched | Reuses existing `hasMemory`(2)+`utilization`(1) heuristic = "prefer live sensors"; integer-MiB round-trip is exact; `gpuPercent ?? 0` idle semantics preserved | ✓ |
| Change `selectGpuMetrics` to byte units | Churns signature and existing tests (`metrics.test.ts:205-257`) | No |

### Decision: `gpuSource` attribution (closed union — spec governs, no new values)

| Option | Tradeoff | Decision |
|---|---|---|
| Priority: sysfs card live → `amd-sysfs`; si controller live on linux/win32 → `nvidia-smi`; darwin → `empty-controllers`; nothing live and probe-absent → `nvidia-smi-not-found`; else `empty-controllers` | Deterministic, testable; hybrid "both live" attribution is not spec'd (note hidden anyway); macOS never claims `nvidia-smi` | ✓ |
| Tag the winning controller's origin inside `selectGpuMetrics` | Couples selection to merge; churns scoring | No |

### Decision: `nvidia-smi` absence detection

| Option | Tradeoff | Decision |
|---|---|---|
| `isNvidiaSmiPresent(pathList = PATH.split(delim), platform)` — fixed-name `stat`/`access` probe, never executes | No subprocess (preserves read-only reader pattern); injectable; feeds `nvidia-smi-not-found` (spec scenario: absent + no provider) | ✓ |
| `command -v` / `where` subprocess | Violates the pattern; needs runner injection and timeouts | No |

### Decision: hwmon temperature selection

| Option | Tradeoff | Decision |
|---|---|---|
| Enumerate `device/hwmon/*`; prefer dir whose `name` file is `amdgpu`, else first parseable `temp1_input` (millidegrees ÷ 1000) | `k10temp` etc. co-reside; correct attribution without a bulk temperature parse | ✓ |
| First hwmon entry blindly | Risks reading CPU temp as GPU temp | No |

## Data Flow

```
si.graphics() ────────────┐
                          ├─ mergeGraphicsSources() ─▶ cachedGraphics ─▶ selectGpuMetrics() ─▶ GPU/VRAM fields
readAmdSysfsGpu() (linux) ┘        (controllers + gpuSource)    (scoring picks live-sensor      + gpuSource: GpuSourceInfo|null
isNvidiaSmiPresent() ─ only when no live controller              controller, else empty)
                                                                        │
                                        TUI: gpuSource ∈ {nvidia-smi-not-found, empty-controllers} && all-null → muted note
```

Per-card: `device/gpu_busy_percent`, `device/mem_info_vram_total|used` (bytes), hwmon temp. Missing/unreadable file → null per field; root `ENOENT` → `[]`; never throws.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/native-metrics.ts` | Modify | `AmdSysfsGpuSample`, `parseAmdSysfsCardFiles` (pure), `readAmdSysfsGpu(root?)` (readdir `card*` + file reads, all-tolerant) |
| `src/metrics.ts` | Modify | `GpuSourceInfo`, `isNvidiaSmiPresent`, `mergeGraphicsSources`, widened `cachedGraphics`, composed reader at `readMetrics` graphics branch (508), `SystemMetrics.gpuSource`, return wiring (559-577) |
| `src/tui.tsx` | Modify | `gpuSource: null` in `initialMetrics`; muted note row after VRAM block (after 167) when data absent |
| `test/metrics.test.ts` | Modify | Parser/merge/probe/hybrid-selection tests (new) |
| `test/readme-parity.test.ts` | Modify | GPU matrix parity check per locale (existing verification checks untouched) |
| `README.md` | Modify | EN 155-156/163, ES 46-47, PT 266-267 qualify matrix: NVIDIA via `nvidia-smi`; Linux AMD amdgpu sysfs; i915/Windows AMD limits; macOS unified |

## Interfaces / Contracts

```ts
export type GpuSourceInfo = "nvidia-smi" | "amd-sysfs" | "nvidia-smi-not-found" | "empty-controllers"
// Closed union — extending requires a spec change (constraint #2).

export type AmdSysfsGpuSample = {
  gpuPercent: number | null
  gpuTemperatureCelsius: number | null
  gpuMemoryUsedBytes: number | null
  gpuMemoryTotalBytes: number | null
}

export function parseAmdSysfsCardFiles(files: {
  busyPercent?: string; vramTotal?: string; vramUsed?: string
  hwmonNames?: string[]; hwmonTemps?: string[]
}): AmdSysfsGpuSample

export async function readAmdSysfsGpu(root = "/sys/class/drm"): Promise<AmdSysfsGpuSample[]>

export function isNvidiaSmiPresent(
  pathList: readonly string[] = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":"),
  platform: NodeJS.Platform = process.platform,
): boolean

export function mergeGraphicsSources(
  siGraphics: { controllers: Array<Record<string, unknown>> } | undefined,
  sysfsCards: AmdSysfsGpuSample[] | undefined,
  nvidiaSmiPresent: boolean,
  platform: NodeJS.Platform = process.platform,
): { controllers: Array<Record<string, unknown>>; gpuSource: GpuSourceInfo }
```

`SystemMetrics` gains `gpuSource: GpuSourceInfo | null` (`unavailable`/`initialMetrics` use `null`). Sysfs cards merge as `{ utilizationGpu, temperatureGpu, memoryUsed: MiB, memoryTotal: MiB }` — lspci `vram` is never read (MUST NOT), WMI untouched.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `parseAmdSysfsCardFiles`: full fixture, missing files→null, malformed numbers→null, hwmon `amdgpu` preferred over `k10temp`, vram total≤0 → percent null | Content-string fixtures (no fs), cf. `native CPU and RAM parsing` suite |
| Unit | `readAmdSysfsGpu` seam: `mkdtemp` fixture tree (busy/temp/vram), missing root → `[]`, card with only partial files | Real fs through injected root |
| Unit | `mergeGraphicsSources`: si-live→`nvidia-smi`; sysfs-live→`amd-sysfs`; none+probe-false→`nvidia-smi-not-found`; none+probe-true→`empty-controllers`; darwin never `nvidia-smi` | Injected args |
| Unit | `isNvidiaSmiPresent`: PATH hit, miss, win32 `.exe`/System32; probe never spawns | Injected path lists |
| Unit | Hybrid selection: one live of two controllers → live shown (already 205-210/252-257; extend); timeout: hung reader → cached value at bound (existing 217-227 covers contract) | Existing suite pattern |
| Parity | Each locale's Features section matches `nvidia-smi` + `amdgpu|AMD` wording; overpromise fails | New `readme-parity` case; existing blocks untouched |

## Threat Matrix

| Boundary | Applicability | Reason |
|---|---|---|
| Documentation-like paths | N/A | No markdown/executable-path handling |
| Git repository selection | N/A | No VCS interaction |
| Commit state | N/A | No commit logic |
| Push state | N/A | No push logic |
| PR commands | N/A | No PR automation |

`isNvidiaSmiPresent` is a fixed-name `stat`/`access` presence probe — never executes, never classifies arbitrary executables. RED test enforced via injected PATH (above).

## Migration / Rollout

No migration. Additive behind `cachedGraphics`; rollback removes `readAmdSysfsGpu` import + merge, restoring si-only behavior. README wording and parity check revert via git.

## Open Questions

None blocking.