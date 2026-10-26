<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Book as EpubBook, NavItem, Rendition } from 'epubjs'
import type { AppSettings, StealthInitPayload, UnderlayCapture } from '@shared/types'
import { defaultStealthSettings } from '@shared/defaults'
import { inkForBackground, type InkStyle } from '../lib/color'
import { collectTopAnchor } from '../lib/anchor'
import { chapterLabelFor, flattenToc, loadBook, toArrayBuffer } from '../lib/epub'
import { extractPageLines } from '../lib/page-text'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'

const store = useAppStore()

const rootEl = ref<HTMLElement | null>(null)
const viewerEl = ref<HTMLElement | null>(null)
const textLayer = ref<HTMLElement | null>(null)
const loading = ref(true)
const loadError = ref('')
const hintVisible = ref(true)
const hovered = ref(false)
const fontSize = ref(15)

const epubBook = shallowRef<EpubBook | null>(null)
const rendition = shallowRef<Rendition | null>(null)
const toc = ref<{ href: string; label: string; level: number }[]>([])
const currentBookId = ref('')
const locationsReady = ref(false)
const settings = ref<AppSettings['stealth']>({ ...defaultStealthSettings })
const fallbackInk = ref<InkStyle>({
  color: 'rgba(60, 58, 54, 0.72)',
  shadow: '0 0 1px rgba(240, 236, 228, 0.6)',
  contrast: 3
})
const uiColor = ref('rgba(120, 118, 112, 0.82)')

interface Underlay {
  data: ImageData
  width: number
  height: number
  windowWidth: number
  windowHeight: number
  offsetX: number
  offsetY: number
}

let underlay: Underlay | null = null
let charSpans: HTMLElement[] = []
let lineTexts: string[] = []
let lastInk: InkStyle = fallbackInk.value
let applyingRemote = false
let sendTimer: number | null = null
let refreshTimer: number | null = null
let refreshSeq = 0
let suppressRefreshUntil = 0
let hintTimer: number | null = null
let resizeTimer: number | null = null
let recolorFrame = 0
let boundDocs = new WeakSet<Document>()
let offInit: (() => void) | null = null
let offUnderlay: (() => void) | null = null
let offRemote: (() => void) | null = null

onMounted(() => {
  document.body.classList.add('stealth-body')
  document.documentElement.style.background = 'transparent'
  applyFallbackInk()

  offInit = window.api.stealth.onInit((payload) => {
    void handleInit(payload)
  })
  offUnderlay = window.api.stealth.onUnderlay((capture) => {
    void applyUnderlay(capture)
  })
  offRemote = window.api.events.onRemoteProgress((progress) => {
    if (progress.source === 'stealth' || progress.bookId !== currentBookId.value || !rendition.value) return
    void applyRemote(progress.cfi)
  })

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousemove', revealHint)
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('pointerup', clearResize)
  window.api.stealth.ready()
  scheduleHintHide()
})

onBeforeUnmount(() => {
  sendProgress()
  offInit?.()
  offUnderlay?.()
  offRemote?.()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mousemove', revealHint)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('pointerup', clearResize)
  if (recolorFrame) cancelAnimationFrame(recolorFrame)
  if (refreshTimer) window.clearTimeout(refreshTimer)
  document.body.classList.remove('stealth-body')
  document.documentElement.style.background = ''
  try {
    rendition.value?.destroy()
    epubBook.value?.destroy()
  } catch {
    /* ignore */
  }
  delete window.__ebookTest
})

async function handleInit(payload: StealthInitPayload): Promise<void> {
  settings.value = payload.settings.stealth
  fontSize.value = payload.settings.stealth.fontSize
  const sameBook = currentBookId.value === payload.book.id && rendition.value
  currentBookId.value = payload.book.id
  if (sameBook) {
    if (payload.cfi) await displayCfi(payload.cfi)
    return
  }
  await openBook(payload.book, payload.cfi)
}

