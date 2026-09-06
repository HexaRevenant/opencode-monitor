import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseMonitorTemperature, parseWindowsNetworkOutput, readCachedMetric, selectGpuMetrics, withTimeout, type CachedMetric } from "../src/metrics.js"

describe("Windows metric parsing", () => {
  it("parses PowerShell JSON in both object and array forms", () => {
    assert.deepEqual(parseWindowsNetworkOutput('{"Name":"Ethernet","ReceivedBytes":100,"SentBytes":50}'), [{ iface: "Ethernet", rx_bytes: 100, tx_bytes: 50 }])
    assert.equal(parseWindowsNetworkOutput('[{"Name":"Wi-Fi","ReceivedBytes":200,"SentBytes":75}]')[0].rx_bytes, 200)
  })

  it("parses LibreHardwareMonitor temperatures", () => assert.equal(parseMonitorTemperature("51,5 °C"), 51.5))
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

  it("rejects a slow sensor without waiting for it", async () => {
    await assert.rejects(withTimeout(new Promise<number>((resolve) => setTimeout(() => resolve(1), 50)), 5), /metric timeout/)
  })
})
