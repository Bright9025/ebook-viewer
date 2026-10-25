import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api } from '../shared/api'
import type {
  AppSettings,
  Book,
  HotkeyStatus,
  InitData,
  ProgressPayload,
  ReadingProgress,
  StealthContextPayload,
  StealthInitPayload,
  ThemeMode,
  UnderlayCapture
} from '../shared/types'

function on<T>(channel: string) {
  return (callback: (value: T) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api: Api = {
  library: {
    list: () => ipcRenderer.invoke('library:list') as Promise<InitData>,
    pick: () => ipcRenderer.invoke('library:pick') as Promise<string[]>,
    add: (request) => ipcRenderer.invoke('library:add', request) as Promise<Book>,
    remove: (id) => ipcRenderer.invoke('library:remove', id) as Promise<void>,
    read: (id) => ipcRenderer.invoke('book:read', id) as Promise<Uint8Array>,
    readPath: (path) => ipcRenderer.invoke('book:read-path', path) as Promise<Uint8Array>,
    touch: (id) => ipcRenderer.invoke('library:touch', id) as Promise<void>
  },
  settings: {
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', patch) as Promise<AppSettings>
  },
  progress: {
    set: (progress: ProgressPayload) => ipcRenderer.invoke('progress:set', progress) as Promise<void>
  },
  bookmarks: {
    list: (bookId) => ipcRenderer.invoke('bookmarks:list', bookId),
    add: (input) => ipcRenderer.invoke('bookmarks:add', input),
    remove: (id) => ipcRenderer.invoke('bookmarks:remove', id)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
    close: () => ipcRenderer.send('window:close'),
    setFullScreen: (value) => ipcRenderer.send('window:set-fullscreen', value),
    setBackground: (color) => ipcRenderer.send('window:set-background', color),
    onMaximized: on<boolean>('window:maximized')
  },
  stealth: {
    open: (context: StealthContextPayload) => ipcRenderer.invoke('stealth:open', context) as Promise<boolean>,
    hide: () => ipcRenderer.send('stealth:hide'),
    close: () => ipcRenderer.send('stealth:close'),
    setSize: (width, height) => ipcRenderer.send('stealth:set-size', { width, height }),
    context: () => ipcRenderer.invoke('stealth:context') as Promise<StealthContextPayload | null>,
    ready: () => ipcRenderer.send('stealth:ready'),
    sendProgress: (progress) => ipcRenderer.send('stealth:progress', progress),
    onInit: on<StealthInitPayload>('stealth:init'),
    onUnderlay: on<UnderlayCapture>('stealth:underlay')
  },
  app: {
    version: () => ipcRenderer.invoke('app:version') as Promise<string>,
    showMain: () => ipcRenderer.send('app:show-main'),
    quit: () => ipcRenderer.send('app:quit'),
    captureScreen: () => ipcRenderer.invoke('app:capture-screen') as Promise<string>
  },
  events: {
    onRemoteProgress: on<ProgressPayload>('events:remote-progress'),
    onSettingsChanged: on<AppSettings>('events:settings-changed'),
    onHotkeys: on<HotkeyStatus>('events:hotkeys'),
    onStealthVisibility: on<boolean>('events:stealth-visibility')
  },
  pathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  setNativeTheme: (mode: ThemeMode) => ipcRenderer.send('app:theme-source', mode),
  getReadingProgress: (bookId: string) => ipcRenderer.invoke('progress:get', bookId) as Promise<ReadingProgress | null>
}

contextBridge.exposeInMainWorld('api', api)
