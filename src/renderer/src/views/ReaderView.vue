<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Book as EpubBook, NavItem, Rendition } from 'epubjs'
import type { Bookmark, ReaderSettings, ThemeMode } from '@shared/types'
import { defaultReaderSettings } from '@shared/defaults'
import AppIcon from '../components/AppIcon.vue'
import ReaderPanel from '../components/ReaderPanel.vue'
import ReaderSettingsPanel from '../components/ReaderSettingsPanel.vue'
import { collectTopAnchor, isAnchorAtTop, isAnchorVisible, type ReaderAnchor } from '../lib/anchor'
import { chapterLabelFor, flattenToc, loadBook, stripHash, toArrayBuffer, type FlatTocItem } from '../lib/epub'
import { readerFontStacks, readerPalette } from '../lib/theme'
import { errorMessage, toast } from '../lib/toast'
import { useAppStore } from '../stores/app'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const bookId = String(route.params.id ?? '')
const sourceBook = computed(() => store.bookById(bookId))

const viewerEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const loadError = ref('')
const epubBook = shallowRef<EpubBook | null>(null)
const rendition = shallowRef<Rendition | null>(null)
const toc = ref<FlatTocItem[]>([])
const chapterTitle = ref('')
const currentHref = ref('')
const percent = ref(0)
const anchor = ref<ReaderAnchor | null>(null)
const bookmarks = ref<Bookmark[]>([])
const panelOpen = ref(false)
const panelTab = ref<'toc' | 'bookmarks'>('toc')
const settingsOpen = ref(false)
const chromeVisible = ref(true)
const isFullscreen = ref(false)
const locationsReady = ref(false)
const draftReader = reactive<ReaderSettings>({ ...store.settings.reader })

const sessionActive = ref(true)
let resizeObserver: ResizeObserver | null = null
let resizeTimer: number | null = null
let hideTimer: number | null = null
let saveTimer: number | null = null
let anchorTimer: number | null = null
let applyingRemote = false
let isReflowing = false
let suppressAnchorUntil = 0
let pendingRemoteCfi = ''
let pendingRemote = false
let boundDocs = new WeakSet<Document>()

const bookTitle = computed(() => sourceBook.value?.title || '阅读')
const isBookmarked = computed(() => Boolean(anchor.value && bookmarks.value.some((item) => item.cfi === anchor.value?.cfi)))

watch(
  () => store.settings.reader,
  (value) => Object.assign(draftReader, value),
  { deep: true }
)

watch(
  () => store.theme,
  () => {
    applyReaderTheme()
  }
)

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('focus', onWindowFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('beforeunload', saveProgress)
  await openBook()
  installResizeObserver()
})

onBeforeUnmount(() => {
  sessionActive.value = false
  saveProgress()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('focus', onWindowFocus)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('beforeunload', saveProgress)
  resizeObserver?.disconnect()
  for (const timer of [resizeTimer, hideTimer, saveTimer, anchorTimer]) {
    if (timer) window.clearTimeout(timer)
  }
  try {
    rendition.value?.destroy()
    epubBook.value?.destroy()
  } catch {
    /* ignore */
  }
  delete window.__ebookTest
})

async function openBook(): Promise<void> {
  loading.value = true
  loadError.value = ''
  if (!sourceBook.value) {
    loadError.value = '这本书不在书架里，可能已被移除。'
    loading.value = false
    return
  }
  try {
    const bytes = await window.api.library.read(bookId)
    const book = loadBook(toArrayBuffer(bytes))
    epubBook.value = book
    await book.ready
    const navigation = await book.loaded.navigation
    toc.value = flattenToc(navigation.toc as NavItem[])
    const metadata = (await book.loaded.metadata) as { title?: string; creator?: string }
    document.title = `${metadata?.title || bookTitle.value} · Ebook Viewer`
    bookmarks.value = store.bookmarksFor(bookId)

    await nextTick()
    const el = viewerEl.value
    if (!el) throw new Error('阅读区域未准备好')
    const rect = el.getBoundingClientRect()
    const instance = book.renderTo(el, {
      width: Math.max(320, Math.round(rect.width)),
      height: Math.max(320, Math.round(rect.height)),
      flow: 'paginated',
      spread: 'none',
      minSpreadWidth: 0,
      allowScriptedContent: false
    })
    rendition.value = instance
    applyReaderTheme()

    const savedCfi = sourceBook.value.progress.cfi
    await instance.display(savedCfi || undefined)
    await wait(180)
    instance.on('relocated', onRelocated)
    bindIframeEvents()
    captureAnchor()
    updateFromLocation()
    loading.value = false
    installTestHooks()
    void generateLocations()
    scheduleChromeHide()
  } catch (error) {
    console.error('[reader] failed to open book', error)
    loadError.value = errorMessage(error)
    loading.value = false
  }
}

