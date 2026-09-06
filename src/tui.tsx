/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup, onMount } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { TuiPlugin, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { formatGiB, formatPercent, formatRate, formatTemperature } from "./format.js"
import { readMetrics, type SystemMetrics } from "./metrics.js"
import { getMetricIcons, hasNerdFont, shouldUseNerdFont } from "./font.js"

const REFRESH_INTERVAL_MS = 2000
// Windows uses Unicode unless the user explicitly opts into Nerd Font icons.
const platform = process.platform as "linux" | "darwin" | "win32"
const icons = getMetricIcons(shouldUseNerdFont(platform, platform === "win32" ? false : hasNerdFont()))

const initialMetrics: SystemMetrics = {
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

type MetricsState = {
  sharedMetrics: Accessor<SystemMetrics>
  setSharedMetrics: Setter<SystemMetrics>
  metricsTimer: ReturnType<typeof setInterval> | undefined
  metricsConsumers: number
  refreshing: boolean
}

const METRICS_STATE_KEY = Symbol.for("opencode-monitor.system-metrics")
const globalMetrics = globalThis as typeof globalThis & Record<symbol, MetricsState | undefined>
const metricsState: MetricsState = globalMetrics[METRICS_STATE_KEY] ?? (globalMetrics[METRICS_STATE_KEY] = {
  ...(() => {
    const [sharedMetrics, setSharedMetrics] = createSignal<SystemMetrics>(initialMetrics)
    return { sharedMetrics, setSharedMetrics }
  })(),
  metricsTimer: undefined,
  metricsConsumers: 0,
  refreshing: false,
})

const refreshMetrics = async () => {
  if (metricsState.refreshing) return
  metricsState.refreshing = true
  try {
    metricsState.setSharedMetrics(await readMetrics())
  } finally {
    metricsState.refreshing = false
  }
}

function startMetricsPolling() {
  metricsState.metricsConsumers += 1
  if (metricsState.metricsConsumers !== 1) return

  void refreshMetrics()
  metricsState.metricsTimer = setInterval(() => void refreshMetrics(), REFRESH_INTERVAL_MS)
}

function stopMetricsPolling() {
  metricsState.metricsConsumers = Math.max(0, metricsState.metricsConsumers - 1)
  if (metricsState.metricsConsumers !== 0 || metricsState.metricsTimer === undefined) return

  clearInterval(metricsState.metricsTimer)
  metricsState.metricsTimer = undefined
}

function systemMetricsTitle(): string {
  const locale =
    process.env.LC_ALL ??
    process.env.LANGUAGE?.split(":")[0] ??
    process.env.LANG ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const language = locale.split(/[-_.]/)[0].toLowerCase()
  return (
    {
      de: "Systemmetriken",
      es: "Métricas del sistema",
      fr: "Métriques système",
      it: "Metriche di sistema",
      pt: "Métricas do sistema",
    }[language] ?? "System metrics"
  )
}

function MetricsPanel(props: { theme: TuiThemeCurrent }) {
  onMount(startMetricsPolling)
  onCleanup(stopMetricsPolling)

  return (
    <box flexDirection="column" paddingLeft={0} paddingRight={0}>
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>{icons.title} {systemMetricsTitle()}</text>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.cpu}</text>
        <text fg={props.theme.text}> CPU    </text>
        <text fg={props.theme.textMuted}>{formatPercent(metricsState.sharedMetrics().cpuPercent)} · {icons.thermometer} {formatTemperature(metricsState.sharedMetrics().cpuTemperatureCelsius)}</text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.ram}</text>
        <text fg={props.theme.text}> RAM    </text>
        <text fg={props.theme.textMuted}>
          {formatGiB(metricsState.sharedMetrics().memoryUsedBytes)} / {formatGiB(metricsState.sharedMetrics().memoryTotalBytes)} ({formatPercent(metricsState.sharedMetrics().memoryPercent)})
        </text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.gpu}</text>
        <text fg={props.theme.text}> GPU    </text>
        <text fg={props.theme.textMuted}>{formatPercent(metricsState.sharedMetrics().gpuPercent)} · {icons.thermometer} {formatTemperature(metricsState.sharedMetrics().gpuTemperatureCelsius)}</text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.vram}</text>
        <text fg={props.theme.text}> GPU VRAM </text>
        <text fg={props.theme.textMuted}>
          {formatGiB(metricsState.sharedMetrics().gpuMemoryUsedBytes)} / {formatGiB(metricsState.sharedMetrics().gpuMemoryTotalBytes)} ({formatPercent(metricsState.sharedMetrics().gpuMemoryPercent)})
        </text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.network}</text>
        <text fg={props.theme.text}> NET </text>
        <text fg={props.theme.textMuted}>
          ↓ {formatRate(metricsState.sharedMetrics().downloadBytesPerSecond)} ↑ {formatRate(metricsState.sharedMetrics().uploadBytesPerSecond)}
        </text>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api, options) => {
  if (options?.enabled === false) return

  api.slots.register({
    // Built-in sidebar order: context 100, MCP 200. Place metrics immediately after MCP.
    order: 250,
    slots: {
      sidebar_content(_context, props) {
        void props.session_id
        return <MetricsPanel theme={_context.theme.current} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-monitor.system-metrics",
  tui,
}

export default plugin