async function openBook(book: { id: string; title: string }, cfi: string): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const bytes = await window.api.library.read(book.id)
    const instance = loadBook(toArrayBuffer(bytes))
    epubBook.value = instance
    await instance.ready
    const navigation = await instance.loaded.navigation
    toc.value = flattenToc(navigation.toc as NavItem[])

    await nextTick()
    const element = viewerEl.value
    if (!element) throw new Error('阅读区域未准备好')
    const renditionInstance = instance.renderTo(element, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
      minSpreadWidth: 0,
      allowScriptedContent: false
    })
    rendition.value = renditionInstance
    await renditionInstance.display(cfi || undefined)
    await wait(160)
    renditionInstance.on('relocated', onRelocated)
    bindIframeEvents()
    await refreshPageText()
    loading.value = false
    sendProgress()
    installTestHooks()
    void instance.locations
      .generate(1200)
      .then(() => {
        locationsReady.value = true
        sendProgress()
      })
      .catch(() => undefined)
  } catch (error) {
    console.error('[stealth] failed to open book', error)
    loadError.value = error instanceof Error ? error.message : String(error)
    loading.value = false
  }
}

async function displayCfi(cfi: string): Promise<void> {
  const instance = rendition.value
  if (!instance || !cfi) return
  try {
    await instance.display(cfi)
    await wait(140)
    await refreshPageText()
  } catch (error) {
    console.warn('[stealth] display failed', error)
  }
}

function onRelocated(): void {
  if (applyingRemote) return
  if (Date.now() >= suppressRefreshUntil) schedulePageRefresh()
  scheduleSend()
}

function schedulePageRefresh(delay = 70): void {
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    void refreshPageText()
  }, delay)
}

function scheduleSend(): void {
  if (sendTimer) window.clearTimeout(sendTimer)
  sendTimer = window.setTimeout(() => {
    sendTimer = null
    sendProgress()
  }, 220)
}

function sendProgress(): void {
  const instance = rendition.value
  if (!instance || !currentBookId.value) return
  const location = (instance.currentLocation() as any)?.start
  if (!location?.cfi) return
  const top = collectTopAnchor(instance)
  const cfi = top?.cfi || location.cfi
  let percentValue = Number(location.percentage) || 0
  if (locationsReady.value) {
    try {
      const value = epubBook.value?.locations.percentageFromCfi(cfi)
      if (Number.isFinite(value)) percentValue = value as number
    } catch {
      /* ignore */
    }
  }
  window.api.stealth.sendProgress({
    bookId: currentBookId.value,
    cfi,
    percent: Math.max(0, Math.min(1, percentValue)),
    chapter: chapterLabelFor(toc.value, location.href),
    sentence: top?.sentence ?? lineTexts[0] ?? '',
    source: 'stealth'
  })
}

async function applyRemote(cfi: string): Promise<void> {
  const instance = rendition.value
  if (!instance) return
  if (((instance.currentLocation() as any)?.start?.cfi ?? '') === cfi) return
  applyingRemote = true
  try {
    await instance.display(cfi)
    await wait(140)
    await refreshPageText()
  } catch (error) {
    console.warn('[stealth] remote display failed', error)
  } finally {
    window.setTimeout(() => {
      applyingRemote = false
    }, 260)
  }
}

async function refreshPageText(): Promise<void> {
  const instance = rendition.value
  if (!instance) return
  const seq = ++refreshSeq
  const list = instance.getContents() as unknown as Array<{ document?: Document }>
  for (const item of list) {
    if (item?.document) injectHiddenStyle(item.document)
  }
  await wait(60)
  if (seq !== refreshSeq) return
  lineTexts = extractPageLines(instance)
  const layer = textLayer.value
  if (!layer) return
  // Build, colour and swap inside one task: the browser never paints a blank
  // or fallback-coloured frame between pages.
  layer.style.visibility = 'hidden'
  renderTextLayer()
  colorizeNow()
  layer.style.visibility = ''
}