async function generateLocations(): Promise<void> {
  const book = epubBook.value
  if (!book) return
  try {
    await book.locations.generate(1200)
    locationsReady.value = true
    updateFromLocation()
  } catch (error) {
    console.warn('[reader] locations generation failed', error)
  }
}

function installResizeObserver(): void {
  resizeObserver?.disconnect()
  if (!viewerEl.value) return
  resizeObserver = new ResizeObserver(() => {
    if (loading.value || !rendition.value) return
    if (resizeTimer) window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null
      void restoreAfterResize()
    }, 200)
  })
  resizeObserver.observe(viewerEl.value)
}

async function restoreAfterResize(): Promise<void> {
  const instance = rendition.value
  if (!instance || !sessionActive.value) return
  const current = anchor.value
  const el = viewerEl.value
  if (!el) return
  const width = Math.max(320, Math.round(el.clientWidth))
  const height = Math.max(320, Math.round(el.clientHeight))
  isReflowing = true
  suppressAnchorUntil = Date.now() + 900
  try {
    // Numeric width/height keeps epub.js from running its own window-resize
    // pass; we pass the anchor CFI directly so the reflow lands on our page.
    const resizeWithAnchor = instance.resize as unknown as (width: number, height: number, cfi?: string) => void
    resizeWithAnchor(width, height, current?.cfi)
    await wait(260)
    if (current && !isAnchorAtTop(instance, current.cfi)) {
      try {
        await instance.display(current.cfi)
      } catch {
        /* ignore */
      }
      await wait(120)
    }
  } finally {
    isReflowing = false
  }
  bindIframeEvents()
  if (current) {
    anchor.value = current
    chapterTitle.value = chapterLabelFor(toc.value, current.href) || chapterTitle.value
    percent.value = current.percent
  } else {
    captureAnchor()
  }
  scheduleSave()
}

function onRelocated(): void {
  if (!sessionActive.value || applyingRemote || isReflowing) return
  if (Date.now() < suppressAnchorUntil) return
  updateFromLocation()
  bindIframeEvents()
  if (anchorTimer) window.clearTimeout(anchorTimer)
  anchorTimer = window.setTimeout(() => {
    anchorTimer = null
    if (isReflowing || Date.now() < suppressAnchorUntil) return
    captureAnchor()
    scheduleSave()
  }, 160)
}

function captureAnchor(): void {
  const instance = rendition.value
  if (!instance) return
  const top = collectTopAnchor(instance)
  if (!top) return
  const location = (instance.currentLocation() as any)?.start
  const percentValue = computePercent(top.cfi, location)
  top.href = location?.href ?? top.href
  top.percent = percentValue
  anchor.value = top
  chapterTitle.value = chapterLabelFor(toc.value, top.href) || bookTitle.value
  currentHref.value = top.href
  percent.value = percentValue
}

function updateFromLocation(): void {
  const instance = rendition.value
  if (!instance) return
  const location = (instance.currentLocation() as any)?.start
  if (!location) return
  currentHref.value = String(location.href ?? '')
  chapterTitle.value = chapterLabelFor(toc.value, currentHref.value) || bookTitle.value
  const sameChapter =
    anchor.value &&
    stripHash(anchor.value.href) === stripHash(currentHref.value) &&
    stripHash(currentHref.value) !== ''
  const cfiForPercent = sameChapter ? anchor.value!.cfi : String(location.cfi ?? '')
  percent.value = computePercent(cfiForPercent, location)
}

function computePercent(cfi: string, location: any): number {
  const book = epubBook.value
  if (!book) return percent.value
  if (locationsReady.value && cfi) {
    try {
      const value = book.locations.percentageFromCfi(cfi)
      if (Number.isFinite(value)) return clamp(value, 0, 1)
    } catch {
      /* ignore */
    }
  }
  const direct = Number(location?.percentage)
  if (Number.isFinite(direct) && direct > 0) return clamp(direct, 0, 1)
  const index = Number(location?.index ?? 0)
  const total = ((book.spine as any)?.spineItems?.length as number | undefined) ?? 1
  return clamp(index / Math.max(1, total), 0, 1)
}

