/** @jsxImportSource @opentui/solid */
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import { createEffect, For, untrack } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { TuiPlugin, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { formatGiB, formatPercent, formatRate, formatTemperature } from "./format.js"
import { gpuMemoryLabel, readMetrics, type SystemMetrics } from "./metrics.js"
import { getMetricIcons, hasNerdFont, shouldUseNerdFont } from "./font.js"
import { fetchOpenCodeGoUsage, OPENCODE_GO_USAGE_REFRESH_MS, readOpenCodeGoAuth, type OpenCodeGoUsage } from "./opencode-go-usage.js"
import { formatOpenCodeGoWindowLines, getOpenCodeGoLabels } from "./opencode-go-usage-copy.js"
import { getLatestUserMessageProvider, selectOpenCodeGoProvider } from "./opencode-go-provider.js"
import { currentLocale, formatLocaleDate, formatLocaleDateTime } from "./locale.js"

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
  gpuMemoryIsUnified: null,
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
  const locale = currentLocale()
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

function formatClockDate(date: Date): string {
  return formatLocaleDate(date, currentLocale())
}

type TuiApi = Parameters<TuiPlugin>[0]

function MetricsPanel(props: { theme: TuiThemeCurrent; api: TuiApi; sessionID: string }) {
  const locale = currentLocale()
  const usageLabels = getOpenCodeGoLabels(locale)
  const [clock, setClock] = createSignal(new Date())
  const [goUsage, setGoUsage] = createSignal<OpenCodeGoUsage>()
  const [goSession, setGoSession] = createSignal(false)
  const [metricsExpanded, setMetricsExpanded] = createSignal(true)
  const [quotaExpanded, setQuotaExpanded] = createSignal(true)
  let clockTimer: ReturnType<typeof setInterval> | undefined
  let goUsageTimer: ReturnType<typeof setInterval> | undefined
  let goRefreshing = false
  let goRefreshRequested = false
  let goDisposed = false
  let goGeneration = 0
  let selectedNextModelProvider: string | undefined

  const refreshGoUsage = async () => {
    if (!goSession() || goDisposed) return
    if (goRefreshing) {
      goRefreshRequested = true
      return
    }
    goRefreshing = true
    const generation = goGeneration
    try {
      const credential = await readOpenCodeGoAuth()
      const nextUsage = credential ? await fetchOpenCodeGoUsage(credential) : undefined
      if (generation === goGeneration && goSession()) setGoUsage(nextUsage ?? {})
    } catch {
      if (generation === goGeneration) setGoUsage({})
    } finally {
      goRefreshing = false
      if (goRefreshRequested && goSession() && !goDisposed) {
        goRefreshRequested = false
        queueMicrotask(() => void refreshGoUsage())
      }
    }
  }

  const updateOpenCodeGoSession = (sessionID: string) => {
    const session = props.api.state.session.get(sessionID) as { model?: { providerID?: string } } | undefined
    const messages = props.api.state.session.messages(sessionID) as readonly {
      role?: string; model?: { providerID?: string }
    }[]
    const isOpenCodeGo = selectOpenCodeGoProvider(
      session?.model?.providerID,
      getLatestUserMessageProvider(messages),
      selectedNextModelProvider,
    )
    if (isOpenCodeGo === untrack(goSession)) return

    setGoSession(isOpenCodeGo)
    if (!isOpenCodeGo) {
      goGeneration += 1
      goRefreshRequested = false
      setGoUsage(undefined)
      if (goUsageTimer !== undefined) clearInterval(goUsageTimer)
      goUsageTimer = undefined
      return
    }

    setGoUsage({})
    void refreshGoUsage()
    goUsageTimer = setInterval(() => void refreshGoUsage(), OPENCODE_GO_USAGE_REFRESH_MS)
  }

  onMount(startMetricsPolling)
  createEffect(() => {
    const sessionID = props.sessionID
    goDisposed = false
    selectedNextModelProvider = undefined
    untrack(() => {
      setGoSession(false)
      setGoUsage(undefined)
      updateOpenCodeGoSession(sessionID)
    })
    const disposeSession = props.api.event.on("session.updated", (event) => {
      if (event.properties.sessionID === sessionID) untrack(() => updateOpenCodeGoSession(sessionID))
    })
    const disposeMessage = props.api.event.on("message.updated", (event) => {
      if (event.properties.sessionID === sessionID) untrack(() => updateOpenCodeGoSession(sessionID))
    })
    const disposeNextModel = props.api.event.on("session.next.model.switched", (event) => {
      if (event.properties.sessionID !== sessionID) return
      selectedNextModelProvider = event.properties.model.providerID
      untrack(() => updateOpenCodeGoSession(sessionID))
    })
    onCleanup(() => {
      disposeSession()
      disposeMessage()
      disposeNextModel()
      goDisposed = true
      goRefreshRequested = false
      goGeneration += 1
      if (goUsageTimer !== undefined) clearInterval(goUsageTimer)
    })
  })
  onMount(() => {
    clockTimer = setInterval(() => setClock(new Date()), 1000)
  })
  onCleanup(() => {
    stopMetricsPolling()
    if (goUsageTimer !== undefined) clearInterval(goUsageTimer)
    if (clockTimer !== undefined) clearInterval(clockTimer)
  })

  const gpuMemory = createMemo(() => {
    const metrics = metricsState.sharedMetrics()
    const unified = metrics.gpuMemoryIsUnified === true
    return {
      icon: unified ? icons.ram : icons.vram,
      label: gpuMemoryLabel(
        unified ? "arm64" : metrics.gpuMemoryIsUnified === false ? "x86_64" : undefined,
      ),
      usedBytes: unified ? metrics.memoryUsedBytes : metrics.gpuMemoryUsedBytes,
      totalBytes: unified ? metrics.memoryTotalBytes : metrics.gpuMemoryTotalBytes,
      percent: unified ? metrics.memoryPercent : metrics.gpuMemoryPercent,
    }
  })

  return (
    <box flexDirection="column" paddingLeft={0} paddingRight={0}>
      <box flexDirection="row" onMouseDown={(event) => { if (event.button === 0) setMetricsExpanded((expanded) => !expanded) }}>
        <text fg={props.theme.text}>{metricsExpanded() ? icons.disclosureExpanded : icons.disclosureCollapsed}</text>
        <text fg={props.theme.text} attributes={TextAttributes.BOLD}> {icons.title} {systemMetricsTitle()}</text>
      </box>
      <Show when={metricsExpanded()}>
      <>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.clock}</text>
        <text fg={props.theme.textMuted}> {clock().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</text>
      </box>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.calendar}</text>
        <text fg={props.theme.textMuted}> {formatClockDate(clock())}</text>
      </box>
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
      <Show when={metricsState.sharedMetrics().gpuMemoryIsUnified !== true}>
        <box flexDirection="row">
          <text fg={props.theme.success}>{gpuMemory().icon}</text>
          <text fg={props.theme.text}> {gpuMemory().label} </text>
          <text fg={props.theme.textMuted}>
            {formatGiB(gpuMemory().usedBytes)} / {formatGiB(gpuMemory().totalBytes)} ({formatPercent(gpuMemory().percent)})
          </text>
        </box>
      </Show>
      <box flexDirection="row">
        <text fg={props.theme.success}>{icons.network}</text>
        <text fg={props.theme.text}> NET </text>
        <text fg={props.theme.textMuted}>
          ↓ {formatRate(metricsState.sharedMetrics().downloadBytesPerSecond)} ↑ {formatRate(metricsState.sharedMetrics().uploadBytesPerSecond)}
        </text>
      </box>
      </>
      </Show>
      <Show when={goSession()}>
        <>
          <text> </text>
          <box flexDirection="row" onMouseDown={(event) => { if (event.button === 0) setQuotaExpanded((expanded) => !expanded) }}>
            <text fg={props.theme.text}>{quotaExpanded() ? icons.disclosureExpanded : icons.disclosureCollapsed}</text>
            <text fg={props.theme.text} attributes={TextAttributes.BOLD}> {icons.goRolling} {usageLabels.heading}</text>
          </box>
          <Show when={quotaExpanded()}>
          <Show when={goUsage()}>
          {(data) => <>
          <For each={[
            [icons.goRolling, usageLabels.rolling, data().rolling],
            [icons.goWeekly, usageLabels.weekly, data().weekly],
            [icons.goMonthly, usageLabels.monthly, data().monthly],
          ] as const}>{([icon, label, window]) => <box flexDirection="column">
            <box flexDirection="row">
              <text fg={props.theme.success}>{icon}</text>
              <text fg={props.theme.text}> {label}</text>
            </box>
            <For each={formatOpenCodeGoWindowLines(window, usageLabels, locale)}>{(line) => <text fg={props.theme.textMuted}>{line}</text>}</For>
          </box>}</For>
          </>}
          </Show>
          </Show>
        </>
      </Show>
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
        return <MetricsPanel theme={_context.theme.current} api={api} sessionID={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-monitor.system-metrics",
  tui,
}

export default plugin
