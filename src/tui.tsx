/** @jsxImportSource @opentui/solid */
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import { createEffect, For, untrack } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { TuiPlugin, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { formatGiB, formatPercent, formatRate, formatTemperature } from "./format.js"
import { gpuMemoryLabel, readMetrics, type SystemMetrics } from "./metrics.js"
import { getMetricIcons, hasNerdFont, shouldUseNerdFont } from "./font.js"
import { CODEX_QUOTA_REFRESH_MS, fetchCodexQuota, readCodexAuth, type CodexQuota } from "./codex-quota.js"
import { formatCodexQuotaWindowLines, formatQuotaResetCredits, getCodexQuotaLabels } from "./codex-quota-copy.js"
import { getLatestUserMessageProvider, selectCodexProvider } from "./codex-provider.js"
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
  const quotaLabels = getCodexQuotaLabels(locale)
  const [clock, setClock] = createSignal(new Date())
  const [quota, setQuota] = createSignal<CodexQuota>()
  const [codexSession, setCodexSession] = createSignal(false)
  const [metricsExpanded, setMetricsExpanded] = createSignal(true)
  const [quotaExpanded, setQuotaExpanded] = createSignal(true)
  let clockTimer: ReturnType<typeof setInterval> | undefined
  let quotaTimer: ReturnType<typeof setInterval> | undefined
  let quotaRefreshing = false
  let quotaRefreshRequested = false
  let quotaDisposed = false
  let quotaGeneration = 0
  let selectedNextModelProvider: string | undefined

  const refreshQuota = async () => {
    if (!codexSession() || quotaDisposed) return
    if (quotaRefreshing) {
      quotaRefreshRequested = true
      return
    }
    quotaRefreshing = true
    const generation = quotaGeneration
    try {
      const credential = await readCodexAuth()
      const nextQuota = credential ? await fetchCodexQuota(credential) : undefined
      if (generation === quotaGeneration && codexSession()) setQuota(nextQuota)
    } catch {
      if (generation === quotaGeneration) setQuota(undefined)
    } finally {
      quotaRefreshing = false
      if (quotaRefreshRequested && codexSession() && !quotaDisposed) {
        quotaRefreshRequested = false
        queueMicrotask(() => void refreshQuota())
      }
    }
  }

  const updateCodexSession = (sessionID: string) => {
    const session = props.api.state.session.get(sessionID) as { model?: { providerID?: string } } | undefined
    const messages = props.api.state.session.messages(sessionID) as readonly {
      role?: string; model?: { providerID?: string }
    }[]
    const isCodex = selectCodexProvider(
      session?.model?.providerID,
      getLatestUserMessageProvider(messages),
      selectedNextModelProvider,
    )
    if (isCodex === untrack(codexSession)) return

    setCodexSession(isCodex)
    if (!isCodex) {
      quotaGeneration += 1
      quotaRefreshRequested = false
      setQuota(undefined)
      if (quotaTimer !== undefined) clearInterval(quotaTimer)
      quotaTimer = undefined
      return
    }

    void refreshQuota()
    quotaTimer = setInterval(() => void refreshQuota(), CODEX_QUOTA_REFRESH_MS)
  }

  onMount(startMetricsPolling)
  createEffect(() => {
    const sessionID = props.sessionID
    quotaDisposed = false
    selectedNextModelProvider = undefined
    untrack(() => {
      setCodexSession(false)
      setQuota(undefined)
      updateCodexSession(sessionID)
    })
    const disposeSession = props.api.event.on("session.updated", (event) => {
      if (event.properties.sessionID === sessionID) untrack(() => updateCodexSession(sessionID))
    })
    const disposeMessage = props.api.event.on("message.updated", (event) => {
      if (event.properties.sessionID === sessionID) untrack(() => updateCodexSession(sessionID))
    })
    const disposeNextModel = props.api.event.on("session.next.model.switched", (event) => {
      if (event.properties.sessionID !== sessionID) return
      selectedNextModelProvider = event.properties.model.providerID
      untrack(() => updateCodexSession(sessionID))
    })
    onCleanup(() => {
      disposeSession()
      disposeMessage()
      disposeNextModel()
      quotaDisposed = true
      quotaRefreshRequested = false
      quotaGeneration += 1
      if (quotaTimer !== undefined) clearInterval(quotaTimer)
    })
  })
  onMount(() => {
    clockTimer = setInterval(() => setClock(new Date()), 1000)
  })
  onCleanup(() => {
    stopMetricsPolling()
    if (quotaTimer !== undefined) clearInterval(quotaTimer)
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
        <text fg={props.theme.success}>{metricsExpanded() ? icons.disclosureExpanded : icons.disclosureCollapsed}</text>
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
      <Show when={codexSession()}>
        <>
          <text> </text>
          <box flexDirection="row" onMouseDown={(event) => { if (event.button === 0) setQuotaExpanded((expanded) => !expanded) }}>
            <text fg={props.theme.success}>{quotaExpanded() ? icons.disclosureExpanded : icons.disclosureCollapsed}</text>
            <text fg={props.theme.text} attributes={TextAttributes.BOLD}> {icons.codexSession} {quotaLabels.heading}</text>
          </box>
          <Show when={quotaExpanded()}>
          <Show when={quota()}>
          {(data) => <>
          <For each={[
            [icons.codexSession, quotaLabels.session, data().primary],
            [icons.codexWeekly, quotaLabels.weekly, data().secondary],
          ] as const}>{([icon, label, window]) => <box flexDirection="column">
            <box flexDirection="row">
              <text fg={props.theme.success}>{icon}</text>
              <text fg={props.theme.text}> {label}</text>
            </box>
            <For each={formatCodexQuotaWindowLines(window, quotaLabels, locale)}>{(line) => <text fg={props.theme.textMuted}>{line}</text>}</For>
          </box>}</For>
          <Show when={data().credits}>
            {(credits) => <box flexDirection="column">
              <Show when={credits().balance !== undefined || credits().unlimited !== undefined}>
                <box flexDirection="row">
                  <text fg={props.theme.success}>{icons.creditBalance}</text>
                  <text fg={props.theme.text}> {quotaLabels.creditBalance}</text>
                </box>
                <text fg={props.theme.textMuted}>{credits().unlimited ? quotaLabels.unlimited : credits().balance ?? quotaLabels.unavailable}</text>
              </Show>
              <Show when={credits().available !== undefined || credits().applicable !== undefined}>
                <box flexDirection="row">
                  <text fg={props.theme.success}>{icons.quotaResetCredits}</text>
                  <text fg={props.theme.text}> {quotaLabels.quotaResetCredits}</text>
                </box>
                <text fg={props.theme.textMuted}>{formatQuotaResetCredits(credits().applicable, credits().available, quotaLabels)}</text>
              </Show>
            </box>}
          </Show>
          <For each={data().additional}>{(item) => <box flexDirection="column">
            <box flexDirection="row">
              <text fg={props.theme.success}>{icons.additionalLimit}</text>
              <text fg={props.theme.text}> {item.name}</text>
            </box>
            <text fg={props.theme.textMuted}>{item.usedPercent === undefined ? quotaLabels.unavailable : `${item.usedPercent}% ${quotaLabels.used}`}</text>
            <text fg={props.theme.textMuted}>{item.resetAt ? `${quotaLabels.resets} ${formatLocaleDateTime(new Date(item.resetAt * 1000), locale)}` : item.resetAfterSeconds === undefined ? quotaLabels.resetUnavailable : `${quotaLabels.resetsIn} ${item.resetAfterSeconds}s`}</text>
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