/** Match the hidden EPUB page to the visible text layer so line breaks agree. */
function injectHiddenStyle(doc: Document): void {
  if (!doc?.head) return
  let style = doc.getElementById('stealth-layout') as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = 'stealth-layout'
    doc.head.appendChild(style)
  }
  style.textContent = `
    html, body {
      background: transparent !important;
      margin: 0 !important;
      padding: 30px 18px 16px !important;
      box-sizing: border-box !important;
      font-family: 'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', SimSun, serif !important;
      font-size: ${fontSize.value}px !important;
      line-height: 1.76 !important;
      text-align: left !important;
    }
    p { margin: 0 0 0.55em !important; }
    h1, h2, h3, h4, h5, h6 { font-size: 1.05em !important; margin: 0 0 0.4em !important; }
    img, svg, video, figure, figcaption, table { display: none !important; }
  `
}

function renderTextLayer(): void {
  const layer = textLayer.value
  if (!layer) return
  charSpans = []
  const fragment = document.createDocumentFragment()
  if (!lineTexts.length) {
    fragment.appendChild(document.createTextNode(loading.value ? '正在展开…' : '（本页没有可显示的文字）'))
    layer.replaceChildren(fragment)
    return
  }
  for (const line of lineTexts) {
    const row = document.createElement('div')
    row.className = 'stealth-line'
    for (const char of line) {
      if (/\s/.test(char)) {
        row.appendChild(document.createTextNode(char))
        continue
      }
      const span = document.createElement('span')
      span.className = 'stealth-ch'
      span.textContent = char
      row.appendChild(span)
      charSpans.push(span)
    }
    fragment.appendChild(row)
  }
  layer.replaceChildren(fragment)
}

async function applyUnderlay(capture: UnderlayCapture): Promise<void> {
  try {
    const image = new Image()
    image.src = capture.dataUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = capture.width
    canvas.height = capture.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(image, 0, 0)
    underlay = {
      data: context.getImageData(0, 0, capture.width, capture.height),
      width: capture.width,
      height: capture.height,
      windowWidth: capture.windowWidth,
      windowHeight: capture.windowHeight,
      offsetX: capture.offsetX,
      offsetY: capture.offsetY
    }
    colorize()
  } catch (error) {
    console.warn('[stealth] underlay decode failed', error)
  }
}

function colorize(): void {
  if (recolorFrame) cancelAnimationFrame(recolorFrame)
  recolorFrame = requestAnimationFrame(() => {
    recolorFrame = 0
    colorizeNow()
  })
}

function colorizeNow(): void {
  const layer = textLayer.value
  if (!layer || !charSpans.length) return
  if (!underlay) {
    applyFallbackInk()
    return
  }
  const { data, width, height, windowWidth, windowHeight, offsetX, offsetY } = underlay
  const pixels = data.data
  const sx = width / Math.max(1, windowWidth)
  const sy = height / Math.max(1, windowHeight)
  let contrastSum = 0
  let count = 0
  for (const span of charSpans) {
    const rect = span.getBoundingClientRect()
    const row = span.parentElement
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.width <= 0 || !row) continue
    const rowRect = row.getBoundingClientRect()
    // Sample the leading between lines rather than the glyph itself: the
    // overlay's own text is part of the screen capture, and sampling a glyph
    // would feed its color back into the next iteration. The vertical gaps
    // between lines are pure background at the glyph's own x position.
    const candidates = [
      { x: rect.left + rect.width / 2, y: rowRect.top - 6 },
      { x: rect.left + rect.width / 2, y: rowRect.top - 3 },
      { x: rect.left + rect.width / 2, y: rowRect.bottom + 3 },
      { x: rect.left + rect.width / 2, y: rowRect.bottom + 6 }
    ]
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (const point of candidates) {
      const x = Math.round((point.x + offsetX) * sx)
      const y = Math.round((point.y + offsetY) * sy)
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const index = ((y + dy) * width + (x + dx)) * 4
          r += pixels[index]
          g += pixels[index + 1]
          b += pixels[index + 2]
          n++
        }
      }
    }
    if (!n) continue
    const bg = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
    const ink = inkForBackground({ ...bg, luminance: 0 }, settings.value.opacity)
    span.style.color = ink.color
    span.style.textShadow = ink.shadow
    contrastSum += ink.contrast
    count++
    if (count === 1) {
      const luminance = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255
      uiColor.value = luminance > 0.55 ? 'rgba(52, 50, 46, 0.82)' : 'rgba(232, 230, 224, 0.82)'
    }
  }
  if (count) {
    lastInk = {
      color: charSpans[0]?.style.color || fallbackInk.value.color,
      shadow: charSpans[0]?.style.textShadow || fallbackInk.value.shadow,
      contrast: Math.round((contrastSum / count) * 100) / 100
    }
  }
}

