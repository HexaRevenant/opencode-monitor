/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { TuiPlugin, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { formatGiB, formatPercent, formatRate, formatTemperature } from "./format.js"
import { readMetrics, type SystemMetrics } from "./metrics.js"
import { getMetricIcons, hasNerdFont } from "./font.js"

const REFRESH_INTERVAL_MS = 2000
// Use Nerd Font icons when installed; retain Unicode icons as fallback.
const icons = getMetricIcons(hasNerdFont())

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

const [sharedMetrics, setSharedMetrics] = createSignal<SystemMetrics>(initialMetrics)
let metricsTimer: ReturnType<typeof setInterval> | undefined
let metricsConsumers = 0
let refreshing = false

const refreshMetrics = async () => {
  if (refreshing) return
  refreshing = true
  try {
    setSharedMetrics(await readMetrics())
  } finally {
    refreshing = false
  }
}

function startMetricsPolling() {
  metricsConsumers += 1
  if (metricsConsumers !== 1) return

  void refreshMetrics()
  metricsTimer = setInterval(() => void refreshMetrics(), REFRESH_INTERVAL_MS)
}

function stopMetricsPolling() {
  metricsConsumers = Math.max(0, metricsConsumers - 1)
  if (metricsConsumers !== 0 || metricsTimer === undefined) return

  clearInterval(metricsTimer)
  metricsTimer = undefined
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
        <text fg={props.theme.textMuted}>{formatPercent(sharedMetrics().cpuPercent)} · {icons.thermometer} {formatTemperature(sharedMetrics().cpuTemperatureCelsius)}</text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.ram}</text>
        <text fg={props.theme.text}> RAM    </text>
        <text fg={props.theme.textMuted}>
          {formatGiB(sharedMetrics().memoryUsedBytes)} / {formatGiB(sharedMetrics().memoryTotalBytes)} ({formatPercent(sharedMetrics().memoryPercent)})
        </text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.gpu}</text>
        <text fg={props.theme.text}> GPU    </text>
        <text fg={props.theme.textMuted}>{formatPercent(sharedMetrics().gpuPercent)} · {icons.thermometer} {formatTemperature(sharedMetrics().gpuTemperatureCelsius)}</text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.vram}</text>
        <text fg={props.theme.text}> GPU VRAM </text>
        <text fg={props.theme.textMuted}>
          {formatGiB(sharedMetrics().gpuMemoryUsedBytes)} / {formatGiB(sharedMetrics().gpuMemoryTotalBytes)} ({formatPercent(sharedMetrics().gpuMemoryPercent)})
        </text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.network}</text>
        <text fg={props.theme.text}> NET </text>
        <text fg={props.theme.textMuted}>
          ↓ {formatRate(sharedMetrics().downloadBytesPerSecond)} ↑ {formatRate(sharedMetrics().uploadBytesPerSecond)}
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
