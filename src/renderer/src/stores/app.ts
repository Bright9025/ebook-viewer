import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { defaultSettings } from '@shared/defaults'
import type {
  Annotation,
  AnnotationColor,
  AnnotationStyle,
  AppSettings,
  AppTheme,
  Book,
  Bookmark,
  ProgressPayload,
  ReadingProgress,
  ThemeMode
} from '@shared/types'
import { appBackground } from '../lib/theme'
import { isNight } from '../lib/solar'

export const useAppStore = defineStore('app', () => {
  const books = ref<Book[]>([])
  const settings = ref<AppSettings>(JSON.parse(JSON.stringify(defaultSettings)) as AppSettings)
  const bookmarks = ref<Bookmark[]>([])
  const annotations = ref<Annotation[]>([])
  const ready = ref(false)
  const stealthVisible = ref(false)

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(media.matches)
  media.addEventListener('change', (event) => {
    systemDark.value = event.matches
  })

  const autoDark = ref(isNight(new Date(), null, null))
  const autoCoords = ref<{ latitude: number; longitude: number } | null>(null)
  let autoTimer: number | null = null
  let geoRequested = false

  const theme = computed<AppTheme>(() => {
    if (settings.value.theme === 'system') return systemDark.value ? 'dark' : 'light'
    if (settings.value.theme === 'auto') return autoDark.value ? 'dark' : 'light'
    return settings.value.theme
  })

  const lastBook = computed(() => {
    const id = settings.value.lastBookId
    return books.value.find((book) => book.id === id) ?? books.value[0] ?? null
  })

  let initPromise: Promise<void> | null = null

  watch(theme, applyTheme, { immediate: true })

  function updateAutoTheme(): void {
    autoDark.value = isNight(new Date(), autoCoords.value?.latitude ?? null, autoCoords.value?.longitude ?? null)
  }

  function startAutoClock(): void {
    if (autoTimer != null) return
    autoTimer = window.setInterval(() => {
      if (settings.value.theme === 'auto') updateAutoTheme()
    }, 60_000)
  }

  function requestAutoLocation(): void {
    if (geoRequested || !navigator.geolocation) return
    geoRequested = true
    navigator.geolocation.getCurrentPosition(
      (position) => {
        autoCoords.value = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }
        updateAutoTheme()
      },
      () => {
        // Location can be denied; the local 06:00/18:00 fallback remains active.
      },
      { maximumAge: 86_400_000, timeout: 8_000 }
    )
  }

  function applyTheme(): void {
    document.documentElement.dataset.theme = theme.value
    document.documentElement.style.colorScheme = theme.value
    if (!window.location.hash.startsWith('#/stealth')) {
      window.api.window.setBackground(appBackground(theme.value))
    }
  }

  function syncCustomFonts(): void {
    let style = document.getElementById('ebook-custom-fonts') as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = 'ebook-custom-fonts'
      document.head.appendChild(style)
    }
    style.textContent = settings.value.customFonts
      .map(
        (font) =>
          `@font-face { font-family: "${font.family}"; src: url("app-font://font/${font.fileName}"); font-display: swap; }`
      )
      .join('\n')
  }

  async function init(): Promise<void> {
    if (ready.value) return
    if (!initPromise) {
      initPromise = (async () => {
        const data = await window.api.library.list()
        books.value = data.books
        settings.value = data.settings
        bookmarks.value = data.bookmarks
        annotations.value = data.annotations
        ready.value = true
        applyTheme()
        syncCustomFonts()
        startAutoClock()
        if (settings.value.theme === 'auto') requestAutoLocation()
        window.api.setNativeTheme(theme.value)
        window.api.events.onSettingsChanged((next) => {
          settings.value = next
          if (next.theme === 'auto') {
            requestAutoLocation()
            startAutoClock()
            updateAutoTheme()
          }
          applyTheme()
          syncCustomFonts()
        })
        window.api.events.onRemoteProgress((progress) => {
          applyProgress(progress)
        })
        window.api.events.onStealthVisibility((visible) => {
          stealthVisible.value = visible
        })
      })()
    }
    await initPromise
  }

  async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
    const next = await window.api.settings.set(patch)
    settings.value = next
    if (next.theme === 'auto') {
      requestAutoLocation()
      startAutoClock()
      updateAutoTheme()
    }
    applyTheme()
    syncCustomFonts()
    window.api.setNativeTheme(theme.value)
  }

  async function cycleTheme(): Promise<void> {
    const current = settings.value.theme
    let next: ThemeMode
    if (current === 'auto') next = 'light'
    else if (current === 'dark') next = 'auto'
    else if (current === 'light') next = 'dark'
    else next = theme.value === 'dark' ? 'auto' : 'dark'
    await updateSettings({ theme: next })
  }

  function applyProgress(progress: ProgressPayload): void {
    const book = books.value.find((item) => item.id === progress.bookId)
    if (!book) return
    book.progress = {
      cfi: progress.cfi,
      percent: progress.percent,
      chapter: progress.chapter,
      sentence: progress.sentence,
      updatedAt: Date.now()
    }
    book.lastOpenedAt = Date.now()
    settings.value.lastBookId = progress.bookId
  }

  function setLocalProgress(bookId: string, progress: Partial<ReadingProgress>): void {
    const book = books.value.find((item) => item.id === bookId)
    if (!book) return
    book.progress = { ...book.progress, ...progress, updatedAt: Date.now() }
    book.lastOpenedAt = Date.now()
    settings.value.lastBookId = bookId
  }

  function addBookLocal(book: Book): void {
    books.value = [book, ...books.value.filter((item) => item.id !== book.id)]
  }

  function removeBookLocal(id: string): void {
    books.value = books.value.filter((item) => item.id !== id)
    bookmarks.value = bookmarks.value.filter((item) => item.bookId !== id)
    annotations.value = annotations.value.filter((item) => item.bookId !== id)
    if (settings.value.lastBookId === id) settings.value.lastBookId = books.value[0]?.id ?? null
  }

  function touchLocal(id: string): void {
    const book = books.value.find((item) => item.id === id)
    if (!book) return
    book.lastOpenedAt = Date.now()
    settings.value.lastBookId = id
  }

  function bookmarksFor(bookId: string): Bookmark[] {
    return bookmarks.value
      .filter((bookmark) => bookmark.bookId === bookId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async function addBookmark(input: Omit<Bookmark, 'id' | 'createdAt'>): Promise<Bookmark> {
    const bookmark = await window.api.bookmarks.add(input)
    bookmarks.value = [bookmark, ...bookmarks.value]
    return bookmark
  }

  async function removeBookmark(id: string): Promise<void> {
    await window.api.bookmarks.remove(id)
    bookmarks.value = bookmarks.value.filter((bookmark) => bookmark.id !== id)
  }

  function annotationsFor(bookId: string): Annotation[] {
    return annotations.value
      .filter((annotation) => annotation.bookId === bookId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async function addAnnotation(
    input: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Annotation> {
    const annotation = await window.api.annotations.add(input)
    annotations.value = [annotation, ...annotations.value]
    return annotation
  }

  async function updateAnnotation(
    id: string,
    patch: { note?: string; color?: AnnotationColor; style?: AnnotationStyle }
  ): Promise<Annotation> {
    const annotation = await window.api.annotations.update(id, patch)
    annotations.value = annotations.value.map((item) => (item.id === id ? annotation : item))
    return annotation
  }

  async function removeAnnotation(id: string): Promise<void> {
    await window.api.annotations.remove(id)
    annotations.value = annotations.value.filter((annotation) => annotation.id !== id)
  }

  async function refreshReadingData(): Promise<void> {
    const data = await window.api.library.list()
    books.value = data.books
    bookmarks.value = data.bookmarks
    annotations.value = data.annotations
  }

  function bookById(id: string): Book | undefined {
    return books.value.find((book) => book.id === id)
  }

  return {
    books,
    settings,
    bookmarks,
    annotations,
    ready,
    stealthVisible,
    theme,
    lastBook,
    init,
    updateSettings,
    cycleTheme,
    applyProgress,
    setLocalProgress,
    addBookLocal,
    refreshReadingData,
    removeBookLocal,
    touchLocal,
    bookmarksFor,
    addBookmark,
    removeBookmark,
    annotationsFor,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    bookById
  }
})
