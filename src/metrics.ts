import si from "systeminformation"

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

type NetworkSample = { rx_bytes?: number; tx_bytes?: number; iface?: string }

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

export async function readMetrics(): Promise<SystemMetrics> {
  const [load, memory] = await Promise.allSettled([
    si.currentLoad(),
    si.mem(),
  ])

  const [temperature, graphics, network] = await Promise.allSettled([
    withTimeout(si.cpuTemperature(), 1500),
    withTimeout(si.graphics(), 1500),
    withTimeout(si.networkStats("*"), 1500),
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
  if (graphics.status === "fulfilled") {
    const controller = graphics.value.controllers
      .map((item) => {
        const utilization = finite(item.utilizationGpu)
        const temperature = finite(item.temperatureGpu)
        const memoryUsed = finite(item.memoryUsed)
        const memoryTotal = finite(item.memoryTotal)
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
      // A detected GPU with readable VRAM but no utilization sample is idle.
      gpuPercent = controller.utilization ?? (controller.hasMemory ? 0 : null)
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
  if (network.status === "fulfilled") {
    const samples = network.value as NetworkSample[]
    const timestamp = Date.now()
    const rx = samples.reduce((total, item) => total + (finite(item.rx_bytes) ?? 0), 0)
    const tx = samples.reduce((total, item) => total + (finite(item.tx_bytes) ?? 0), 0)

    if (previousNetwork !== undefined) {
      const seconds = Math.max((timestamp - previousNetwork.timestamp) / 1000, 0.001)
      downloadBytesPerSecond = Math.max(0, rx - previousNetwork.rx) / seconds
      uploadBytesPerSecond = Math.max(0, tx - previousNetwork.tx) / seconds
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
      temperature.status === "fulfilled"
        ? finite(temperature.value.main) ?? finite(temperature.value.max)
        : null,
    gpuTemperatureCelsius,
    gpuMemoryUsedBytes,
    gpuMemoryTotalBytes,
    gpuMemoryPercent,
    downloadBytesPerSecond,
    uploadBytesPerSecond,
  }
}
