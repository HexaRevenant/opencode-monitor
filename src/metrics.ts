import { execFile } from "node:child_process"
import { promisify } from "node:util"
import si from "systeminformation"

const execFileAsync = promisify(execFile)
const WINDOWS_NETWORK_TIMEOUT_MS = 1_500

export interface SystemMetrics {
  cpuPercent: number | null
  memoryUsedBytes: number | null
  memoryTotalBytes: number | null
  memoryPercent: number | null
  gpuPercent: number | null
  cpuTemperatureCelsius: number | null
  gpuTemperatureCelsius: number | null
  gpuMemoryUsedBytes: number | null
  gpuMemoryTotalBytes: number | null
  gpuMemoryPercent: number | null
  downloadBytesPerSecond: number | null
  uploadBytesPerSecond: number | null
}

export type NetworkSample = { rx_bytes?: number; tx_bytes?: number; rx_sec?: number; tx_sec?: number; iface?: string }
type MonitorNode = { Text?: string; Type?: string; Value?: string; Children?: MonitorNode[] }

export function parseMonitorTemperature(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

async function readLibreHardwareMonitorTemperature(): Promise<number | undefined> {
  const response = await fetch("http://127.0.0.1:8085/data.json", { signal: AbortSignal.timeout(2_000) })
  if (!response.ok) return undefined
  const root = (await response.json()) as unknown
  if (root === null || typeof root !== "object") return undefined
  const sensors: MonitorNode[] = []
  const visit = (node: MonitorNode) => {
    if (node.Type === "Temperature" && node.Text !== undefined) sensors.push(node)
    for (const child of Array.isArray(node.Children) ? node.Children : []) {
      if (child !== null && typeof child === "object") visit(child)
    }
  }
  visit(root as MonitorNode)
  const cpuSensor = sensors.find((sensor) => sensor.Text === "CPU Package") ??
    sensors.find((sensor) => sensor.Text === "Core Average") ??
    sensors.find((sensor) => sensor.Text === "Core Max")
  return parseMonitorTemperature(cpuSensor?.Value)
}

export function parseWindowsNetworkOutput(stdout: string): NetworkSample[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout.trim())
  } catch {
    return []
  }
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
  return rows.map((item) => ({
    iface: typeof item.Name === "string" ? item.Name : undefined,
    rx_bytes: finite(item.ReceivedBytes) ?? 0,
    tx_bytes: finite(item.SentBytes) ?? 0,
  }))
}

async function readWindowsNetworkSample(): Promise<NetworkSample[]> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress",
    ],
    { windowsHide: true, timeout: WINDOWS_NETWORK_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
  )
  return parseWindowsNetworkOutput(stdout)
}

let previousNetwork: { timestamp: number; rx: number; tx: number } | undefined

const unavailable: SystemMetrics = {
  cpuPercent: null,
  memoryUsedBytes: null,
  memoryTotalBytes: null,
  memoryPercent: null,
  gpuPercent: null,
  cpuTemperatureCelsius: null,
  gpuTemperatureCelsius: null,
  gpuMemoryUsedBytes: null,
  gpuMemoryTotalBytes: null,
  gpuMemoryPercent: null,
  downloadBytesPerSecond: null,
  uploadBytesPerSecond: null,
}

export type GpuMetric = {
  gpuPercent: number | null
  gpuTemperatureCelsius: number | null
  gpuMemoryUsedBytes: number | null
  gpuMemoryTotalBytes: number | null
  gpuMemoryPercent: number | null
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("metric timeout")), timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

const SLOW_METRIC_CACHE_MS = 10_000
const TEMPERATURE_CACHE_MS = 10_000
const OPTIONAL_SOURCE_BACKOFF_MS = 30_000
const isWindows = process.platform === "win32"
const NETWORK_CACHE_MS = 2_000

export type CachedMetric<T> = {
  value: T | undefined
  lastAttemptAt: number
  lastFailureAt?: number
  inFlight: Promise<T | undefined> | undefined
}