function applyFallbackInk(): void {
  const dark = store.theme === 'dark'
  const bg = dark ? { r: 20, g: 22, b: 26, luminance: 0.01 } : { r: 247, g: 243, b: 234, luminance: 0.89 }
  const ink = inkForBackground(bg, settings.value.opacity)
  fallbackInk.value = ink
  lastInk = ink
  for (const span of charSpans) {
    span.style.color = ink.color
    span.style.textShadow = ink.shadow
  }
  uiColor.value = dark ? 'rgba(220, 216, 208, 0.72)' : 'rgba(90, 86, 78, 0.72)'
}

function bindIframeEvents(): void {
  const instance = rendition.value
  if (!instance) return
  const list = instance.getContents() as unknown as Array<{ document?: Document }>
  for (const item of list) {
    const doc = item?.document
    if (!doc || boundDocs.has(doc)) continue
    boundDocs.add(doc)
    doc.addEventListener('keydown', onKeyDown)
    doc.addEventListener('mousemove', revealHint, { passive: true })
    doc.addEventListener('dblclick', exitStealth)
  }
}

function onKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      event.preventDefault()
      void page('next')
      break
    case 'ArrowLeft':
    case 'PageUp':
      event.preventDefault()
      void page('prev')
      break
    case 'Escape':
      event.preventDefault()
      window.api.stealth.hide()
      break
    default:
      break
  }
}

async function page(direction: 'next' | 'prev'): Promise<void> {
  const instance = rendition.value
  if (!instance) return
  try {
    suppressRefreshUntil = Date.now() + 500
    if (direction === 'next') await instance.next()
    else await instance.prev()
    schedulePageRefresh(80)
    await wait(240)
  } catch (error) {
    console.warn('[stealth] page turn failed', error)
  }
}

function onWindowResize(): void {
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null
    void refreshPageText()
  }, 360)
}

function hideStealth(): void {
  window.api.stealth.hide()
}

function exitStealth(): void {
  window.api.stealth.close()
}

function revealHint(): void {
  hintVisible.value = true
  scheduleHintHide()
}

function scheduleHintHide(): void {
  if (hintTimer) window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => {
    hintVisible.value = false
    hintTimer = null
  }, 2200)
}

function installTestHooks(): void {
  window.__ebookTest = {
    ready: () => !loading.value && Boolean(rendition.value),
    topSentence: () => lineTexts[0] ?? '',
    cfi: () => ((rendition.value?.currentLocation() as any)?.start?.cfi ?? '') as string,
    ink: () => lastInk,
    lines: () => lineTexts.length,
    next: () => page('next'),
    prev: () => page('prev')
  }
}

let resizeStart: { x: number; y: number; width: number; height: number } | null = null

function startResize(event: PointerEvent): void {
  event.preventDefault()
  event.stopPropagation()
  const root = rootEl.value
  if (!root) return
  const rect = root.getBoundingClientRect()
  resizeStart = { x: event.screenX, y: event.screenY, width: rect.width, height: rect.height }
  window.addEventListener('pointermove', onResizeMove)
}

function onResizeMove(event: PointerEvent): void {
  if (!resizeStart) return
  const width = Math.round(resizeStart.width + event.screenX - resizeStart.x)
  const height = Math.round(resizeStart.height + event.screenY - resizeStart.y)
  window.api.stealth.setSize(width, height)
}

