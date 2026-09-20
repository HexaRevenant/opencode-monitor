import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_METRIC_TIMEOUT_MS,
  detectMacHardwareArchitecture,
  gpuMemoryLabel,
  isNvidiaSmiPresent,
  mergeGraphicsSources,
  parseMacGpuUtilization,
  parseMacStatsTemperature,
  parseMonitorTemperature,
  parseWindowsNetworkOutput,
  readCachedMetric,
  readWindowsNetworkFallback,
  readMacMetrics,
  selectGpuMetrics,
  WINDOWS_MEMORY_TIMEOUT_MS,
  WINDOWS_NETWORK_OUTER_TIMEOUT_MS,
  WINDOWS_NETWORK_PROCESS_TIMEOUT_MS,
  withTimeout,
  type CachedMetric,
  type GpuSourceInfo,
} from "../src/metrics.js"
import { decodeNativeIfRow, isWindowsNetworkReaderAvailable, mapWindowsNetworkRows, networkRate, readWithFallback } from "../src/windows-network.js"
import { cpuPercentFromCounters, isNativeReaderAvailable, mapMemoryBytes, parseAmdSysfsCardFiles, parseLinuxCpuCounters, parseLinuxMemoryInfo, readAmdSysfsGpu } from "../src/native-metrics.js"
import { parseWindowsMetricsResponse, serializeWindowsMetricsResponse } from "../src/windows-metrics-helper.js"

describe("native CPU and RAM parsing", () => {
  it("only enables the native reader for supported Node runtimes", () => {
    assert.equal(isNativeReaderAvailable("darwin", undefined), true)
    assert.equal(isNativeReaderAvailable("win32", undefined), true)
    assert.equal(isNativeReaderAvailable("linux", undefined), true)
    assert.equal(isNativeReaderAvailable("darwin", "1.3.14"), false)
    assert.equal(isNativeReaderAvailable("linux", "1.3.14"), false)
    assert.equal(isNativeReaderAvailable("freebsd", undefined), false)
  })

  it("parses Linux counters and preserves first-sample behavior", () => {
    const first = parseLinuxCpuCounters("cpu  10 2 3 80 5 0 0 0 0 0\ncpu0 1 0 0 8")!
    const second = parseLinuxCpuCounters("cpu  15 2 8 90 5 0 0 0 0 0")!
    assert.equal(cpuPercentFromCounters(first, undefined), undefined)
    assert.equal(cpuPercentFromCounters(second, first), 50)
    assert.equal(cpuPercentFromCounters(first, second), undefined)
  })

  it("maps Linux memory and rejects malformed input", () => {
    assert.deepEqual(parseLinuxMemoryInfo("MemTotal:       1000 kB\nMemAvailable:    250 kB"), { totalBytes: 1024000, availableBytes: 256000 })
    assert.deepEqual(parseLinuxMemoryInfo("MemTotal: 1000 kB\nMemFree: 100 kB\nBuffers: 50 kB\nCached: 25 kB"), { totalBytes: 1024000, availableBytes: 179200 })
    assert.equal(parseLinuxMemoryInfo("MemTotal: malformed"), undefined)
    assert.equal(mapMemoryBytes(Number.MAX_SAFE_INTEGER + 1, 0), undefined)
  })
})