function applyReaderTheme(): void {
  const instance = rendition.value
  if (!instance) return
  const palette = readerPalette(store.theme)
  const settings = store.settings.reader
  const rules: Record<string, Record<string, string>> = {
    html: { background: `${palette.background} !important` },
    body: {
      background: `${palette.background} !important`,
      color: `${palette.ink} !important`,
      'font-family': `${readerFontStacks[settings.font]} !important`,
      'font-size': `${settings.fontSize}px !important`,
      'line-height': `${settings.lineHeight} !important`,
      padding: `72px ${settings.margin}px 56px !important`,
      'text-align': settings.justify ? 'justify' : 'left',
      hyphens: 'auto',
      'box-sizing': 'border-box'
    },
    'p, li, blockquote, dd, dt': {
      color: `${palette.ink} !important`,
      'line-height': `${settings.lineHeight} !important`
    },
    'p': { margin: '0 0 0.7em !important' },
    'h1, h2, h3, h4, h5, h6': { color: `${palette.ink} !important`, 'line-height': '1.35 !important' },
    'a': { color: `${palette.link} !important` },
    'img, svg, video': { 'max-width': '100% !important', height: 'auto !important' },
    '::selection': { background: `${palette.selection} !important` }
  }
  try {
    instance.themes.register('reader', rules)
    instance.themes.select('reader')
  } catch (error) {
    console.warn('[reader] failed to apply theme', error)
  }
}

