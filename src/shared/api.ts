import type {
  AppSettings,
  Book,
  Bookmark,
  BgSample,
  HotkeyStatus,
  ImportRequest,
  InitData,
  ProgressPayload,
  ReadingProgress,
  StealthContextPayload,
  StealthInitPayload,
  ThemeMode
} from './types'

export interface LibraryApi {
  list(): Promise<InitData>
  pick(): Promise<string[]>
  add(request: ImportRequest): Promise<Book>
  remove(id: string): Promise<void>
  read(id: string): Promise<Uint8Array>
  readPath(path: string): Promise<Uint8Array>
  touch(id: string): Promise<void>
}

export interface SettingsApi {
  set(patch: Partial<AppSettings>): Promise<AppSettings>
}

export interface ProgressApi {
  set(progress: ProgressPayload): Promise<void>
}

export interface BookmarksApi {
  list(bookId: string): Promise<Bookmark[]>
  add(input: Omit<Bookmark, 'id' | 'createdAt'>): Promise<Bookmark>
  remove(id: string): Promise<void>
}

export interface WindowApi {
  minimize(): void
  toggleMaximize(): void
  isMaximized(): Promise<boolean>
  close(): void
  setFullScreen(value: boolean): void
  setBackground(color: string): void
  onMaximized(callback: (maximized: boolean) => void): () => void
}

export interface StealthApi {
  open(context: StealthContextPayload): Promise<boolean>
  hide(): void
  close(): void
  setSize(width: number, height: number): void
  context(): Promise<StealthContextPayload | null>
  ready(): void
  sendProgress(progress: ProgressPayload): void
  onInit(callback: (payload: StealthInitPayload) => void): () => void
  onBackground(callback: (sample: BgSample) => void): () => void
}

export interface AppApi {
  version(): Promise<string>
  showMain(): void
  quit(): void
  captureScreen(): Promise<string>
}

export interface EventsApi {
  onRemoteProgress(callback: (progress: ProgressPayload) => void): () => void
  onSettingsChanged(callback: (settings: AppSettings) => void): () => void
  onHotkeys(callback: (status: HotkeyStatus) => void): () => void
  onStealthVisibility(callback: (visible: boolean) => void): () => void
}

export interface Api {
  library: LibraryApi
  settings: SettingsApi
  progress: ProgressApi
  bookmarks: BookmarksApi
  window: WindowApi
  stealth: StealthApi
  app: AppApi
  events: EventsApi
  pathForFile(file: File): string
  setNativeTheme(mode: ThemeMode): void
  getReadingProgress(bookId: string): Promise<ReadingProgress | null>
}
