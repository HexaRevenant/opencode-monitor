import { execFile } from "node:child_process"
import { promisify } from "node:util"
import si from "systeminformation"

const execFileAsync = promisify(execFile)

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

type NetworkSample = { rx_bytes?: number; tx_bytes?: number; rx_sec?: number; tx_sec?: number; iface?: string }
type MonitorNode = { Text?: string; Type?: string; Value?: string; Children?: MonitorNode[] }

function parseMonitorTemperature(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

async function readLibreHardwareMonitorTemperature(): Promise<number | undefined> {
  const response = await fetch("http://127.0.0.1:8085/data.json", { signal: AbortSignal.timeout(2_000) })
  if (!response.ok) return undefined
  const root = (await response.json()) as MonitorNode
  const sensors: MonitorNode[] = []
  const visit = (node: MonitorNode) => {
    if (node.Type === "Temperature" && node.Text !== undefined) sensors.push(node)
    for (const child of node.Children ?? []) visit(child)
  }
  visit(root)
  const cpuSensor = sensors.find((sensor) => sensor.Text === "CPU Package") ??
    sensors.find((sensor) => sensor.Text === "Core Average") ??
    sensors.find((sensor) => sensor.Text === "Core Max")
  return parseMonitorTemperature(cpuSensor?.Value)
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
    { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 },
  )
  const parsed = JSON.parse(stdout.trim()) as
    | { Name?: string; ReceivedBytes?: number; SentBytes?: number }
    | Array<{ Name?: string; ReceivedBytes?: number; SentBytes?: number }>
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.map((item) => ({
    iface: item.Name,
    rx_bytes: finite(item.ReceivedBytes) ?? 0,
    tx_bytes: finite(item.SentBytes) ?? 0,
  }))
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

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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
const TEMPERATURE_CACHE_MS = process.platform === "win32" ? Number.POSITIVE_INFINITY : 60_000
const isWindows = process.platform === "win32"
const NETWORK_SAMPLE_INTERVAL_MS = 2_000

type CachedMetric<T> = {
  value: T | undefined
  lastAttemptAt: number
  inFlight: Promise<T | undefined> | undefined
}

function readCachedMetric<T>(
  state: CachedMetric<T>,
  reader: () => Promise<T>,
  cacheMs = SLOW_METRIC_CACHE_MS,
): Promise<T | undefined> {
  const now = Date.now()
  if (state.inFlight !== undefined) return state.inFlight
  if (now - state.lastAttemptAt < cacheMs) return Promise.resolve(state.value)

  state.lastAttemptAt = now
  state.inFlight = reader()
    .then((value) => {
      state.value = value
      return value
    })
    .catch(() => state.value)
    .finally(() => {
      state.inFlight = undefined
    })
  return state.inFlight
}

const cachedCpuTemperature: CachedMetric<Awaited<ReturnType<typeof si.cpuTemperature>>> = {
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

let windowsSensorsRead: Promise<void> | undefined
let windowsCpuTemperatureCelsius: number | undefined
let windowsNetworkTimer: ReturnType<typeof setInterval> | undefined
let windowsNetworkReadInFlight = false
let previousWindowsNetwork: { timestamp: number; rx: number; tx: number } | undefined

async function refreshWindowsNetwork() {
  if (windowsNetworkReadInFlight) return
  windowsNetworkReadInFlight = true
  try {
    const samples = await readWindowsNetworkSample()
    const timestamp = Date.now()
    const rx = samples.reduce((total, item) => total + (finite(item.rx_bytes) ?? 0), 0)
    const tx = samples.reduce((total, item) => total + (finite(item.tx_bytes) ?? 0), 0)
    let rxPerSecond: number | undefined
    let txPerSecond: number | undefined
    if (previousWindowsNetwork !== undefined) {
      const seconds = Math.max((timestamp - previousWindowsNetwork.timestamp) / 1000, 0.001)
      rxPerSecond = Math.max(0, rx - previousWindowsNetwork.rx) / seconds
      txPerSecond = Math.max(0, tx - previousWindowsNetwork.tx) / seconds
    }
    previousWindowsNetwork = { timestamp, rx, tx }
    cachedNetwork.value = [{ rx_bytes: rx, tx_bytes: tx, rx_sec: rxPerSecond, tx_sec: txPerSecond }]
  } catch {
    // Keep the last network sample when Windows counters are temporarily unavailable.
  } finally {
    windowsNetworkReadInFlight = false
  }
}

function startWindowsNetworkPolling() {
  if (!isWindows || windowsNetworkTimer !== undefined) return
  void refreshWindowsNetwork()
  windowsNetworkTimer = setInterval(() => void refreshWindowsNetwork(), NETWORK_SAMPLE_INTERVAL_MS)
}

function startWindowsSensorsRead() {
  if (!isWindows || windowsSensorsRead !== undefined) return

  windowsSensorsRead = (async () => {
    try {
      windowsCpuTemperatureCelsius = await readLibreHardwareMonitorTemperature()
    } catch {
      // Try systeminformation below when LibreHardwareMonitor is unavailable.
    }
    if (windowsCpuTemperatureCelsius === undefined) {
      try {
        const fallback = await si.cpuTemperature()
        windowsCpuTemperatureCelsius = finite(fallback.main) ?? finite(fallback.max) ?? undefined
      } catch {
        // Keep the temperature unavailable when Windows exposes no sensor.
      }
    }
    try {
      cachedGraphics.value = await si.graphics()
    } catch {
      // Keep GPU metrics unavailable when the driver does not expose them.
    }
    if (isWindows) startWindowsNetworkPolling()
  })()
}

export async function readMetrics(): Promise<SystemMetrics> {
  const [load, memory] = await Promise.allSettled([
    si.currentLoad(),
    si.mem(),
  ])

  if (isWindows) startWindowsSensorsRead()
  const [temperature, graphics, network] = await Promise.allSettled([
    isWindows
      ? Promise.resolve(windowsCpuTemperatureCelsius === undefined ? undefined : { main: windowsCpuTemperatureCelsius })
      : withTimeout(readCachedMetric(cachedCpuTemperature, () => si.cpuTemperature(), TEMPERATURE_CACHE_MS), 1500),
    isWindows
      ? Promise.resolve(cachedGraphics.value)
      : withTimeout(readCachedMetric(cachedGraphics, () => si.graphics(), SLOW_METRIC_CACHE_MS), 1500),
    isWindows ? Promise.resolve(cachedNetwork.value) : si.networkStats("*"),
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

  let gpuPercent: number | null = null
  let gpuTemperatureCelsius: number | null = null
  let gpuMemoryUsedBytes: number | null = null
  let gpuMemoryTotalBytes: number | null = null
  let gpuMemoryPercent: number | null = null
  if (graphics.status === "fulfilled" && graphics.value !== undefined) {
    const controller = graphics.value.controllers
      .map((item) => {
        const utilization = finite(item.utilizationGpu)
        const temperature = finite(item.temperatureGpu)
        const memoryTotal = finite(item.memoryTotal)
        const memoryFree = finite(item.memoryFree)
        const memoryUsed =
          finite(item.memoryUsed) ??
          (memoryTotal !== null && memoryFree !== null ? Math.max(0, memoryTotal - memoryFree) : null)
        const hasMemory = memoryUsed !== null && memoryTotal !== null && memoryTotal > 0
        return { item, utilization, temperature, memoryUsed, memoryTotal, hasMemory }
      })
      .filter(({ utilization, temperature, hasMemory }) => utilization !== null || temperature !== null || hasMemory)
      .sort((left, right) => {
        const score = (value: typeof left) => (value.hasMemory ? 2 : 0) + (value.utilization !== null ? 1 : 0)
        const scoreDifference = score(right) - score(left)
        if (scoreDifference !== 0) return scoreDifference
        return (right.utilization ?? -Infinity) - (left.utilization ?? -Infinity)
      })[0]

    if (controller !== undefined) {
      // A detected GPU without a utilization sample is shown as idle.
      gpuPercent = controller.utilization ?? 0
      gpuTemperatureCelsius = controller.temperature
      if (controller.hasMemory) {
        gpuMemoryUsedBytes = controller.memoryUsed! * 1024 ** 2
        gpuMemoryTotalBytes = controller.memoryTotal! * 1024 ** 2
        gpuMemoryPercent = (controller.memoryUsed! / controller.memoryTotal!) * 100
      }
    }
  }

  let downloadBytesPerSecond: number | null = null
  let uploadBytesPerSecond: number | null = null
  if (network.status === "fulfilled" && network.value !== undefined) {
    const samples = network.value as NetworkSample[]
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
    gpuPercent,
    cpuTemperatureCelsius:
      temperature.status === "fulfilled" && temperature.value !== undefined
        ? finite(temperature.value.main) ?? ("max" in temperature.value ? finite(temperature.value.max) : null)
        : null,
    gpuTemperatureCelsius,
    gpuMemoryUsedBytes,
    gpuMemoryTotalBytes,
    gpuMemoryPercent,
    downloadBytesPerSecond,
    uploadBytesPerSecond,
  }
}