describe("AMD sysfs GPU parsing", () => {
  it("parses a full card and prefers the amdgpu hwmon dir even when it comes second", () => {
    assert.deepEqual(parseAmdSysfsCardFiles({
      busyPercent: "42",
      vramTotal: "8589934592",
      vramUsed: "2147483648",
      hwmonNames: ["k10temp", "amdgpu"],
      hwmonTemps: ["45000", "61000"],
    }), {
      gpuPercent: 42,
      gpuTemperatureCelsius: 61,
      gpuMemoryUsedBytes: 2147483648,
      gpuMemoryTotalBytes: 8589934592,
    })
  })

  it("nulls each field independently for empty or partial bags", () => {
    assert.deepEqual(parseAmdSysfsCardFiles({}), {
      gpuPercent: null,
      gpuTemperatureCelsius: null,
      gpuMemoryUsedBytes: null,
      gpuMemoryTotalBytes: null,
    })
    assert.deepEqual(parseAmdSysfsCardFiles({
      busyPercent: "42",
      hwmonNames: ["amdgpu"],
      hwmonTemps: ["61000"],
    }), {
      gpuPercent: 42,
      gpuTemperatureCelsius: 61,
      gpuMemoryUsedBytes: null,
      gpuMemoryTotalBytes: null,
    })
  })

  it("rejects malformed or out-of-range values per field", () => {
    assert.equal(parseAmdSysfsCardFiles({ busyPercent: "abc" }).gpuPercent, null)
    assert.equal(parseAmdSysfsCardFiles({ busyPercent: "150" }).gpuPercent, null)
    assert.equal(parseAmdSysfsCardFiles({ vramTotal: "not-a-number" }).gpuMemoryTotalBytes, null)
  })

  it("keeps memory null when the total is missing and percent null when total is non-positive", () => {
    assert.equal(parseAmdSysfsCardFiles({ busyPercent: "42" }).gpuMemoryTotalBytes, null)
    assert.deepEqual(parseAmdSysfsCardFiles({ busyPercent: "42", vramTotal: "0" }), {
      gpuPercent: null,
      gpuTemperatureCelsius: null,
      gpuMemoryUsedBytes: null,
      gpuMemoryTotalBytes: null,
    })
  })
})

