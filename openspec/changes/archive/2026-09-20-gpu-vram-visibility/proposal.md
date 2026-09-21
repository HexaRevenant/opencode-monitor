# Proposal: GPU and VRAM visibility on Linux AMD

## Intent

GPU/VRAM rows render as permanent `—` on AMD/Intel Linux and non-NVIDIA Windows: `si.graphics()` only fills util/temp/memory from `nvidia-smi`, absent on this Radeon 680M. Fix the source, make absence honest, qualify docs.

## Scope

### In Scope
- Linux amdgpu sysfs provider (read-only): `gpu_busy_percent`, hwmon temp, `mem_info_vram_total/used` under `/sys/class/drm/card*/device/`; tolerates missing files.
- Merge into `selectGpuMetrics`; multi-GPU heuristic prefers controller with live sensors.
- Runs inside `readCachedMetric`/`withTimeout` (2.5s) — hung sysfs read cannot freeze the panel.
- GPU source diagnostics (`nvidia-smi-not-found | amd-sysfs | empty-controllers`) as muted TUI note.
- README EN/ES/PT platform qualification + parity checks.

### Out of Scope
- Windows AMD (WMI `AdapterRAM` total only; util/temp unavailable). Intel i915 (no busy signal).
- Row-hiding (rejected: hides degradation). lspci `vram` as source (estimate, not `memoryTotal`). macOS. Config gate.

## Capabilities

### New Capabilities
- `gpu-metrics`: GPU/VRAM collection across si/nvidia-smi, amdgpu sysfs, source diagnostics, multi-GPU selection, timeout contract.

### Modified Capabilities
- `documentation-verification-parity`: add GPU platform-matrix requirement (NVIDIA-only Linux/Windows, AMD sysfs where supported, i915/WMI limits) + parity checks; keep `test/readme-parity.test.ts` green.

## Approach

Platform-dispatched `createLinuxGpuReader` in native-metrics shape: enumerate `/sys/class/drm/card*`, read amdgpu files per controller; merge into the `graphics` branch feeding `selectGpuMetrics`; expose `gpuSource`. Approaches 1+2+3; reject 4.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/native-metrics.ts` | Modified | `createLinuxGpuReader` sysfs reader |
| `src/metrics.ts` | Modified | `selectGpuMetrics` merge + `gpuSource`; cache wiring |
| `src/tui.tsx` | Modified | Muted source note when GPU data absent |
| `test/metrics.test.ts` | Modified | Sysfs parser + merge tests |
| `README.md` + `test/readme-parity.test.ts` | Modified | Platform matrix + parity checks |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| AMD driver variability (amdgpu vs radeon) | Med | Tolerate missing files; graceful empty |
| Multi-GPU picks wrong controller | Med | Heuristic prefers live sensors |
| Docs parity drift | Med | Spec + test updated in same change |
| Silent `nvidia-smi` failure | Certain | `gpuSource` diagnostics surface it |
| Hung sysfs read | Low | Inside `readCachedMetric`/`withTimeout` |

## Rollback Plan

Remove the reader: it is additive behind the existing cache, so `selectGpuMetrics` falls back to prior si-only behavior. Diagnostics note and README wording revert independently via git.

## Dependencies

- Linux amdgpu driver exposing `gpu_busy_percent` + `mem_info_vram_*`; absent → graceful empty.

## Success Criteria

- [ ] AMD 680M shows real util/temp + VRAM used/total/percent, not `—`
- [ ] Missing sysfs files yield nulls + source note
- [ ] `npm test` + `npm run typecheck` green (parity + metrics suites)
- [ ] Panel never blocked beyond the 2.5s timeout