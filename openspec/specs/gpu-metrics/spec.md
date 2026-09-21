# GPU Metrics Specification

## Purpose

GPU/VRAM collection is NVIDIA-only today (`si.graphics()` fills fields only from `nvidia-smi`), so AMD/Intel Linux and non-NVIDIA Windows render em-dashes. This spec governs multi-source GPU collection, absence diagnostics, controller selection, and the timeout contract.

## Requirements

### Requirement: GPU metrics collection across platform sources

The system MUST collect GPU utilization, temperature, and VRAM used/total/percent from the authoritative platform source: `systeminformation`/`nvidia-smi` on NVIDIA, amdgpu sysfs on Linux AMD. When no source yields data, the system MUST return nulls and MUST NOT throw.

#### Scenario: NVIDIA source feeds metrics

- GIVEN `si.graphics()` returns a controller with utilization, temperature, and memory
- WHEN GPU metrics are collected
- THEN utilization, temperature, and VRAM used/total/percent are populated

#### Scenario: No live source

- GIVEN no provider reports live sensors (Intel i915, Windows AMD)
- WHEN GPU metrics are collected
- THEN all GPU/VRAM fields are null without throwing

### Requirement: Linux amdgpu sysfs provider

On Linux, the system SHALL read `gpu_busy_percent`, hwmon temperature, and `mem_info_vram_total`/`mem_info_vram_used` under `/sys/class/drm/card*/device/`. The reader MUST tolerate missing or unreadable files (null per field) and MUST NOT use the lspci `vram` estimate as VRAM total.

#### Scenario: Fully populated amdgpu sysfs

- GIVEN amdgpu exposes busy, hwmon temp, and VRAM files
- WHEN the sysfs reader runs
- THEN utilization, temperature, and VRAM fields are populated

#### Scenario: Missing sysfs files

- GIVEN some amdgpu files are absent or unreadable
- WHEN the sysfs reader runs
- THEN the affected fields are null and no error escapes

#### Scenario: lspci vram is ignored

- GIVEN only the lspci `vram` estimate exists
- WHEN the sysfs reader runs
- THEN VRAM total remains null

### Requirement: Multi-GPU selection prefers live sensors

When multiple controllers exist, the system SHALL prefer the controller with live sensor data; when none qualify, selection MUST return empty values.

#### Scenario: Hybrid with one live controller

- GIVEN multiple controllers where only one exposes live sensors
- WHEN GPU metrics are selected
- THEN the live controller's values are shown

#### Scenario: No controller qualifies

- GIVEN controllers exist but none expose utilization, temperature, or memory
- WHEN GPU metrics are selected
- THEN all GPU/VRAM fields are null

### Requirement: GPU source diagnostics

The system MUST expose `gpuSource` — `nvidia-smi`, `amd-sysfs`, `nvidia-smi-not-found`, or `empty-controllers`. When data is absent, the TUI MUST render a muted source note instead of silent em-dashes.

#### Scenario: Absence reason surfaced

- GIVEN `nvidia-smi` is absent and no provider reports data
- WHEN the TUI renders GPU rows
- THEN a muted note identifies the unavailable source

### Requirement: Timeout contract

GPU collection MUST run inside `readCachedMetric`/`withTimeout` (2.5s bound); a hung sysfs read MUST NOT block the panel beyond it.

#### Scenario: Hung sysfs read

- GIVEN a sysfs read hangs
- WHEN GPU metrics are collected
- THEN the timeout fires at 2.5s and the panel renders cached or null values