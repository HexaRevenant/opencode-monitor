/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { TuiPlugin, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { formatGiB, formatPercent, formatRate, formatTemperature } from "./format.js"
import { readMetrics, type SystemMetrics } from "./metrics.js"
import { getMetricIcons, hasHackNerdFont } from "./font.js"

const REFRESH_INTERVAL_MS = process.platform === "win32" ? 5000 : 2000
// Windows terminals do not expose the active font to plugins; Unicode is the reliable fallback.
const icons = getMetricIcons(process.platform !== "win32" && hasHackNerdFont())

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
  const [metrics, setMetrics] = createSignal<SystemMetrics>({
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
  })
  let refreshing = false

  const refresh = async () => {
    if (refreshing) return
    refreshing = true
    try {
      setMetrics(await readMetrics())
    } finally {
      refreshing = false
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined
  onMount(() => {
    void refresh()
    timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
  })
  onCleanup(() => {
    if (timer !== undefined) clearInterval(timer)
  })

  return (
    <box flexDirection="column" paddingLeft={0} paddingRight={0}>
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>{icons.title} {systemMetricsTitle()}</text>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.cpu}</text>
        <text fg={props.theme.text}> CPU    </text>
        <text fg={props.theme.textMuted}>{formatPercent(metrics().cpuPercent)} · {icons.thermometer} {formatTemperature(metrics().cpuTemperatureCelsius)}</text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.ram}</text>
        <text fg={props.theme.text}> RAM    </text>
        <text fg={props.theme.textMuted}>
          {formatGiB(metrics().memoryUsedBytes)} / {formatGiB(metrics().memoryTotalBytes)} ({formatPercent(metrics().memoryPercent)})
        </text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.gpu}</text>
        <text fg={props.theme.text}> GPU    </text>
        <text fg={props.theme.textMuted}>{formatPercent(metrics().gpuPercent)} · {icons.thermometer} {formatTemperature(metrics().gpuTemperatureCelsius)}</text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.vram}</text>
        <text fg={props.theme.text}> GPU VRAM </text>
        <text fg={props.theme.textMuted}>
          {formatGiB(metrics().gpuMemoryUsedBytes)} / {formatGiB(metrics().gpuMemoryTotalBytes)} ({formatPercent(metrics().gpuMemoryPercent)})
        </text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.network}</text>
        <text fg={props.theme.text}> NET </text>
        <text fg={props.theme.textMuted}>
          ↓ {formatRate(metrics().downloadBytesPerSecond)} ↑ {formatRate(metrics().uploadBytesPerSecond)}
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