function clearResize(): void {
  resizeStart = null
  window.removeEventListener('pointermove', onResizeMove)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
</script>

<template>
  <div
    ref="rootEl"
    class="stealth-root"
    @dblclick.self="exitStealth"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div ref="viewerEl" class="stealth-viewer" aria-hidden="true" />
    <div ref="textLayer" class="stealth-text" :style="{ fontSize: `${fontSize}px`, color: fallbackInk.color }" />

    <div class="stealth-toolbar no-drag" :class="{ visible: hovered }" :style="{ color: uiColor }">
      <button class="tool-button" type="button" title="隐藏（Esc / Ctrl+Shift+H）" @click="hideStealth">
        <AppIcon name="eye-off" :size="15" />
      </button>
      <button class="tool-button" type="button" title="退出摸鱼模式" @click="exitStealth">
        <AppIcon name="close" :size="15" />
      </button>
    </div>

    <div class="drag-strip drag" title="按住这里移动窗口">
      <span class="drag-grip" />
    </div>

    <div v-if="loading" class="stealth-loading" :style="{ color: fallbackInk.color }">正在展开…</div>
    <div v-else-if="loadError" class="stealth-loading" :style="{ color: fallbackInk.color }">这一页没有打开</div>

    <div class="resize-handle no-drag" title="拖动调整大小" @pointerdown="startResize" />

    <div class="stealth-hint" :class="{ visible: hintVisible }" :style="{ color: uiColor }">
      <span>← →</span> 翻页 <span>Esc</span> 隐藏 <span>拖动顶部</span> 移动 <span>S/M/L</span> 尺寸
    </div>
  </div>
</template>

<style scoped>
.stealth-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  user-select: none;
  cursor: default;
}

.stealth-viewer {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

.stealth-text {
  position: absolute;
  inset: 0;
  z-index: 3;
  padding: 30px 18px 16px;
  overflow: hidden;
  pointer-events: none;
  font-family: 'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', SimSun, serif;
  line-height: 1.76;
  white-space: pre;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}

.stealth-line {
  display: block;
  min-height: 1em;
  white-space: pre;
}

.stealth-ch {
  display: inline;
}

.stealth-toolbar {
  position: absolute;
  top: 4px;
  right: 8px;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 3px;
  border-radius: 7px;
  background: rgba(128, 128, 128, 0.24);
  opacity: 0.7;
  pointer-events: auto;
  transition: opacity 0.18s var(--ease);
  -webkit-app-region: no-drag;
}

.stealth-toolbar.visible {
  opacity: 1;
  pointer-events: auto;
}

.stealth-toolbar,
.stealth-toolbar * {
  -webkit-app-region: no-drag;
}

.tool-button {
  width: 26px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  font-size: 9px;
  letter-spacing: 0.02em;
  opacity: 0.85;
  pointer-events: auto;
}

.tool-button:hover {
  background: rgba(128, 128, 128, 0.2);
  opacity: 1;
}

.drag-strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 92px;
  height: 26px;
  z-index: 7;
  cursor: grab;
}

.drag-strip:active {
  cursor: grabbing;
}

.drag-grip {
  position: absolute;
  top: 8px;
  left: 50%;
  width: 26px;
  height: 3px;
  margin-left: -13px;
  border-radius: 2px;
  background: currentColor;
  color: #8a8a8a;
  opacity: 0.28;
}

.stealth-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  letter-spacing: 0.08em;
  z-index: 4;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 22px;
  height: 22px;
  z-index: 9;
  cursor: nwse-resize;
  opacity: 0.35;
  -webkit-app-region: no-drag;
}

.resize-handle:hover {
  opacity: 0.8;
}

.resize-handle::before,
.resize-handle::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  color: #8a8a8a;
}

.resize-handle::before {
  width: 11px;
  height: 11px;
}

.resize-handle::after {
  width: 6px;
  height: 6px;
}

.stealth-hint {
  position: absolute;
  right: 14px;
  bottom: 3px;
  font-size: 9px;
  letter-spacing: 0.04em;
  opacity: 0;
  transition: opacity 0.3s var(--ease);
  pointer-events: none;
  z-index: 5;
}

.stealth-hint.visible {
  opacity: 0.4;
}

.stealth-hint span {
  opacity: 0.72;
  margin: 0 2px;
}
</style>
