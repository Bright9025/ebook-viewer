<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Book as EpubBook, NavItem, Rendition } from 'epubjs'
import type { Annotation, AnnotationColor, AnnotationStyle, Bookmark, ReaderSettings, ThemeMode } from '@shared/types'
import { defaultReaderSettings } from '@shared/defaults'
import AnnotationDialog from '../components/AnnotationDialog.vue'
import AppIcon from '../components/AppIcon.vue'
import ReaderPanel from '../components/ReaderPanel.vue'
import ReaderSettingsPanel from '../components/ReaderSettingsPanel.vue'
import SelectionMenu from '../components/SelectionMenu.vue'
import { collectTopAnchor, isAnchorAtTop, isAnchorVisible, type ReaderAnchor } from '../lib/anchor'
import { annotationColor } from '../lib/annotations'
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
const annotations = ref<Annotation[]>([])
const panelOpen = ref(false)
const panelTab = ref<'toc' | 'bookmarks' | 'annotations'>('toc')
const settingsOpen = ref(false)
const chromeVisible = ref(true)
const isFullscreen = ref(false)
const maximized = ref(false)
const exporting = ref(false)
const locationsReady = ref(false)
const draftReader = reactive<ReaderSettings>({ ...store.settings.reader })

const selectionMenu = ref<{ open: boolean; x: number; y: number; cfi: string; text: string }>({
  open: false,
  x: 0,
  y: 0,
  cfi: '',
  text: ''
})
const annotationDialogOpen = ref(false)
const annotationQuote = ref('')
const annotationNote = ref('')
const annotationColorValue = ref<AnnotationColor>('yellow')
const annotationStyleValue = ref<AnnotationStyle>('highlight')
const annotationCfi = ref('')
const annotationEditing = ref<Annotation | null>(null)
let wavyHighlights = new Map<string, { doc: Document; name: string; annotation: Annotation; range: Range }>()

let offMaximized: (() => void) | null = null

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
    if (rendition.value) refreshWavyAnnotations()
  }
)

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('focus', onWindowFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('scroll', onDocumentScroll, true)
  window.addEventListener('beforeunload', saveProgress)
  maximized.value = await window.api.window.isMaximized()
  offMaximized = window.api.window.onMaximized((value) => {
    maximized.value = value
    isFullscreen.value = value
  })
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
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('scroll', onDocumentScroll, true)
  window.removeEventListener('beforeunload', saveProgress)
  offMaximized?.()
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
    annotations.value = store.annotationsFor(bookId)

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
    await wait(260)
    applyAnnotations()
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
    // Keep `this` bound to the rendition: extracting the method loses it.
    ;(instance as unknown as { resize(width: number, height: number, cfi?: string): void }).resize(
      width,
      height,
      current?.cfi
    )
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
  refreshWavyAnnotations()
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
  refreshWavyAnnotations()
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
      padding: `72px ${settings.margin}px 80px !important`,
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
  closeSelectionMenu()
  try {
    await instance.next()
  } catch (error) {
    console.warn('[reader] next page failed', error)
  }
}

async function prevPage(): Promise<void> {
  const instance = rendition.value
  if (!instance) return
  closeSelectionMenu()
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
  closeSelectionMenu()
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
  closeSelectionMenu()
  try {
    await instance.display(cfi)
  } catch (error) {
    toast(`无法跳转到该位置：${errorMessage(error)}`, 'error')
  }
}

async function exportCurrentBook(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    await saveProgress()
    const path = await window.api.library.export(bookId)
    if (path) toast(`已导出带标注的 EPUB：${path}`, 'success')
  } catch (error) {
    toast(`导出失败：${errorMessage(error)}`, 'error')
  } finally {
    exporting.value = false
  }
}

async function toggleBookmark(): Promise<void> {  if (!anchor.value) return
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

function onIframeContextMenu(event: MouseEvent, contents: any): void {
  const selection = contents.window?.getSelection?.() as Selection | null
  if (!selection || selection.isCollapsed || !selection.rangeCount) return
  const text = selection.toString().replace(/\s+/g, ' ').trim()
  if (!text) return
  let cfi = ''
  try {
    cfi = contents.cfiFromRange(selection.getRangeAt(0)) as string
  } catch (error) {
    console.warn('[reader] cannot build selection cfi', error)
    return
  }
  if (!cfi) return
  event.preventDefault()
  event.stopPropagation()
  const frame = contents.window?.frameElement as HTMLIFrameElement | null
  if (!frame) return
  const frameRect = frame.getBoundingClientRect()
  const rangeRect = selection.getRangeAt(0).getBoundingClientRect()
  const menuWidth = 224
  const menuHeight = 238
  let x = frameRect.left + rangeRect.left
  let y = frameRect.top + rangeRect.bottom + 8
  x = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
  if (y + menuHeight > window.innerHeight - 8) {
    y = frameRect.top + rangeRect.top - menuHeight - 8
  }
  y = Math.max(8, y)
  selectionMenu.value = { open: true, x, y, cfi, text }
  keepChrome()
}

function closeSelectionMenu(): void {
  if (selectionMenu.value.open) selectionMenu.value.open = false
}

function clearTextSelection(): void {
  const instance = rendition.value
  if (!instance) return
  const list = instance.getContents() as unknown as Array<{ window?: Window }>
  for (const contents of list) {
    try {
      contents.window?.getSelection()?.removeAllRanges()
    } catch {
      /* ignore */
    }
  }
}

function onDocumentMouseDown(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('.selection-menu')) return
  closeSelectionMenu()
}

