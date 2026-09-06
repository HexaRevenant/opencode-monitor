import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatGiB, formatPercent, formatRate, formatTemperature } from "../src/format.js"
import { getFontDirectories, getMetricIcons, isNerdFontFile, shouldUseNerdFont } from "../src/font.js"

describe("metric formatting", () => {
  it("formats percentages and unavailable values", () => {
    assert.equal(formatPercent(42.4), "42%")
    assert.equal(formatPercent(null), "—")
  })

  it("formats temperatures and unavailable values", () => {
    assert.equal(formatTemperature(45.4), "45°C")
    assert.equal(formatTemperature(null), "—")
    assert.equal(formatTemperature(Number.NaN), "—")
  })

  it("formats memory in GiB", () => {
    assert.equal(formatGiB(1024 ** 3 * 3.5), "3.5 GiB")
    assert.equal(formatGiB(null), "—")
  })

  it("formats network rates with readable units", () => {
    assert.equal(formatRate(1536), "1.5 KiB/s")
    assert.equal(formatRate(2 * 1024 ** 2), "2.0 MiB/s")
  })
})

describe("Hack Nerd Font paths and fallback", () => {
  it("uses standard per-user directories on every supported platform", () => {
    assert.equal(getFontDirectories("linux", "/home/test")[0], "/home/test/.local/share/fonts")
    assert.equal(getFontDirectories("darwin", "/Users/test")[0], "/Users/test/Library/Fonts")
    assert.equal(getFontDirectories("win32", "C:\\Users\\test", { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" })[0], "C:\\Users\\test\\AppData\\Local\\Microsoft\\Windows\\Fonts")
  })

  it("recognizes Hack Nerd Font files and keeps Unicode fallback icons", () => {
    assert.equal(isNerdFontFile("HackNerdFont-Regular.ttf"), true)
    assert.equal(isNerdFontFile("JetBrainsMonoNerdFontMono-Regular.ttf"), true)
    assert.equal(isNerdFontFile("OtherFont.ttf"), false)
    assert.equal(getMetricIcons(false).cpu, "▣")
    assert.equal(getMetricIcons(false).vram, "◈")
    assert.notEqual(getMetricIcons(true).cpu, getMetricIcons(false).cpu)
    assert.notEqual(getMetricIcons(true).vram, getMetricIcons(false).vram)
    assert.equal(shouldUseNerdFont("win32", true, {}), false)
    assert.equal(shouldUseNerdFont("win32", true, { OPENCODE_MONITOR_NERD_FONT: "1" }), true)
  })
})