export function selectGpuMetrics(graphics: { controllers: Array<{
  utilizationGpu?: unknown
  temperatureGpu?: unknown
  memoryTotal?: unknown
  memoryFree?: unknown
  memoryUsed?: unknown
}> } | undefined): GpuMetric {
  const empty: GpuMetric = {
    gpuPercent: null,
    gpuTemperatureCelsius: null,
    gpuMemoryUsedBytes: null,
    gpuMemoryTotalBytes: null,
    gpuMemoryPercent: null,
  }
  if (graphics === undefined || graphics === null || !Array.isArray(graphics.controllers)) return empty

  const controller = graphics.controllers
    .map((item) => {
      const source = item ?? {}
      const utilization = finite(source.utilizationGpu)
      const temperature = finite(source.temperatureGpu)
      const memoryTotal = finite(source.memoryTotal)
      const memoryFree = finite(source.memoryFree)
      const memoryUsed = finite(source.memoryUsed) ??
        (memoryTotal !== null && memoryFree !== null ? Math.max(0, memoryTotal - memoryFree) : null)
      const hasMemory = memoryUsed !== null && memoryTotal !== null && memoryTotal > 0
      return { utilization, temperature, memoryUsed, memoryTotal, hasMemory }
    })
    .filter(({ utilization, temperature, hasMemory }) => utilization !== null || temperature !== null || hasMemory)
    .sort((left, right) => {
      const score = (value: typeof left) => (value.hasMemory ? 2 : 0) + (value.utilization !== null ? 1 : 0)
      return score(right) - score(left) || (right.utilization ?? -Infinity) - (left.utilization ?? -Infinity)
    })[0]

  if (controller === undefined) return empty
  const result: GpuMetric = {
    gpuPercent: controller.utilization ?? 0,
    gpuTemperatureCelsius: controller.temperature,
    gpuMemoryUsedBytes: null,
    gpuMemoryTotalBytes: null,
    gpuMemoryPercent: null,
  }
  if (controller.hasMemory) {
    result.gpuMemoryUsedBytes = controller.memoryUsed! * 1024 ** 2
    result.gpuMemoryTotalBytes = controller.memoryTotal! * 1024 ** 2
    result.gpuMemoryPercent = (controller.memoryUsed! / controller.memoryTotal!) * 100
  }
  return result
}

export function readCachedMetric<T>(
  state: CachedMetric<T>,
  reader: () => Promise<T>,
  cacheMs = SLOW_METRIC_CACHE_MS,
  now = Date.now(),
  unavailableCacheMs = cacheMs,
  timeoutMs?: number,
): Promise<T | undefined> {
  if (state.inFlight !== undefined) return state.inFlight
  if (state.lastFailureAt !== undefined && now - state.lastFailureAt < unavailableCacheMs) {
    return Promise.resolve(state.value)
  }
  if (now - state.lastAttemptAt < cacheMs) return Promise.resolve(state.value)

  state.lastAttemptAt = now
  let flight!: Promise<T | undefined>
  flight = (async () => {
    try {
      const value = timeoutMs === undefined ? await reader() : await withTimeout(reader(), timeoutMs)
      state.value = value
      state.lastFailureAt = undefined
      return value
    } catch {
      state.lastFailureAt = now
      return state.value
    } finally {
      // A timed-out reader may still resolve later. Do not let that old
      // attempt clear a newer in-flight attempt.
      if (state.inFlight === flight) state.inFlight = undefined
    }
  })()
  state.inFlight = flight
  return flight
}

const cachedCpuTemperature: CachedMetric<Awaited<ReturnType<typeof si.cpuTemperature>>> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

const cachedLibreHardwareMonitorTemperature: CachedMetric<number> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

const cachedGraphics: CachedMetric<Awaited<ReturnType<typeof si.graphics>>> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

const cachedNetwork: CachedMetric<NetworkSample[]> = {
  value: undefined,
  lastAttemptAt: 0,
  inFlight: undefined,
}

let previousWindowsNetwork: { timestamp: number; rx: number; tx: number } | undefined

async function readWindowsNetworkMetrics(): Promise<NetworkSample[]> {
  const samples = await readWindowsNetworkSample()
  const timestamp = Date.now()
  const rx = samples.reduce((total, item) => total + (finite(item.rx_bytes) ?? 0), 0)
  const tx = samples.reduce((total, item) => total + (finite(item.tx_bytes) ?? 0), 0)
  const seconds = previousWindowsNetwork === undefined
    ? undefined
    : Math.max((timestamp - previousWindowsNetwork.timestamp) / 1000, 0.001)
  const result = [{
    rx_bytes: rx,
    tx_bytes: tx,
    rx_sec: seconds === undefined ? undefined : Math.max(0, rx - previousWindowsNetwork!.rx) / seconds,
    tx_sec: seconds === undefined ? undefined : Math.max(0, tx - previousWindowsNetwork!.tx) / seconds,
  }]
  previousWindowsNetwork = { timestamp, rx, tx }
  return result
}

