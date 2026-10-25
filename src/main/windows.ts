import { BrowserWindow, nativeImage, nativeTheme, screen } from 'electron'
import { join } from 'node:path'
import type { BgSample, StealthContextPayload, StealthInitPayload } from '../shared/types'
import { APP_ICON_DATA_URL } from './icon-data'
import { getStore } from './store'
import { captureUnderlay } from './capture'

let mainWindow: BrowserWindow | null = null
let stealthWindow: BrowserWindow | null = null
let stealthContext: StealthContextPayload | null = null
let stealthLoaded = false
let sampleTimer: NodeJS.Timeout | null = null
let moveTimer: NodeJS.Timeout | null = null
let bossHidden = false
let lastShown: 'main' | 'stealth' = 'main'
let quitting = false

export const iconPath = join(__dirname, '../../resources/icon.png')
export const appIcon = nativeImage.createFromDataURL(APP_ICON_DATA_URL)

export function setQuitting(value: boolean): void {
  quitting = value
}

export function isQuitting(): boolean {
  return quitting
}

export function currentTheme(): 'light' | 'dark' {
  const mode = getStore().settings.theme
  if (mode === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  return mode
}

export function themeBackground(): string {
  return currentTheme() === 'dark' ? '#15171a' : '#f6f1e7'
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getStealthWindow(): BrowserWindow | null {
  return stealthWindow
}

export function getStealthContext(): StealthContextPayload | null {
  return stealthContext
}

export function isStealthVisible(): boolean {
  return Boolean(stealthWindow && !stealthWindow.isDestroyed() && stealthWindow.isVisible())
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 520,
    minHeight: 400,
    show: false,
    frame: false,
    thickFrame: true,
    backgroundColor: themeBackground(),
    title: 'Ebook Viewer',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (!bossHidden) mainWindow?.focus()
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false))
  mainWindow.on('enter-full-screen', () => mainWindow?.webContents.send('window:maximized', true))
  mainWindow.on('leave-full-screen', () => mainWindow?.webContents.send('window:maximized', false))

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  loadRoute(mainWindow, '')
  return mainWindow
}

export async function openStealth(context?: Partial<StealthContextPayload>): Promise<boolean> {
  const store = getStore()
  const bookId = context?.bookId || store.settings.lastBookId || store.books[0]?.id
  if (!bookId) return false
  const book = store.book(bookId)
  if (!book) return false

  stealthContext = {
    bookId,
    cfi: context?.cfi || book.progress.cfi || ''
  }

  if (!stealthWindow || stealthWindow.isDestroyed()) {
    stealthWindow = createStealthWindow()
    loadRoute(stealthWindow, '#/stealth')
  } else {
    if (stealthLoaded) sendStealthInit()
  }

  const win = stealthWindow
  win.setAlwaysOnTop(true, 'screen-saver')
  win.show()
  win.focus()
  win.setAlwaysOnTop(true, 'screen-saver')

  if (win.isVisible()) {
    startSampling()
    broadcastStealthVisibility(true)
  }

  return true
}