function onDocumentScroll(): void {
  closeSelectionMenu()
}

function copySelection(): void {
  const text = selectionMenu.value.text
  if (!text) return
  window.api.app.copyText(text)
  closeSelectionMenu()
  clearTextSelection()
  toast('已复制选中文字', 'success')
}

async function annotateSelection(color: AnnotationColor, style: AnnotationStyle): Promise<void> {
  const selection = selectionMenu.value
  if (!selection.open || !selection.cfi) return
  closeSelectionMenu()
  clearTextSelection()
  try {
    const annotation = await store.addAnnotation({
      bookId,
      cfi: selection.cfi,
      text: selection.text,
      note: '',
      color,
      style,
      chapter: chapterTitle.value,
      percent: percent.value
    })
    annotations.value = [annotation, ...annotations.value]
    applyAnnotations()
    toast(style === 'highlight' ? '已添加高亮' : style === 'underline' ? '已添加下划线' : '已添加下波浪线', 'success')
  } catch (error) {
    toast(`标注失败：${errorMessage(error)}`, 'error')
  }
}

function openNoteDialog(): void {
  const selection = selectionMenu.value
  if (!selection.open) return
  annotationEditing.value = null
  annotationCfi.value = selection.cfi
  annotationQuote.value = selection.text
  annotationNote.value = ''
  annotationColorValue.value = 'yellow'
  annotationStyleValue.value = 'highlight'
  closeSelectionMenu()
  clearTextSelection()
  annotationDialogOpen.value = true
  keepChrome()
}

function editAnnotation(annotation: Annotation): void {
  annotationEditing.value = annotation
  annotationCfi.value = annotation.cfi
  annotationQuote.value = annotation.text
  annotationNote.value = annotation.note
  annotationColorValue.value = annotation.color
  annotationStyleValue.value = annotation.style
  annotationDialogOpen.value = true
  keepChrome()
}

async function saveAnnotation(payload: { note: string; color: AnnotationColor; style: AnnotationStyle }): Promise<void> {
  try {
    if (annotationEditing.value) {
      const updated = await store.updateAnnotation(annotationEditing.value.id, payload)
      annotations.value = annotations.value.map((item) => (item.id === updated.id ? updated : item))
      applyAnnotations()
      toast('标注已更新', 'success')
    } else {
      const annotation = await store.addAnnotation({
        bookId,
        cfi: annotationCfi.value,
        text: annotationQuote.value,
        note: payload.note,
        color: payload.color,
        style: payload.style,
        chapter: chapterTitle.value,
        percent: percent.value
      })
      annotations.value = [annotation, ...annotations.value]
      applyAnnotations()
      toast(payload.note ? '已保存标注' : '已添加标注', 'success')
    }
    annotationDialogOpen.value = false
    annotationEditing.value = null
  } catch (error) {
    toast(`保存标注失败：${errorMessage(error)}`, 'error')
  }
}

async function removeAnnotation(id: string): Promise<void> {
  const annotation = annotations.value.find((item) => item.id === id)
  if (!annotation) return
  try {
    await store.removeAnnotation(id)
    annotations.value = annotations.value.filter((item) => item.id !== id)
    applyAnnotations()
    if (annotationEditing.value?.id === id) {
      annotationDialogOpen.value = false
      annotationEditing.value = null
    }
    toast('已删除标注')
  } catch (error) {
    toast(`删除标注失败：${errorMessage(error)}`, 'error')
  }
}

function applyAnnotation(annotation: Annotation): void {
  const instance = rendition.value as any
  if (!instance?.annotations) return
  try {
    instance.annotations.remove(annotation.cfi, 'highlight')
    instance.annotations.remove(annotation.cfi, 'underline')
  } catch {
    /* ignore */
  }
  if (annotation.style === 'none') return
  if (annotation.style === 'wavy' || annotation.style === 'underline' || annotation.style === 'highlight') {
    applyWavyAnnotation(annotation)
    return
  }
}