describe("AMD sysfs GPU reader", () => {
  async function makeCardTree(entries: Array<[string, string]>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "amd-sysfs-"))
    for (const [relative, content] of entries) {
      const fullPath = join(root, relative)
      await mkdir(join(fullPath, ".."), { recursive: true })
      await writeFile(fullPath, content)
    }
    return root
  }

  it("reads a full card through the injected root", async () => {
    const root = await makeCardTree([
      ["card0/device/gpu_busy_percent", "42"],
      ["card0/device/mem_info_vram_total", "8589934592"],
      ["card0/device/mem_info_vram_used", "2147483648"],
      ["card0/device/hwmon/hwmon0/name", "amdgpu"],
      ["card0/device/hwmon/hwmon0/temp1_input", "61000"],
    ])
    try {
      assert.deepEqual(await readAmdSysfsGpu(root), [{
        gpuPercent: 42,
        gpuTemperatureCelsius: 61,
        gpuMemoryUsedBytes: 2147483648,
        gpuMemoryTotalBytes: 8589934592,
      }])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("returns an empty list for a missing root without throwing", async () => {
    assert.deepEqual(await readAmdSysfsGpu(join(tmpdir(), "amd-sysfs-missing")), [])
  })

  it("tolerates a partial card with only utilization", async () => {
    const root = await makeCardTree([["card0/device/gpu_busy_percent", "42"]])
    try {
      assert.deepEqual(await readAmdSysfsGpu(root), [{
        gpuPercent: 42,
        gpuTemperatureCelsius: null,
        gpuMemoryUsedBytes: null,
        gpuMemoryTotalBytes: null,
      }])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("ignores sibling entries that do not match card*", async () => {
    const root = await makeCardTree([
      ["controlD64", "x"],
      ["version", "drm 2"],
      ["card0/device/gpu_busy_percent", "42"],
    ])
    try {
      assert.deepEqual(await readAmdSysfsGpu(root), [{
        gpuPercent: 42,
        gpuTemperatureCelsius: null,
        gpuMemoryUsedBytes: null,
        gpuMemoryTotalBytes: null,
      }])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("never synthesizes a vram total from lspci when mem_info files are absent", async () => {
    const root = await makeCardTree([
      ["card0/device/gpu_busy_percent", "42"],
      ["card0/device/hwmon/hwmon0/name", "amdgpu"],
      ["card0/device/hwmon/hwmon0/temp1_input", "45000"],
    ])
    try {
      assert.deepEqual(await readAmdSysfsGpu(root), [{
        gpuPercent: 42,
        gpuTemperatureCelsius: 45,
        gpuMemoryUsedBytes: null,
        gpuMemoryTotalBytes: null,
      }])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("GPU source probe and merge", () => {
  it("reports nvidia-smi present when the fixed-name file exists and never executes it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gpu-probe-"))
    try {
      // The stub is non-executable and would throw if spawned: only a
      // stat/access presence probe can report it present without running it.
      await writeFile(join(dir, "nvidia-smi"), "throw new Error('probe must never execute')", { mode: 0o600 })
      assert.equal(isNvidiaSmiPresent([dir], "linux"), true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("misses absent files and checks the .exe fixed name on win32", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gpu-probe-"))
    const empty = await mkdtemp(join(tmpdir(), "gpu-probe-"))
    try {
      assert.equal(isNvidiaSmiPresent([empty], "linux"), false)
      assert.equal(isNvidiaSmiPresent([empty], "win32"), false)
      await writeFile(join(dir, "nvidia-smi"), "throw new Error('probe must never execute')", { mode: 0o600 })
      assert.equal(isNvidiaSmiPresent([dir], "linux"), true)
      assert.equal(isNvidiaSmiPresent([dir], "win32"), false)
      await writeFile(join(dir, "nvidia-smi.exe"), "throw new Error('probe must never execute')", { mode: 0o600 })
      assert.equal(isNvidiaSmiPresent([dir], "win32"), true)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(empty, { recursive: true, force: true })
    }
  })

  it("attributes a live si controller to nvidia-smi on linux and win32", () => {
    const si = { controllers: [{ utilizationGpu: 50, temperatureGpu: 60, memoryUsed: 1024, memoryTotal: 2048 }] }
    assert.equal(mergeGraphicsSources(si, [], true, "linux").gpuSource, "nvidia-smi")
    assert.equal(mergeGraphicsSources(si, [], true, "win32").gpuSource, "nvidia-smi")
  })

  it("attributes a live sysfs card to amd-sysfs even when the probe misses", () => {
    const sysfs = [{
      gpuPercent: 42,
      gpuTemperatureCelsius: 61,
      gpuMemoryUsedBytes: 2147483648,
      gpuMemoryTotalBytes: 8589934592,
    }]
    assert.equal(mergeGraphicsSources({ controllers: [] }, sysfs, false, "linux").gpuSource, "amd-sysfs")
  })

  it("reports nvidia-smi-not-found when nothing is live and the probe misses", () => {
    assert.equal(mergeGraphicsSources({ controllers: [] }, [], false, "linux").gpuSource, "nvidia-smi-not-found")
  })

  it("reports empty-controllers when nothing is live but nvidia-smi exists", () => {
    assert.equal(mergeGraphicsSources({ controllers: [] }, [], true, "linux").gpuSource, "empty-controllers")
  })

  it("never claims nvidia-smi on darwin even with a live si controller", () => {
    const si = { controllers: [{ utilizationGpu: 50, temperatureGpu: 60, memoryUsed: 1024, memoryTotal: 2048 }] }
    assert.equal(mergeGraphicsSources(si, [], true, "darwin").gpuSource, "empty-controllers")
  })

  it("appends sysfs cards as integer-MiB controllers after the si ones", () => {
    const merged = mergeGraphicsSources(
      { controllers: [{ utilizationGpu: 10, temperatureGpu: 30, memoryUsed: 100, memoryTotal: 200 }] },
      [{
        gpuPercent: 42,
        gpuTemperatureCelsius: 61,
        gpuMemoryUsedBytes: 2147483648,
        gpuMemoryTotalBytes: 8589934592,
      }],
      true,
      "linux",
    )
    assert.deepEqual(merged.controllers, [
      { utilizationGpu: 10, temperatureGpu: 30, memoryUsed: 100, memoryTotal: 200 },
      { utilizationGpu: 42, temperatureGpu: 61, memoryUsed: 2048, memoryTotal: 8192 },
    ])
  })
})

describe("Windows metric parsing", () => {
  it("serializes and parses bigint helper responses as decimal strings", () => {
    const line = serializeWindowsMetricsResponse({ rx: 2n ** 54n, tx: 9n })
    assert.equal(line, '{"ok":true,"rx":"18014398509481984","tx":"9"}')
    assert.deepEqual(parseWindowsMetricsResponse(line), { rx: 2n ** 54n, tx: 9n })
    assert.throws(() => parseWindowsMetricsResponse('{"ok":false,"error":"unavailable"}'), /unavailable/)
  })

  it("disables the native network reader under Bun", () => {
    assert.equal(isWindowsNetworkReaderAvailable(undefined), true)
    assert.equal(isWindowsNetworkReaderAvailable("1.3.14"), false)
  })

  it("decodes only primitive MIB_IF_ROW2 fields", () => {
    const offsets = new Map([
      ["InterfaceAndOperStatusFlags", 10], ["OperStatus", 20], ["Type", 30],
      ["AccessType", 40], ["InOctets", 50], ["OutOctets", 60],
    ])
    const values = new Map<number, bigint | number>([[110, 1], [120, 1], [130, 6], [140, 2], [150, 2n ** 54n], [160, 9n]])
    const calls: string[] = []
    const fakeKoffi = {
      offsetof: (_row: unknown, field: string) => offsets.get(field)!,
      decode: (_table: unknown, address: number, type: string) => {
        calls.push(type)
        return values.get(address)
      },
    } as any

    assert.deepEqual(decodeNativeIfRow(fakeKoffi, "MIB_IF_ROW2" as any, "table", 100), {
      InterfaceAndOperStatusFlags: 1, OperStatus: 1, Type: 6, AccessType: 2,
      InOctets: 2n ** 54n, OutOctets: 9n,
    })
    assert.deepEqual(calls, ["uint8", "uint32", "uint32", "uint32", "uint64", "uint64"])
  })

  it("keeps Windows operation timeouts bounded and ordered", () => {
    assert.equal(DEFAULT_METRIC_TIMEOUT_MS, 1_500)
    assert.equal(WINDOWS_MEMORY_TIMEOUT_MS, 5_000)
    assert.equal(WINDOWS_NETWORK_PROCESS_TIMEOUT_MS, 4_000)
    assert.equal(WINDOWS_NETWORK_OUTER_TIMEOUT_MS, 4_500)
    assert.ok(WINDOWS_NETWORK_OUTER_TIMEOUT_MS >= WINDOWS_NETWORK_PROCESS_TIMEOUT_MS)
  })

  it("parses PowerShell JSON in both object and array forms", () => {
    assert.deepEqual(parseWindowsNetworkOutput('{"Name":"Ethernet","ReceivedBytes":100,"SentBytes":50}'), [{ iface: "Ethernet", rx_bytes: 100, tx_bytes: 50 }])
    assert.equal(parseWindowsNetworkOutput('[{"Name":"Wi-Fi","ReceivedBytes":200,"SentBytes":75}]')[0].rx_bytes, 200)
    assert.deepEqual(parseWindowsNetworkOutput("not-json"), [])
    assert.deepEqual(parseWindowsNetworkOutput("null"), [])
  })

  it("uses the injectable PowerShell fallback contract under Bun", async () => {
    const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = []
    const samples = await readWindowsNetworkFallback(async (command, args, timeoutMs) => {
      calls.push({ command, args, timeoutMs })
      return '[{"Name":"Ethernet","ReceivedBytes":1000,"SentBytes":250}]'
    })
    assert.deepEqual(samples, [{ iface: "Ethernet", rx_bytes: 1000, tx_bytes: 250 }])
    assert.deepEqual(calls, [{
      command: "powershell.exe",
      args: [
        "-NoProfile", "-NonInteractive", "-Command",
        "Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress",
      ],
      timeoutMs: WINDOWS_NETWORK_PROCESS_TIMEOUT_MS,
    }])
  })

  it("parses LibreHardwareMonitor temperatures", () => assert.equal(parseMonitorTemperature("51,5 °C"), 51.5))

  it("maps only active hardware interfaces and aggregates bigint counters", () => {
    assert.deepEqual(mapWindowsNetworkRows([
      { InterfaceAndOperStatusFlags: 1, OperStatus: 1, AccessType: 2, Type: 6, InOctets: 2n ** 54n, OutOctets: 9n },
      { InterfaceAndOperStatusFlags: 0, OperStatus: 1, AccessType: 2, Type: 6, InOctets: 100n, OutOctets: 100n },
      { InterfaceAndOperStatusFlags: 3, OperStatus: 1, AccessType: 2, Type: 6, InOctets: 5n, OutOctets: 5n },
      { InterfaceAndOperStatusFlags: 1, OperStatus: 1, AccessType: 1, Type: 24, InOctets: 7n, OutOctets: 7n },
    ]), { rx: 2n ** 54n, tx: 9n })
  })

  it("handles counter resets without negative rates", () => {
    assert.deepEqual(networkRate({ rx: 10n, tx: 20n }, { rx: 100n, tx: 200n }, 2_000), { rx: 0, tx: 0 })
  })

  it("uses the bounded fallback only when the native reader fails", async () => {
    const fallback = await readWithFallback(async () => { throw new Error("unavailable") }, async () => 42)
    assert.deepEqual(fallback, { value: 42, usedFallback: true })
    assert.deepEqual(await readWithFallback(async () => 7, async () => 42), { value: 7, usedFallback: false })
    await assert.rejects(readWithFallback(async () => { throw new Error("native") }, async () => { throw new Error("fallback") }), /fallback/)
  })
})

describe("macOS metric parsing", () => {
  it("detects native Apple Silicon from sysctl", async () => {
    assert.equal(await detectMacHardwareArchitecture(async () => "1", "arm64"), "arm64")
  })

  it("detects Apple Silicon when an M4 process runs as x64 under Rosetta", async () => {
    assert.equal(await detectMacHardwareArchitecture(async () => "1", "x64"), "arm64")
  })

  it("detects Intel x86_64 from sysctl", async () => {
    assert.equal(await detectMacHardwareArchitecture(async () => "0", "x64"), "x86_64")
  })

  it("uses a conservative fallback when sysctl is missing or fails", async () => {
    assert.equal(await detectMacHardwareArchitecture(async () => { throw new Error("not found") }, "arm64"), "arm64")
    assert.equal(await detectMacHardwareArchitecture(async () => { throw new Error("not found") }, "x64"), "x86_64")
  })

  it("labels Apple Silicon unified memory as RAM", () => {
    assert.equal(gpuMemoryLabel("arm64", "darwin"), "RAM")
    assert.equal(gpuMemoryLabel("x86_64", "darwin"), "GPU VRAM")
    assert.equal(gpuMemoryLabel(undefined, "darwin"), "Memory")
  })

  it("parses IOAccelerator utilization and rejects malformed values", () => {
    assert.equal(parseMacGpuUtilization('"Device Utilization %"=42.5'), 42.5)
    assert.equal(parseMacGpuUtilization('"Device Utilization %"=101'), undefined)
    assert.equal(parseMacGpuUtilization(""), undefined)
  })

  it("selects the hottest CPU or GPU Stats sensor", () => {
    const output = "[Tp01] 44.5 °C\n[Tp99] 61.0 °C\n[Tg0] 55.0 °C\n[Tg1] malformed"
    assert.equal(parseMacStatsTemperature(output, "Tp"), 61)
    assert.equal(parseMacStatsTemperature(output, "Tg"), 55)
    assert.equal(parseMacStatsTemperature("unexpected output", "Tp"), undefined)
  })

  it("keeps subprocess execution injectable and tolerates missing helpers", async () => {
    const calls: string[] = []
    const metrics = await readMacMetrics(async (command) => {
      calls.push(command)
      if (command === "ioreg") return '"Device Utilization %"=73'
      return "[Tp01] 48 °C\n[Tg01] 58 °C"
    })
    assert.deepEqual(metrics, { gpuPercent: 73, cpuTemperatureCelsius: 48, gpuTemperatureCelsius: 58 })
    assert.deepEqual(calls.sort(), ["/Applications/Stats.app/Contents/Resources/smc", "ioreg"])

    assert.deepEqual(await readMacMetrics(async () => { throw new Error("helper unavailable") }), {
      gpuPercent: null, cpuTemperatureCelsius: null, gpuTemperatureCelsius: null,
    })
  })
})

describe("metric cache and GPU fallback", () => {
  it("deduplicates reads and expires cached values", async () => {
    const state: CachedMetric<number> = { value: undefined, lastAttemptAt: 0, inFlight: undefined }
    let reads = 0
    const reader = async () => { reads += 1; return reads }
    assert.equal(await readCachedMetric(state, reader, 1000, 2_000), 1)
    assert.equal(await readCachedMetric(state, reader, 1000, 2_500), 1)
    assert.equal(await readCachedMetric(state, reader, 1000, 3_200), 2)
    assert.equal(reads, 2)
  })

  it("shows idle GPU when utilization is missing and computes VRAM", () => {
    assert.deepEqual(selectGpuMetrics({ controllers: [{ temperatureGpu: 60, memoryUsed: 1024, memoryTotal: 2048 }] }), {
      gpuPercent: 0, gpuTemperatureCelsius: 60, gpuMemoryUsedBytes: 1024 * 1024 ** 2,
      gpuMemoryTotalBytes: 2048 * 1024 ** 2, gpuMemoryPercent: 50,
    })
  })

  it("returns the previous value after a timed-out reader failure", async () => {
    const state: CachedMetric<number> = { value: 7, lastAttemptAt: 0, inFlight: undefined }
    assert.equal(await readCachedMetric(state, async () => { throw new Error("timeout") }, 0, 1), 7)
  })

  it("abandons a timed-out cache attempt and protects newer values", async () => {
    const state: CachedMetric<number> = { value: 7, lastAttemptAt: 0, inFlight: undefined }
    let resolveSlow: ((value: number) => void) | undefined
    const slow = new Promise<number>((resolve) => { resolveSlow = resolve })
    assert.equal(await readCachedMetric(state, () => slow, 0, 1, 0, 5), 7)

    assert.equal(await readCachedMetric(state, async () => 9, 0, 2, 0, 50), 9)
    resolveSlow!(100)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(state.value, 9)
  })

  it("deduplicates a failed read and backs off before retrying", async () => {
    const state: CachedMetric<number> = { value: undefined, lastAttemptAt: 0, inFlight: undefined }
    let reads = 0
    const reader = async () => {
      reads += 1
      throw new Error("unavailable")
    }

    const first = readCachedMetric(state, reader, 1000, 2_000)
    const second = readCachedMetric(state, reader, 1000, 2_000)
    assert.equal(await first, undefined)
    assert.equal(await second, undefined)
    assert.equal(reads, 1)
    assert.equal(await readCachedMetric(state, reader, 1000, 3_001, 10_000), undefined)
    assert.equal(reads, 1)
    assert.equal(await readCachedMetric(state, reader, 1000, 12_001, 10_000), undefined)
    assert.equal(reads, 2)
  })

  it("rejects a slow sensor without waiting for it", async () => {
    await assert.rejects(withTimeout(new Promise<number>((resolve) => setTimeout(() => resolve(1), 50)), 5), /metric timeout/)
  })

  it("returns safe empty GPU data for an unexpected structure", () => {
    assert.deepEqual(selectGpuMetrics({ controllers: undefined as never }), {
      gpuPercent: null, gpuTemperatureCelsius: null, gpuMemoryUsedBytes: null,
      gpuMemoryTotalBytes: null, gpuMemoryPercent: null,
    })
  })

  it("shows the live sysfs card when a dead si controller is the only si input on linux", () => {
    const merged = mergeGraphicsSources(
      { controllers: [{ utilizationGpu: null, temperatureGpu: null, memoryUsed: null, memoryTotal: null }] },
      [{
        gpuPercent: 42,
        gpuTemperatureCelsius: 61,
        gpuMemoryUsedBytes: 2147483648,
        gpuMemoryTotalBytes: 8589934592,
      }],
      true,
      "linux",
    )
    assert.equal(merged.gpuSource, "amd-sysfs")
    assert.deepEqual(selectGpuMetrics(merged), {
      gpuPercent: 42,
      gpuTemperatureCelsius: 61,
      gpuMemoryUsedBytes: 2147483648,
      gpuMemoryTotalBytes: 8589934592,
      gpuMemoryPercent: 25,
    })
  })

  it("returns all-null GPU fields when no merged controller qualifies", () => {
    const merged = mergeGraphicsSources({ controllers: [] }, [], false, "linux")
    assert.equal(merged.gpuSource, "nvidia-smi-not-found")
    assert.deepEqual(selectGpuMetrics(merged), {
      gpuPercent: null, gpuTemperatureCelsius: null, gpuMemoryUsedBytes: null,
      gpuMemoryTotalBytes: null, gpuMemoryPercent: null,
    })
  })
})