async function persistReader(): Promise<void> {
  const current = anchor.value
  isReflowing = true
  suppressAnchorUntil = Date.now() + 900
  try {
    await store.updateSettings({ reader: { ...draftReader } })
    const instance = rendition.value
    if (!instance) return
    applyReaderTheme()
    await wait(80)
    if (current) {
      try {
        await instance.display(current.cfi)
      } catch {
        /* ignore */
      }
      await wait(100)
      if (!isAnchorAtTop(instance, current.cfi)) {
        try {
          await instance.display(current.cfi)
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    isReflowing = false
  }
  const instance = rendition.value
  if (current) {
    anchor.value = current
    chapterTitle.value = chapterLabelFor(toc.value, current.href) || chapterTitle.value
    percent.value = computePercent(current.cfi, (instance?.currentLocation() as any)?.start)
  } else {
    captureAnchor()
  }
  scheduleSave()
}

async function resetReader(): Promise<void> {
  Object.assign(draftReader, defaultReaderSettings)
  await persistReader()
}

async function setTheme(mode: ThemeMode): Promise<void> {
  await store.updateSettings({ theme: mode })
}

async function toggleTheme(): Promise<void> {
  await setTheme(store.theme === 'dark' ? 'light' : 'dark')
}

async function nextPage(): Promise<void> {
  const instance = rendition.value
  if (!instance) return
  try {
    await instance.next()
  } catch (error) {
    console.warn('[reader] next page failed', error)
  }
}

async function prevPage(): Promise<void> {
  const instance = rendition.value
  if (!instance) return
  try {
    await instance.prev()
  } catch (error) {
    console.warn('[reader] prev page failed', error)
  }
}

async function goHref(href: string): Promise<void> {
  const instance = rendition.value
  if (!instance) return
  panelOpen.value = false
  anchor.value = null
  try {
    await instance.display(href)
  } catch (error) {
    try {
      await instance.display(epubBook.value?.canonical(href) ?? href)
    } catch {
      toast(`无法跳转到该章节：${errorMessage(error)}`, 'error')
    }
  }
}

async function goCfi(cfi: string): Promise<void> {
  const instance = rendition.value
  if (!instance) return
  panelOpen.value = false
  anchor.value = null
  try {
    await instance.display(cfi)
  } catch (error) {
    toast(`无法跳转到该位置：${errorMessage(error)}`, 'error')
  }
}

async function toggleBookmark(): Promise<void> {
  if (!anchor.value) return
  const existing = bookmarks.value.find((item) => item.cfi === anchor.value?.cfi)
  try {
    if (existing) {
      await store.removeBookmark(existing.id)
      bookmarks.value = bookmarks.value.filter((item) => item.id !== existing.id)
      toast('已删除书签')
      return
    }
    const snippet = anchor.value.sentence.slice(0, 20)
    const bookmark = await store.addBookmark({
      bookId,
      cfi: anchor.value.cfi,
      label: snippet || chapterTitle.value,
      chapter: chapterTitle.value,
      percent: percent.value
    })
    bookmarks.value = [bookmark, ...bookmarks.value]
    toast('已添加书签', 'success')
  } catch (error) {
    toast(`书签操作失败：${errorMessage(error)}`, 'error')
  }
}

async function removeBookmark(id: string): Promise<void> {
  try {
    await store.removeBookmark(id)
    bookmarks.value = bookmarks.value.filter((item) => item.id !== id)
  } catch (error) {
    toast(`删除书签失败：${errorMessage(error)}`, 'error')
  }
}

async function toggleStealth(): Promise<void> {
  if (store.stealthVisible) {
    window.api.stealth.hide()
    return
  }
  const cfi = anchor.value?.cfi || sourceBook.value?.progress.cfi || ''
  if (!cfi) {
    toast('先进入正文再打开摸鱼模式')
    return
  }
  const opened = await window.api.stealth.open({ bookId, cfi })
  if (!opened) toast('无法打开摸鱼窗口', 'error')
}

function toggleFullscreen(): void {
  isFullscreen.value = !isFullscreen.value
  window.api.window.setFullScreen(isFullscreen.value)
}

function openPanel(tab: 'toc' | 'bookmarks'): void {
  if (panelOpen.value && panelTab.value === tab) {
    panelOpen.value = false
    return
  }
  panelTab.value = tab
  panelOpen.value = true
  keepChrome()
}

function closePanels(): void {
  panelOpen.value = false
  settingsOpen.value = false
  scheduleChromeHide()
}

function onPointerMove(): void {
  showChrome()
}

function showChrome(): void {
  chromeVisible.value = true
  scheduleChromeHide()
}

function keepChrome(): void {
  chromeVisible.value = true
  if (hideTimer) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleChromeHide(): void {
  if (hideTimer) window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    hideTimer = null
    if (!panelOpen.value && !settingsOpen.value) chromeVisible.value = false
  }, 2800)
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return
  switch (event.key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      event.preventDefault()
      void nextPage()
      showChrome()
      break
    case 'ArrowLeft':
    case 'PageUp':
      event.preventDefault()
      void prevPage()
      showChrome()
      break
    case 'Escape':
      closePanels()
      break
    case 'F11':
      event.preventDefault()
      toggleFullscreen()
      break
    default:
      break
  }
}

function onWheel(event: WheelEvent): void {
  if (Math.abs(event.deltaY) < 16) return
  event.preventDefault()
  if (event.deltaY > 0) void nextPage()
  else void prevPage()
  showChrome()
}

function onIframeClick(): void {
  showChrome()
}

function bindIframeEvents(): void {
  const instance = rendition.value
  if (!instance) return
  const list = instance.getContents() as unknown as Array<{ document?: Document }>
  for (const item of list) {
    const doc = item?.document
    if (!doc || boundDocs.has(doc)) continue
    boundDocs.add(doc)
    doc.addEventListener('mousemove', onPointerMove, { passive: true })
    doc.addEventListener('keydown', onKeyDown)
    doc.addEventListener('wheel', onWheel, { passive: false })
    doc.addEventListener('click', onIframeClick)
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible' && pendingRemote) void applyRemote()
}

function onWindowFocus(): void {
  if (pendingRemote) void applyRemote()
}

async function applyRemote(): Promise<void> {
  const instance = rendition.value
  if (!instance || !pendingRemoteCfi) return
  const cfi = pendingRemoteCfi
  pendingRemoteCfi = ''
  pendingRemote = false
  applyingRemote = true
  try {
    await instance.display(cfi)
    await wait(120)
    captureAnchor()
    updateFromLocation()
  } catch (error) {
    console.warn('[reader] apply remote location failed', error)
  } finally {
    applyingRemote = false
  }
}

function scheduleSave(): void {
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    saveProgress()
  }, 500)
}

function saveProgress(): void {
  if (!anchor.value || !bookId) return
  const payload = {
    bookId,
    cfi: anchor.value.cfi,
    percent: percent.value,
    chapter: chapterTitle.value,
    sentence: anchor.value.sentence,
    source: 'main' as const
  }
  store.setLocalProgress(bookId, {
    cfi: payload.cfi,
    percent: payload.percent,
    chapter: payload.chapter,
    sentence: payload.sentence
  })
  void window.api.progress.set(payload)
}

function goBack(): void {
  saveProgress()
  void router.push('/')
}

function installTestHooks(): void {
  window.__ebookTest = {
    ready: () => !loading.value && Boolean(rendition.value),
    topSentence: () => collectTopAnchor(rendition.value)?.sentence ?? '',
    topCfi: () => collectTopAnchor(rendition.value)?.cfi ?? '',
    anchorCfi: () => anchor.value?.cfi ?? '',
    anchorVisible: () => (anchor.value ? isAnchorVisible(rendition.value, anchor.value.cfi) : false),
    currentCfi: () => ((rendition.value?.currentLocation() as any)?.start?.cfi ?? '') as string,
    chapter: () => chapterTitle.value,
    percent: () => percent.value,
    next: () => nextPage(),
    prev: () => prevPage(),
    goHref: (href: string) => goHref(href)
  }
}

const offRemoteProgress = window.api.events.onRemoteProgress((progress) => {
  if (progress.bookId !== bookId || progress.source === 'main') return
  pendingRemoteCfi = progress.cfi
  pendingRemote = true
  if (document.visibilityState === 'visible') void applyRemote()
})

onBeforeUnmount(() => offRemoteProgress())

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
</script>

<template>
  <div class="reader" @mousemove="onPointerMove" @mouseleave="scheduleChromeHide">
    <div ref="viewerEl" class="reader-viewer" />

    <div class="reader-top" :class="{ hidden: !chromeVisible }">
      <div class="top-left">
        <button class="chrome-button" type="button" title="返回书库" @click="goBack">
          <AppIcon name="arrow-left" :size="18" />
        </button>
        <div class="book-heading">
          <span class="book-name">{{ bookTitle }}</span>
          <span class="chapter-name">{{ chapterTitle }}</span>
        </div>
      </div>

      <div class="top-actions">
        <button class="chrome-button" :class="{ active: panelOpen && panelTab === 'toc' }" type="button" title="目录" @click="openPanel('toc')">
          <AppIcon name="list" :size="18" />
        </button>
        <button
          class="chrome-button"
          :class="{ active: panelOpen && panelTab === 'bookmarks' }"
          type="button"
          title="书签"
          @click="openPanel('bookmarks')"
        >
          <AppIcon name="bookmark" :size="17" />
          <span v-if="bookmarks.length" class="dot" />
        </button>
        <button class="chrome-button" :class="{ active: isBookmarked }" type="button" title="标记当前页" @click="toggleBookmark">
          <AppIcon name="bookmark-plus" :size="17" />
        </button>
        <span class="action-divider" />
        <button class="chrome-button" type="button" title="排版" @click="settingsOpen = true; keepChrome()">
          <AppIcon name="type" :size="18" />
        </button>
        <button class="chrome-button" type="button" :title="store.theme === 'dark' ? '明亮模式' : '暗黑模式'" @click="toggleTheme">
          <AppIcon :name="store.theme === 'dark' ? 'sun' : 'moon'" :size="17" />
        </button>
        <button class="chrome-button stealth-button" :class="{ active: store.stealthVisible }" type="button" title="摸鱼模式" @click="toggleStealth">
          <AppIcon name="ghost" :size="18" />
        </button>
        <button class="chrome-button" type="button" :title="isFullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen">
          <AppIcon :name="isFullscreen ? 'shrink' : 'expand'" :size="17" />
        </button>
      </div>
    </div>

    <button class="page-zone left" type="button" aria-label="上一页" @click="prevPage">
      <span class="zone-arrow"><AppIcon name="chevron-left" :size="22" /></span>
    </button>
    <button class="page-zone right" type="button" aria-label="下一页" @click="nextPage">
      <span class="zone-arrow"><AppIcon name="chevron-right" :size="22" /></span>
    </button>

    <div class="reader-bottom" :class="{ hidden: !chromeVisible }">
      <span class="bottom-chapter">{{ chapterTitle }}</span>
      <div class="bottom-progress">
        <span :style="{ width: `${Math.round(percent * 100)}%` }" />
      </div>
      <span class="bottom-percent">{{ (percent * 100).toFixed(1) }}%</span>
    </div>

    <Transition name="fade">
      <div v-if="loading" class="reader-loading">
        <span class="loading-rule" />
        <h2>{{ bookTitle }}</h2>
        <p>正在展开书页…</p>
      </div>
    </Transition>

    <div v-if="loadError" class="reader-error">
      <AppIcon name="book-open" :size="36" :stroke="1.2" />
      <h2>这本书打不开</h2>
      <p>{{ loadError }}</p>
      <button class="ghost-button" type="button" @click="goBack">回到书库</button>
    </div>

    <ReaderPanel
      :open="panelOpen"
      :tab="panelTab"
      :toc="toc"
      :bookmarks="bookmarks"
      :active-href="currentHref"
      :percent="percent"
      @close="closePanels"
      @update:tab="panelTab = $event"
      @select-href="goHref"
      @select-cfi="goCfi"
      @remove-bookmark="removeBookmark"
    />

    <ReaderSettingsPanel
      :open="settingsOpen"
      :draft="draftReader"
      :theme-mode="store.settings.theme"
      :app-theme="store.theme"
      @close="closePanels"
      @update="Object.assign(draftReader, $event)"
      @persist="persistReader"
      @theme="setTheme"
      @reset="resetReader"
    />
  </div>
</template>

<style scoped>
.reader {
  position: relative;
  height: 100%;
  background: var(--reader-bg);
  color: var(--reader-ink);
  overflow: hidden;
}

.reader-viewer {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.reader-viewer :deep(iframe) {
  border: 0;
}

.reader-top {
  position: absolute;
  z-index: 20;
  top: 0;
  left: 0;
  right: 0;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 18px;
  background: linear-gradient(to bottom, var(--reader-bg) 58%, transparent);
  transition: opacity 0.3s var(--ease), transform 0.3s var(--ease);
}

.reader-top.hidden {
  opacity: 0;
  transform: translateY(-10px);
  pointer-events: none;
}

.top-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.chrome-button {
  position: relative;
  width: 34px;
  height: 34px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--reader-ink);
  opacity: 0.72;
  transition: background 0.18s var(--ease), opacity 0.18s var(--ease), color 0.18s var(--ease);
}

.chrome-button:hover {
  opacity: 1;
  background: rgba(128, 120, 104, 0.14);
}

.chrome-button.active {
  opacity: 1;
  color: var(--accent);
}

.chrome-button .dot {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.book-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.book-name {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-name {
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.stealth-button {
  margin-left: 2px;
}

.action-divider {
  width: 1px;
  height: 16px;
  margin: 0 6px;
  background: rgba(128, 120, 104, 0.25);
}

.page-zone {
  position: absolute;
  top: 72px;
  bottom: 52px;
  width: 9%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--reader-ink);
  opacity: 0;
  transition: opacity 0.22s var(--ease);
}

.page-zone:hover {
  opacity: 0.32;
}

.page-zone.left {
  left: 0;
  justify-content: flex-start;
  padding-left: 12px;
}

.page-zone.right {
  right: 0;
  justify-content: flex-end;
  padding-right: 12px;
}

.zone-arrow {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(128, 120, 104, 0.12);
}

.reader-bottom {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  bottom: 0;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 24px;
  background: linear-gradient(to top, var(--reader-bg) 52%, transparent);
  transition: opacity 0.3s var(--ease), transform 0.3s var(--ease);
}

.reader-bottom.hidden {
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
}

.bottom-chapter {
  max-width: 36%;
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bottom-progress {
  flex: 1;
  height: 2px;
  border-radius: 2px;
  background: rgba(128, 120, 104, 0.2);
  overflow: hidden;
}

.bottom-progress span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.4s var(--ease);
}

.bottom-percent {
  font-size: 10.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.reader-loading {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--reader-bg);
}

.loading-rule {
  width: 56px;
  height: 2px;
  margin-bottom: 18px;
  background: linear-gradient(to right, transparent, var(--accent), transparent);
  animation: breathe 1.4s ease-in-out infinite;
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.25;
    transform: scaleX(0.7);
  }
  50% {
    opacity: 0.9;
    transform: scaleX(1);
  }
}

.reader-loading h2 {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
}

.reader-loading p {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.06em;
}

.reader-error {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--reader-bg);
  color: var(--ink);
}

.reader-error h2 {
  font-family: var(--font-display);
  font-size: 24px;
}

.reader-error p {
  max-width: 420px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.7;
  text-align: center;
}
</style>