function applyWavyAnnotation(annotation: Annotation): void {
  const instance = rendition.value as any
  const list = (instance?.getContents?.() ?? []) as any[]
  for (const contents of list) {
    const base = String(contents?.cfiBase ?? '')
    if (base && !annotation.cfi.startsWith(`epubcfi(${base}!`)) continue
    const doc = contents.document as Document | undefined
    const win = contents.window as any
    const registry = win?.CSS?.highlights
    const HighlightCtor = win?.Highlight
    if (!doc || !registry || !HighlightCtor) continue
    let range: Range | null = null
    try {
      range = contents.range(annotation.cfi)
    } catch {
      range = null
    }
    if (!range || range.collapsed) continue
    const name = `reader-${annotation.id.replace(/[^a-zA-Z0-9]/g, '')}`
    let style = doc.getElementById('reader-annotation-highlights') as HTMLStyleElement | null
    if (!style) {
      style = doc.createElement('style')
      style.id = 'reader-annotation-highlights'
      doc.head.appendChild(style)
    }
    const color = annotationColor(annotation.color)
    const decorationColor =
      annotation.color === 'black' && store.theme === 'dark' ? '#dedad2' : color.swatch
    const highlight = annotation.style === 'highlight'
    style.textContent += `::highlight(${name}) {
      ${highlight ? `background-color: ${color.swatch}66;` : `text-decoration-line: underline;
      text-decoration-style: ${annotation.style === 'wavy' ? 'wavy' : 'solid'};
      text-decoration-color: ${decorationColor};
      text-decoration-thickness: 1.6px;
      text-underline-offset: 3px;`}
    }\n`
    try {
      registry.set(name, new HighlightCtor(range))
      wavyHighlights.set(name, { doc, name, annotation, range })
    } catch (error) {
      console.warn('[reader] failed to render wavy annotation', error)
    }
    return
  }
}

function clearWavyHighlights(): void {
  for (const item of wavyHighlights.values()) {
    try {
      const registry = (item.doc.defaultView as any)?.CSS?.highlights
      registry?.delete(item.name)
    } catch {
      /* ignore */
    }
  }
  wavyHighlights = new Map()
  const instance = rendition.value as any
  const list = (instance?.getContents?.() ?? []) as any[]
  for (const contents of list) {
    contents.document?.getElementById('reader-annotation-highlights')?.remove()
  }
}

function applyAnnotations(): void {
  clearWavyHighlights()
  for (const annotation of annotations.value) applyAnnotation(annotation)
}

function refreshWavyAnnotations(): void {
  clearWavyHighlights()
  for (const annotation of annotations.value) {
    if (annotation.style !== 'none') applyWavyAnnotation(annotation)
  }
}