function createStealthWindow(): BrowserWindow {
  const store = getStore()
  const settings = store.settings.stealth
  const display = screen.getPrimaryDisplay()
  const width = clamp(settings.width, 320, 1100)
  const height = clamp(settings.height, 80, 460)
  const x =
    settings.x === null || Number.isNaN(settings.x)
      ? Math.round(display.workArea.x + display.workArea.width - width - 24)
      : settings.x
  const y =
    settings.y === null || Number.isNaN(settings.y)
      ? Math.round(display.workArea.y + display.workArea.height - height - 24)
      : settings.y

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 320,
    minHeight: 80,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    title: '摸鱼',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setSkipTaskbar(true)

  win.on('page-title-updated', (event) => {
    event.preventDefault()
    win.setTitle('摸鱼')
  })

  win.once('ready-to-show', () => {
    ensureOnScreen(win)
    win.show()
    win.focus()
    startSampling()
    broadcastStealthVisibility(true)
  })

  win.webContents.on('did-finish-load', () => {
    stealthLoaded = true
    sendStealthInit()
  })

  win.on('show', () => {
    startSampling()
    broadcastStealthVisibility(true)
  })

  win.on('hide', () => {
    stopSampling()
    broadcastStealthVisibility(false)
  })

  win.on('move', () => {
    if (moveTimer) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (!stealthWindow || stealthWindow.isDestroyed()) return
      const bounds = stealthWindow.getBounds()
      const storeNow = getStore()
      storeNow.settings.stealth.x = bounds.x
      storeNow.settings.stealth.y = bounds.y
      storeNow.saveSoon()
      void refreshStealthUnderlay()
    }, 300)
  })

  win.on('closed', () => {
    stopSampling()
    stealthWindow = null
    stealthLoaded = false
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return win
}

export function hideStealth(): void {
  if (stealthWindow && !stealthWindow.isDestroyed()) {
    stealthWindow.hide()
  }
  stopSampling()
  broadcastStealthVisibility(false)
}

export function sendStealthInit(): void {
  if (!stealthWindow || stealthWindow.isDestroyed() || !stealthContext) return
  const book = getStore().book(stealthContext.bookId)
  if (!book) return
  const payload: StealthInitPayload = {
    book,
    cfi: stealthContext.cfi,
    settings: getStore().settings
  }
  stealthWindow.webContents.send('stealth:init', payload)
}

export function setStealthSize(width: number, height: number): void {
  if (!stealthWindow || stealthWindow.isDestroyed()) return
  const w = clamp(Math.round(width), 320, 1100)
  const h = clamp(Math.round(height), 80, 460)
  stealthWindow.setSize(w, h)
  const store = getStore()
  store.settings.stealth.width = w
  store.settings.stealth.height = h
  store.saveSoon()
  setTimeout(() => void refreshStealthUnderlay(), 220)
}

export function toggleBoss(): void {
  const stealth = stealthWindow
  const main = mainWindow
  const stealthVisible = Boolean(stealth && !stealth.isDestroyed() && stealth.isVisible())
  const mainVisible = Boolean(main && !main.isDestroyed() && main.isVisible())

  if (stealthVisible || mainVisible) {
    lastShown = stealthVisible ? 'stealth' : 'main'
    bossHidden = true
    main?.hide()
    if (stealthVisible) hideStealth()
    return
  }

  bossHidden = false
  if (lastShown === 'stealth' && stealth && !stealth.isDestroyed()) {
    stealth.show()
    stealth.focus()
  } else if (main && !main.isDestroyed()) {
    main.show()
    main.focus()
  }
}

export function showMain(): void {
  bossHidden = false
  const win = createMainWindow()
  win.show()
  win.focus()
}

export function broadcast<T>(channel: string, payload: T, excludedWebContentsId?: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (excludedWebContentsId && win.webContents.id === excludedWebContentsId) continue
    win.webContents.send(channel, payload)
  }
}

export function sendToMain<T>(channel: string, payload: T): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

export function broadcastStealthVisibility(visible: boolean): void {
  sendToMain('events:stealth-visibility', visible)
}

export function applyThemeBackground(): void {
  const color = themeBackground()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(color)
}

function loadRoute(win: BrowserWindow, hash: string): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    win.loadURL(`${devUrl}${hash}`)
  } else {
    win.loadURL(`app://bundle/index.html${hash}`)
  }
}

function ensureOnScreen(win: BrowserWindow): void {
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const area = display.workArea
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  const x = clamp(bounds.x, area.x - width + 80, area.x + area.width - 80)
  const y = clamp(bounds.y, area.y, area.y + area.height - 40)
  if (x !== bounds.x || y !== bounds.y || width !== bounds.width || height !== bounds.height) {
    win.setBounds({ x, y, width, height })
  }
}

function startSampling(): void {
  stopSampling()
  void refreshStealthUnderlay()
  sampleTimer = setInterval(() => {
    void refreshStealthUnderlay()
  }, 2000)
}

function stopSampling(): void {
  if (sampleTimer) {
    clearInterval(sampleTimer)
    sampleTimer = null
  }
}

async function refreshStealthUnderlay(): Promise<void> {
  if (!stealthWindow || stealthWindow.isDestroyed()) return
  const bounds = stealthWindow.getBounds()
  const underlay = await captureUnderlay(bounds)
  if (!underlay || !stealthWindow || stealthWindow.isDestroyed()) return
  stealthWindow.webContents.send('stealth:underlay', underlay)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}
