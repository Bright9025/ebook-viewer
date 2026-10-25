export type ThemeMode = 'light' | 'dark' | 'system'
export type AppTheme = 'light' | 'dark'
export type ReaderFont = 'serif' | 'song' | 'kai' | 'sans'

export interface ReadingProgress {
  cfi: string
  percent: number
  chapter: string
  sentence: string
  updatedAt: number
}

export interface Book {
  id: string
  title: string
  author: string
  cover: string
  fileName: string
  addedAt: number
  lastOpenedAt: number
  progress: ReadingProgress
}

export interface Bookmark {
  id: string
  bookId: string
  cfi: string
  label: string
  chapter: string
  percent: number
  createdAt: number
}

export interface ReaderSettings {
  font: ReaderFont
  fontSize: number
  lineHeight: number
  margin: number
  justify: boolean
}

export interface StealthSettings {
  opacity: number
  hideImages: boolean
  width: number
  height: number
  x: number | null
  y: number | null
  fontSize: number
}

export interface HotkeySettings {
  boss: string
  stealth: string
}

export interface AppSettings {
  theme: ThemeMode
  reader: ReaderSettings
  stealth: StealthSettings
  hotkeys: HotkeySettings
  lastBookId: string | null
}

export interface AppData {
  books: Book[]
  settings: AppSettings
  bookmarks: Bookmark[]
}

export interface ImportRequest {
  sourcePath: string
  title: string
  author: string
  cover: string
}

export interface BgSample {
  r: number
  g: number
  b: number
  luminance: number
}

export interface UnderlayCapture {
  dataUrl: string
  width: number
  height: number
  windowWidth: number
  windowHeight: number
  offsetX: number
  offsetY: number
}

export interface ProgressPayload {
  bookId: string
  cfi: string
  percent: number
  chapter: string
  sentence: string
  source: 'main' | 'stealth'
}

export interface StealthContextPayload {
  bookId: string
  cfi: string
}

export interface StealthInitPayload {
  book: Book
  cfi: string
  settings: AppSettings
}

export interface InitData {
  books: Book[]
  settings: AppSettings
  bookmarks: Bookmark[]
}

export interface HotkeyStatus {
  boss: boolean
  stealth: boolean
  error?: string
}
