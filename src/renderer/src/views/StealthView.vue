<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Book as EpubBook, NavItem, Rendition } from 'epubjs'
import type { AppSettings, BgSample, StealthInitPayload } from '@shared/types'
import { defaultStealthSettings } from '@shared/defaults'
import { inkForBackground, type InkStyle } from '../lib/color'
import { collectTopAnchor } from '../lib/anchor'
import { chapterLabelFor, flattenToc, loadBook, toArrayBuffer } from '../lib/epub'
import { useAppStore } from '../stores/app'

const store = useAppStore()

const rootEl = ref<HTMLElement | null>(null)
const viewerEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const loadError = ref('')
const hintVisible = ref(true)

const epubBook = shallowRef<EpubBook | null>(null)
const rendition = shallowRef<Rendition | null>(null)
const toc = ref<{ href: string; label: string; level: number }[]>([])
const currentBookId = ref('')
const locationsReady = ref(false)
const settings = ref<AppSettings['stealth']>({ ...defaultStealthSettings })
const ink = ref<InkStyle>({
  color: 'rgba(40, 40, 40, 0.72)',
  shadow: '0 0 1px rgba(250, 248, 242, 0.6)',
  contrast: 3
})

let applyingRemote = false
let sendTimer: number | null = null
let hintTimer: number | null = null
let boundDocs = new WeakSet<Document>()
let offInit: (() => void) | null = null
let offBackground: (() => void) | null = null
let offRemote: (() => void) | null = null

onMounted(() => {
  document.body.classList.add('stealth-body')
  document.documentElement.style.background = 'transparent'
  applyFallbackInk()

  offInit = window.api.stealth.onInit((payload) => {
    void handleInit(payload)
  })
  offBackground = window.api.stealth.onBackground((sample) => {
    applyBackground(sample)
  })
  offRemote = window.api.events.onRemoteProgress((progress) => {
    if (progress.source === 'stealth' || progress.bookId !== currentBookId.value || !rendition.value) return
    void applyRemote(progress.cfi)
  })

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousemove', revealHint)
  window.addEventListener('pointerup', clearResize)
  window.api.stealth.ready()
  scheduleHintHide()
})

onBeforeUnmount(() => {
  sendProgress()
  offInit?.()
  offBackground?.()
  offRemote?.()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mousemove', revealHint)
  window.removeEventListener('pointerup', clearResize)
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
    ;(renditionInstance as any).hooks.content.register((contents: any) => {
      injectStyle(contents.document)
    })

    await renditionInstance.display(cfi || undefined)
    await wait(120)
    renditionInstance.on('relocated', onRelocated)
    bindIframeEvents()
    applyStyleEverywhere()
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
    applyStyleEverywhere()
  } catch (error) {
    console.warn('[stealth] display failed', error)
  }
}

function onRelocated(): void {
  applyStyleEverywhere()
  if (applyingRemote) return
  scheduleSend()
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
    sentence: top?.sentence ?? '',
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
    await wait(100)
    applyStyleEverywhere()
  } catch (error) {
    console.warn('[stealth] remote display failed', error)
  } finally {
    window.setTimeout(() => {
      applyingRemote = false
    }, 260)
  }
}

function applyFallbackInk(): void {
  const dark = store.theme === 'dark'
  ink.value = inkForBackground(
    dark ? { r: 20, g: 22, b: 26, luminance: 0.01 } : { r: 247, g: 243, b: 234, luminance: 0.89 },
    settings.value.opacity
  )
}

function applyBackground(sample: BgSample): void {
  ink.value = inkForBackground(sample, settings.value.opacity)
  applyStyleEverywhere()
}

function applyStyleEverywhere(): void {
  const instance = rendition.value
  if (!instance) return
  const list = instance.getContents() as unknown as Array<{ document?: Document }>
  for (const item of list) {
    if (item?.document) injectStyle(item.document)
  }
}

function injectStyle(doc: Document): void {
  if (!doc?.documentElement || !doc.head) return
  let style = doc.getElementById('stealth-style') as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = 'stealth-style'
    doc.head.appendChild(style)
  }
  const hideImages = settings.value.hideImages
  const fontSize = settings.value.fontSize
  style.textContent = `
    html, body { background: transparent !important; }
    html { color-scheme: light dark; }
    body {
      margin: 0 !important;
      padding: 12px 18px 10px !important;
      color: ${ink.value.color} !important;
      font-family: 'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', SimSun, serif !important;
      font-size: ${fontSize}px !important;
      line-height: 1.76 !important;
      text-align: left !important;
      overflow: hidden !important;
      -webkit-font-smoothing: antialiased;
    }
    body, body * {
      color: ${ink.value.color} !important;
      background-color: transparent !important;
      text-shadow: ${ink.value.shadow} !important;
      border-color: transparent !important;
    }
    p { margin: 0 0 0.55em !important; }
    h1, h2, h3, h4, h5, h6 { font-size: 1.05em !important; margin: 0 0 0.4em !important; }
    img, svg, video, figure, figcaption, table { display: ${hideImages ? 'none' : 'revert'} !important; }
    a { text-decoration: none !important; }
    ::selection { background: rgba(128, 128, 128, 0.18) !important; }
    ::-webkit-scrollbar { display: none !important; }
  `
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
    if (direction === 'next') await instance.next()
    else await instance.prev()
  } catch (error) {
    console.warn('[stealth] page turn failed', error)
  }
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
    topSentence: () => collectTopAnchor(rendition.value)?.sentence ?? '',
    cfi: () => ((rendition.value?.currentLocation() as any)?.start?.cfi ?? '') as string,
    next: () => page('next'),
    prev: () => page('prev'),
    ink: () => ink.value
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
  window.addEventListener('pointerdown', clearResize, { once: true })
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
  <div ref="rootEl" class="stealth-root" @dblclick.self="exitStealth">
    <div ref="viewerEl" class="stealth-viewer" />

    <div class="drag-strip drag" title="拖动移动" />

    <div v-if="loading" class="stealth-loading" :style="{ color: ink.color }">正在展开…</div>
    <div v-else-if="loadError" class="stealth-loading" :style="{ color: ink.color }">这一页没有打开</div>

    <div class="resize-handle" title="拖动调整大小" @pointerdown="startResize" />

    <div class="stealth-hint" :class="{ visible: hintVisible }" :style="{ color: ink.color }">
      <span>← →</span> 翻页 <span>Esc</span> 隐藏 <span>双击</span> 退出
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
  cursor: default;
}

.stealth-viewer {
  position: absolute;
  inset: 0;
  background: transparent;
}

.stealth-viewer :deep(iframe) {
  border: 0;
  background: transparent;
}

.drag-strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 12px;
  cursor: grab;
  z-index: 4;
}

.drag-strip:active {
  cursor: grabbing;
}

.stealth-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  letter-spacing: 0.08em;
  z-index: 3;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  z-index: 6;
  cursor: nwse-resize;
  opacity: 0;
}

.stealth-root:hover .resize-handle {
  opacity: 0.45;
}

.resize-handle::before {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  color: #7a7468;
}

.stealth-hint {
  position: absolute;
  right: 14px;
  bottom: 4px;
  font-size: 9.5px;
  letter-spacing: 0.04em;
  opacity: 0;
  transition: opacity 0.3s var(--ease);
  pointer-events: none;
  z-index: 5;
  background: transparent;
}

.stealth-hint.visible {
  opacity: 0.42;
}

.stealth-hint span {
  opacity: 0.72;
  margin: 0 2px;
}
</style>
