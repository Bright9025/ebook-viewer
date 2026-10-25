import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AppData, AppSettings, Book, Bookmark, ReadingProgress } from '../shared/types'
import { createDefaultData, mergeSettings } from '../shared/defaults'

export class Store {
  readonly dir: string
  readonly file: string
  readonly booksDir: string
  data: AppData = createDefaultData()
  private saveTimer: NodeJS.Timeout | null = null
  private saving: Promise<void> | null = null

  constructor(dir: string) {
    this.dir = dir
    this.file = join(dir, 'data.json')
    this.booksDir = join(dir, 'books')
  }

  async load(): Promise<void> {
    await fs.mkdir(this.booksDir, { recursive: true })
    if (!existsSync(this.file)) return
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppData>
      const defaults = createDefaultData()
      this.data = {
        books: Array.isArray(parsed.books) ? parsed.books.map(normalizeBook) : [],
        settings: mergeSettings(defaults.settings, parsed.settings ?? {}),
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : []
      }
    } catch (error) {
      console.error('[store] failed to read data.json:', error)
      try {
        await fs.copyFile(this.file, `${this.file}.broken-${Date.now()}`)
      } catch {
        /* ignore */
      }
    }
  }

  get settings(): AppSettings {
    return this.data.settings
  }

  get books(): Book[] {
    return this.data.books
  }

  book(id: string): Book | undefined {
    return this.data.books.find((book) => book.id === id)
  }

  async addBook(book: Book): Promise<void> {
    this.data.books = [book, ...this.data.books.filter((item) => item.id !== book.id)]
    await this.saveNow()
  }

  async removeBook(id: string): Promise<void> {
    const book = this.book(id)
    if (!book) return
    this.data.books = this.data.books.filter((item) => item.id !== id)
    this.data.bookmarks = this.data.bookmarks.filter((item) => item.bookId !== id)
    if (this.data.settings.lastBookId === id) this.data.settings.lastBookId = null
    try {
      await fs.rm(join(this.booksDir, book.fileName), { force: true })
    } catch (error) {
      console.warn('[store] failed to remove book file:', error)
    }
    await this.saveNow()
  }

  async touchBook(id: string): Promise<void> {
    const book = this.book(id)
    if (!book) return
    book.lastOpenedAt = Date.now()
    this.data.settings.lastBookId = id
    this.saveSoon()
  }

  updateProgress(id: string, progress: Partial<ReadingProgress>): void {
    const book = this.book(id)
    if (!book) return
    book.progress = {
      ...book.progress,
      ...progress,
      updatedAt: Date.now()
    }
    book.lastOpenedAt = Date.now()
    this.data.settings.lastBookId = id
    this.saveSoon()
  }

  bookmarksFor(bookId: string): Bookmark[] {
    return this.data.bookmarks
      .filter((bookmark) => bookmark.bookId === bookId)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async addBookmark(bookmark: Bookmark): Promise<void> {
    this.data.bookmarks = [bookmark, ...this.data.bookmarks.filter((item) => item.id !== bookmark.id)]
    await this.saveNow()
  }

  async removeBookmark(id: string): Promise<void> {
    this.data.bookmarks = this.data.bookmarks.filter((item) => item.id !== id)
    await this.saveNow()
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.data.settings = mergeSettings(this.data.settings, patch)
    await this.saveNow()
    return this.data.settings
  }

  saveSoon(delay = 250): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.saveNow()
    }, delay)
  }

  async saveNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.saving) await this.saving.catch(() => undefined)
    this.saving = (async () => {
      const tmp = `${this.file}.tmp`
      await fs.mkdir(this.dir, { recursive: true })
      await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      try {
        await fs.rename(tmp, this.file)
      } catch {
        await fs.copyFile(tmp, this.file)
        await fs.rm(tmp, { force: true })
      }
    })()
    try {
      await this.saving
    } finally {
      this.saving = null
    }
  }

  async flush(): Promise<void> {
    await this.saveNow()
  }
}

function normalizeBook(value: unknown): Book {
  const book = value as Partial<Book>
  return {
    id: String(book.id ?? ''),
    title: String(book.title ?? '未命名'),
    author: String(book.author ?? ''),
    cover: typeof book.cover === 'string' ? book.cover : '',
    fileName: String(book.fileName ?? ''),
    addedAt: Number(book.addedAt ?? Date.now()),
    lastOpenedAt: Number(book.lastOpenedAt ?? 0),
    progress: {
      cfi: String(book.progress?.cfi ?? ''),
      percent: Number(book.progress?.percent ?? 0),
      chapter: String(book.progress?.chapter ?? ''),
      sentence: String(book.progress?.sentence ?? ''),
      updatedAt: Number(book.progress?.updatedAt ?? 0)
    }
  }
}

let instance: Store | null = null

export function initStore(dir: string): Store {
  instance = new Store(dir)
  return instance
}

export function getStore(): Store {
  if (!instance) throw new Error('store not initialized')
  return instance
}
