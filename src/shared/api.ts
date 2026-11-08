import type {
  Annotation,
  AnnotationColor,
  AnnotationStyle,
  AppSettings,
  Book,
  Bookmark,
  CustomFont,
  ExportMode,
  HotkeyStatus,
  ImportRequest,
  InitData,
  ProgressPayload,
  ReadingProgress,
  StealthContextPayload,
  StealthInitPayload,
  ThemeMode,
  UnderlayCapture,
  UpdateStatus,
  UpdatePrompt
} from './types'

export interface LibraryApi {
  list(): Promise<InitData>
  pick(): Promise<string[]>
  add(request: ImportRequest): Promise<Book>
  remove(id: string): Promise<void>
  read(id: string): Promise<Uint8Array>
  readPath(path: string): Promise<Uint8Array>
  touch(id: string): Promise<void>
  export(id: string, targetPath?: string, mode?: ExportMode): Promise<string | null>
  exportMany(ids: string[], mode?: ExportMode, targetFolder?: string): Promise<string[]>
}

export interface FontsApi {
  import(sourcePath?: string): Promise<CustomFont | null>
  remove(fileName: string): Promise<void>
}

export interface SettingsApi {
  set(patch: Partial<AppSettings>): Promise<AppSettings>
  reset(): Promise<AppSettings>
}

export interface UpdatesApi {
  check(): Promise<UpdateStatus>
  download(): Promise<UpdateStatus>
  dismiss(): void
  install(): void
}

export interface ProgressApi {
  set(progress: ProgressPayload): Promise<void>
}

export interface BookmarksApi {
  list(bookId: string): Promise<Bookmark[]>
  add(input: Omit<Bookmark, 'id' | 'createdAt'>): Promise<Bookmark>
  remove(id: string): Promise<void>
}

export interface AnnotationsApi {
  list(bookId: string): Promise<Annotation[]>
  add(input: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Annotation>
  update(id: string, patch: { note?: string; color?: AnnotationColor; style?: AnnotationStyle }): Promise<Annotation>
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
  onUnderlay(callback: (capture: UnderlayCapture) => void): () => void
}

export interface AppApi {
  version(): Promise<string>
  showMain(): void
  quit(): void
  captureScreen(): Promise<string>
  copyText(text: string): void
}

export interface EventsApi {
  onRemoteProgress(callback: (progress: ProgressPayload) => void): () => void
  onSettingsChanged(callback: (settings: AppSettings) => void): () => void
  onHotkeys(callback: (status: HotkeyStatus) => void): () => void
  onStealthVisibility(callback: (visible: boolean) => void): () => void
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void
  onUpdatePrompt(callback: (prompt: UpdatePrompt) => void): () => void
}

export interface Api {
  library: LibraryApi
  settings: SettingsApi
  fonts: FontsApi
  updates: UpdatesApi
  progress: ProgressApi
  bookmarks: BookmarksApi
  annotations: AnnotationsApi
  window: WindowApi
  stealth: StealthApi
  app: AppApi
  events: EventsApi
  pathForFile(file: File): string
  setNativeTheme(mode: ThemeMode): void
  getReadingProgress(bookId: string): Promise<ReadingProgress | null>
}
