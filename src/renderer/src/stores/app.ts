import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { defaultSettings } from '@shared/defaults'
import type {
  AppSettings,
  AppTheme,
  Book,
  Bookmark,
  ProgressPayload,
  ReadingProgress
} from '@shared/types'
import { appBackground } from '../lib/theme'

export const useAppStore = defineStore('app', () => {
  const books = ref<Book[]>([])
  const settings = ref<AppSettings>(JSON.parse(JSON.stringify(defaultSettings)) as AppSettings)
  const bookmarks = ref<Bookmark[]>([])
  const ready = ref(false)
  const stealthVisible = ref(false)

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(media.matches)
  media.addEventListener('change', (event) => {
    systemDark.value = event.matches
  })

  const theme = computed<AppTheme>(() =>
    settings.value.theme === 'system' ? (systemDark.value ? 'dark' : 'light') : settings.value.theme
  )

  const lastBook = computed(() => {
    const id = settings.value.lastBookId
    return books.value.find((book) => book.id === id) ?? books.value[0] ?? null
  })

  let initPromise: Promise<void> | null = null

  watch(theme, applyTheme, { immediate: true })

  function applyTheme(): void {
    document.documentElement.dataset.theme = theme.value
    document.documentElement.style.colorScheme = theme.value
    if (!window.location.hash.startsWith('#/stealth')) {
      window.api.window.setBackground(appBackground(theme.value))
    }
  }

  async function init(): Promise<void> {
    if (ready.value) return
    if (!initPromise) {
      initPromise = (async () => {
        const data = await window.api.library.list()
        books.value = data.books
        settings.value = data.settings
        bookmarks.value = data.bookmarks
        ready.value = true
        applyTheme()
        window.api.setNativeTheme(settings.value.theme)
        window.api.events.onSettingsChanged((next) => {
          settings.value = next
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
    window.api.setNativeTheme(next.theme)
    applyTheme()
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

  function bookById(id: string): Book | undefined {
    return books.value.find((book) => book.id === id)
  }

  return {
    books,
    settings,
    bookmarks,
    ready,
    stealthVisible,
    theme,
    lastBook,
    init,
    updateSettings,
    applyProgress,
    setLocalProgress,
    addBookLocal,
    removeBookLocal,
    touchLocal,
    bookmarksFor,
    addBookmark,
    removeBookmark,
    bookById
  }
})