function findWavyAnnotation(doc: Document, x: number, y: number): Annotation | null {
  const caret = doc.caretRangeFromPoint?.(x, y)
  if (!caret) return null
  for (const item of wavyHighlights.values()) {
    if (item.doc !== doc) continue
    try {
      const inVisualRange = [...item.range.getClientRects()].some(
        (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom + 4
      )
      if (!inVisualRange) continue
      if (item.range.isPointInRange(caret.startContainer, caret.startOffset)) {
        return item.annotation
      }
    } catch {
      /* ignore */
    }
  }
  return null
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

function minimizeWindow(): void {
  window.api.window.minimize()
}

function toggleMaximizeWindow(): void {
  window.api.window.toggleMaximize()
}

function closeWindow(): void {
  saveProgress()
  window.api.window.close()
}

function openPanel(tab: 'toc' | 'bookmarks' | 'annotations'): void {
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
      closeSelectionMenu()
      if (annotationDialogOpen.value) {
        annotationDialogOpen.value = false
        annotationEditing.value = null
        break
      }
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

function onIframeClick(event?: MouseEvent, contents?: any): void {
  if (event && contents?.document) {
    const annotation = findWavyAnnotation(contents.document, event.clientX, event.clientY)
    if (annotation) {
      event.stopPropagation()
      editAnnotation(annotation)
      return
    }
  }
  closeSelectionMenu()
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
    doc.documentElement.spellcheck = false
    doc.body.spellcheck = false
    doc.addEventListener('mousemove', onPointerMove, { passive: true })
    doc.addEventListener('keydown', onKeyDown)
    doc.addEventListener('wheel', onWheel, { passive: false })
    doc.addEventListener('click', (event) => onIframeClick(event, item))
    doc.addEventListener('contextmenu', (event) => onIframeContextMenu(event, item))
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

async function saveProgress(): Promise<void> {
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
  await window.api.progress.set(payload)
}

async function goBack(): Promise<void> {
  try {
    await saveProgress()
  } catch {
    /* navigation should not be blocked by a progress write failure */
  }
  void router.push('/')
}

function installTestHooks(): void {
  window.__ebookTest = {
    ready: () => !loading.value && Boolean(rendition.value),
    topSentence: () => collectTopAnchor(rendition.value)?.sentence ?? '',
    topCfi: () => collectTopAnchor(rendition.value)?.cfi ?? '',
    anchorCfi: () => anchor.value?.cfi ?? '',
    anchorVisible: () => (anchor.value ? isAnchorVisible(rendition.value, anchor.value.cfi) : false),
    layout: () => {
      const instance = rendition.value as any
      const iframe = viewerEl.value?.querySelector('iframe') as HTMLIFrameElement | null
      return {
        settings: instance ? { width: instance.settings?.width, height: instance.settings?.height } : null,
        viewer: viewerEl.value ? [viewerEl.value.clientWidth, viewerEl.value.clientHeight] : null,
        iframe: iframe ? [iframe.getBoundingClientRect().width, iframe.getBoundingClientRect().height] : null
      }
    },
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
        <button
          class="chrome-button"
          :class="{ active: panelOpen && panelTab === 'annotations' }"
          type="button"
          title="标注"
          @click="openPanel('annotations')"
        >
          <AppIcon name="highlighter" :size="17" />
          <span v-if="annotations.length" class="dot" />
        </button>
        <button class="chrome-button reader-optional" :class="{ active: isBookmarked }" type="button" title="标记当前页" @click="toggleBookmark">
          <AppIcon name="bookmark-plus" :size="17" />
        </button>
        <button
          class="chrome-button reader-optional"
          type="button"
          :title="exporting ? '正在导出…' : '导出含标注的 EPUB'"
          :disabled="exporting"
          @click="exportCurrentBook"
        >
          <AppIcon name="download" :size="17" />
        </button>
        <span class="action-divider" />
        <button class="chrome-button" type="button" title="排版" @click="settingsOpen = true; keepChrome()">
          <AppIcon name="type" :size="18" />
        </button>
        <button class="chrome-button reader-optional" type="button" :title="store.theme === 'dark' ? '明亮模式' : '暗黑模式'" @click="toggleTheme">
          <AppIcon :name="store.theme === 'dark' ? 'sun' : 'moon'" :size="17" />
        </button>
        <button class="chrome-button stealth-button" :class="{ active: store.stealthVisible }" type="button" title="摸鱼模式" @click="toggleStealth">
          <AppIcon name="ghost" :size="18" />
        </button>
        <button class="chrome-button reader-optional" type="button" :title="isFullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen">
          <AppIcon :name="isFullscreen ? 'shrink' : 'expand'" :size="17" />
        </button>
        <span class="action-divider" />
        <button class="chrome-button" type="button" title="最小化" @click="minimizeWindow">
          <AppIcon name="minus" :size="17" />
        </button>
        <button class="chrome-button" type="button" :title="maximized ? '还原' : '最大化'" @click="toggleMaximizeWindow">
          <AppIcon :name="maximized ? 'restore' : 'maximize'" :size="14" />
        </button>
        <button class="chrome-button window-close" type="button" title="关闭到托盘" @click="closeWindow">
          <AppIcon name="close" :size="17" />
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
      :annotations="annotations"
      :active-href="currentHref"
      :percent="percent"
      @close="closePanels"
      @update:tab="panelTab = $event"
      @select-href="goHref"
      @select-cfi="goCfi"
      @remove-bookmark="removeBookmark"
      @remove-annotation="removeAnnotation"
    />

    <SelectionMenu
      :open="selectionMenu.open"
      :x="selectionMenu.x"
      :y="selectionMenu.y"
      @copy="copySelection"
      @annotate="annotateSelection"
      @note="openNoteDialog"
      @close="closeSelectionMenu"
    />

    <AnnotationDialog
      :open="annotationDialogOpen"
      :quote="annotationQuote"
      :note="annotationNote"
      :color="annotationColorValue"
      :mark-style="annotationStyleValue"
      :editing="Boolean(annotationEditing)"
      @save="saveAnnotation"
      @remove="annotationEditing && removeAnnotation(annotationEditing.id)"
      @close="annotationDialogOpen = false; annotationEditing = null"
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

.chrome-button.window-close:hover {
  background: #c7392c;
  color: #fff;
  opacity: 1;
}

@media (max-width: 860px) {
  .reader-optional {
    display: none;
  }
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