async function readWindowsCpuTemperature(): Promise<{ main: number } | undefined> {
  try {
    const native = await si.cpuTemperature()
    const value = finite(native.main) ?? finite(native.max) ?? undefined
    if (value !== undefined) return { main: value }
  } catch {
    // Try LibreHardwareMonitor when the native source is unavailable.
  }

  const now = Date.now()
  const value = await readCachedMetric(
    cachedLibreHardwareMonitorTemperature,
    async () => {
      const temperature = await readLibreHardwareMonitorTemperature()
      if (temperature === undefined) throw new Error("LibreHardwareMonitor temperature unavailable")
      return temperature
    },
    TEMPERATURE_CACHE_MS,
    now,
    OPTIONAL_SOURCE_BACKOFF_MS,
  )
  if (cachedLibreHardwareMonitorTemperature.lastFailureAt !== undefined &&
    now - cachedLibreHardwareMonitorTemperature.lastFailureAt < OPTIONAL_SOURCE_BACKOFF_MS) {
    return undefined
  }
  return value === undefined ? undefined : { main: value }
}

export async function readMetrics(): Promise<SystemMetrics> {
  const [load, memory] = await Promise.allSettled([
    withTimeout(si.currentLoad(), 1_500),
    withTimeout(si.mem(), 1_500),
  ])

  const [temperature, graphics, network] = await Promise.allSettled([
    readCachedMetric(cachedCpuTemperature, isWindows ? readWindowsCpuTemperature : () => si.cpuTemperature(), TEMPERATURE_CACHE_MS, Date.now(), TEMPERATURE_CACHE_MS, 2_500),
    readCachedMetric(cachedGraphics, () => si.graphics(), SLOW_METRIC_CACHE_MS, Date.now(), SLOW_METRIC_CACHE_MS, 2_500),
    readCachedMetric(
      cachedNetwork,
      isWindows ? readWindowsNetworkMetrics : () => si.networkStats("*"),
      isWindows ? NETWORK_CACHE_MS : 2_000,
      Date.now(),
      OPTIONAL_SOURCE_BACKOFF_MS,
      1_500,
    ),
  ])

  const cpuPercent = load.status === "fulfilled" ? finite(load.value.currentLoad) : null
  const memoryTotalBytes = memory.status === "fulfilled" ? finite(memory.value.total) : null
  const memoryAvailableBytes = memory.status === "fulfilled" ? finite(memory.value.available) : null
  const memoryUsedBytes =
    memoryTotalBytes !== null && memoryAvailableBytes !== null
      ? Math.max(0, memoryTotalBytes - memoryAvailableBytes)
      : memory.status === "fulfilled"
        ? finite(memory.value.used)
        : null
  const memoryPercent =
    memoryUsedBytes !== null && memoryTotalBytes !== null && memoryTotalBytes > 0
      ? (memoryUsedBytes / memoryTotalBytes) * 100
      : null

  const gpu = selectGpuMetrics(graphics.status === "fulfilled" ? graphics.value : undefined)

  let downloadBytesPerSecond: number | null = null
  let uploadBytesPerSecond: number | null = null
  if (network.status === "fulfilled" && network.value !== undefined) {
    const samples = Array.isArray(network.value) ? network.value : []
    const timestamp = Date.now()
    const rx = samples.reduce((total, item) => total + (finite(item.rx_bytes) ?? 0), 0)
    const tx = samples.reduce((total, item) => total + (finite(item.tx_bytes) ?? 0), 0)

    if (isWindows) {
      downloadBytesPerSecond = finite(samples[0]?.rx_sec) ?? null
      uploadBytesPerSecond = finite(samples[0]?.tx_sec) ?? null
    } else if (previousNetwork !== undefined) {
      const seconds = Math.max((timestamp - previousNetwork.timestamp) / 1000, 0.001)
      downloadBytesPerSecond = Math.max(0, rx - previousNetwork.rx) / seconds
      uploadBytesPerSecond = Math.max(0, tx - previousNetwork.tx) / seconds
    } else {
      downloadBytesPerSecond = finite(samples[0]?.rx_sec) ?? null
      uploadBytesPerSecond = finite(samples[0]?.tx_sec) ?? null
    }

    previousNetwork = { timestamp, rx, tx }
  }

  return {
    ...unavailable,
    cpuPercent,
    memoryUsedBytes,
    memoryTotalBytes,
    memoryPercent,
    gpuPercent: gpu.gpuPercent,
    cpuTemperatureCelsius:
      temperature.status === "fulfilled" && temperature.value !== undefined
        ? finite(temperature.value.main) ?? ("max" in temperature.value ? finite(temperature.value.max) : null)
        : null,
    gpuTemperatureCelsius: gpu.gpuTemperatureCelsius,
    gpuMemoryUsedBytes: gpu.gpuMemoryUsedBytes,
    gpuMemoryTotalBytes: gpu.gpuMemoryTotalBytes,
    gpuMemoryPercent: gpu.gpuMemoryPercent,
    downloadBytesPerSecond,
    uploadBytesPerSecond,
  }
}
