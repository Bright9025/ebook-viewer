import { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain, nativeTheme, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import type { Annotation, AppSettings, Bookmark, ExportMode, ProgressPayload, StealthContextPayload } from '../shared/types'
import { addBook, readBook, readPath, removeBook, touchBook } from './library'
import { exportBookAsEpub, exportBooksAsEpub } from './export'
import { importCustomFont, removeCustomFont } from './fonts'
import { registerHotkeys } from './shortcuts'
import { getStore } from './store'
import { refreshTrayMenu } from './tray'
import {
  applyThemeBackground,
  broadcast,
  getMainWindow,
  getStealthContext,
  hideStealth,
  openStealth,
  sendStealthInit,
  setQuitting,
  setStealthSize,
  showMain
} from './windows'

export function registerIpc(): void {
  ipcMain.handle('library:list', () => {
    const store = getStore()
    return {
      books: store.books,
      settings: store.settings,
      bookmarks: store.data.bookmarks,
      annotations: store.data.annotations
    }
  })

  ipcMain.handle('library:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow() ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      title: '导入 EPUB',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'EPUB 电子书', extensions: ['epub'] }]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('library:add', async (_event, request: { sourcePath: string; title: string; author: string; description?: string; cover: string }) => {
    if (!request?.sourcePath || !existsSync(request.sourcePath)) throw new Error('SOURCE_NOT_FOUND')
    if (extname(request.sourcePath).toLowerCase() !== '.epub') throw new Error('NOT_EPUB')
    const book = await addBook(request)
    refreshTrayMenu()
    return book
  })

  ipcMain.handle('library:remove', async (_event, id: string) => {
    await removeBook(id)
    refreshTrayMenu()
  })

  ipcMain.handle('book:read', async (_event, id: string) => readBook(id))
  ipcMain.handle('book:read-path', async (_event, path: string) => readPath(path))
  ipcMain.handle('library:export', async (event, id: string, targetPath?: string, mode?: ExportMode) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    return exportBookAsEpub(id, win, targetPath, mode)
  })
  ipcMain.handle('library:export-many', async (event, ids: string[], mode?: ExportMode, targetFolder?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    return exportBooksAsEpub(ids, win, mode, targetFolder)
  })
  ipcMain.handle('library:touch', async (_event, id: string) => {
    await touchBook(id)
    refreshTrayMenu()
  })

  ipcMain.handle('settings:reset', async () => {
    const store = getStore()
    const settings = await store.resetSettings()
    nativeTheme.themeSource = settings.theme === 'auto' ? 'system' : settings.theme
    applyThemeBackground()
    broadcast('events:settings-changed', settings)
    return settings
  })

  ipcMain.handle('fonts:import', async (event, sourcePath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
    return importCustomFont(win, sourcePath)
  })

  ipcMain.handle('fonts:remove', async (_event, fileName: string) => {
    await removeCustomFont(fileName)
  })

  ipcMain.handle('settings:set', async (_event, patch: Partial<AppSettings>) => {
    const store = getStore()
    const settings = await store.updateSettings(patch ?? {})
    nativeTheme.themeSource = settings.theme === 'auto' ? 'system' : settings.theme
    applyThemeBackground()
    broadcast('events:settings-changed', settings)
    if (patch?.hotkeys) registerHotkeys()
    return settings
  })

  ipcMain.handle('progress:get', (_event, bookId: string) => {
    const book = getStore().book(bookId)
    return book?.progress ?? null
  })

  ipcMain.handle('progress:set', (event, progress: ProgressPayload) => {
    setProgress(progress)
    broadcast('events:remote-progress', progress, event.sender.id)
  })

  ipcMain.handle('bookmarks:list', (_event, bookId: string) => getStore().bookmarksFor(bookId))

  ipcMain.handle('bookmarks:add', async (_event, input: Omit<Bookmark, 'id' | 'createdAt'>) => {
    const bookmark: Bookmark = {
      ...input,
      id: randomUUID(),
      createdAt: Date.now()
    }
    await getStore().addBookmark(bookmark)
    return bookmark
  })

  ipcMain.handle('bookmarks:remove', async (_event, id: string) => {
    await getStore().removeBookmark(id)
  })

  ipcMain.handle('annotations:list', (_event, bookId: string) => getStore().annotationsFor(bookId))

  ipcMain.handle('annotations:add', async (_event, input: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!input?.bookId || !input.cfi || !input.text) throw new Error('INVALID_ANNOTATION')
    const now = Date.now()
    const annotation: Annotation = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    }
    await getStore().addAnnotation(annotation)
    return annotation
  })

  ipcMain.handle('annotations:update', async (_event, id: string, patch: { note?: string; color?: Annotation['color']; style?: Annotation['style'] }) => {
    const annotation = await getStore().updateAnnotation(id, patch ?? {})
    if (!annotation) throw new Error('ANNOTATION_NOT_FOUND')
    return annotation
  })

  ipcMain.handle('annotations:remove', async (_event, id: string) => {
    await getStore().removeAnnotation(id)
  })

  ipcMain.handle('stealth:open', async (_event, context: StealthContextPayload) => {
    return openStealth(context)
  })

  ipcMain.on('stealth:hide', () => hideStealth())
  ipcMain.on('stealth:close', () => {
    hideStealth()
    showMain()
  })
  ipcMain.on('stealth:set-size', (_event, size: { width: number; height: number }) => {
    if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
      setStealthSize(size.width, size.height)
    }
  })
  ipcMain.handle('stealth:context', () => getStealthContext())
  ipcMain.on('stealth:ready', () => sendStealthInit())
  ipcMain.on('stealth:progress', (event, progress: ProgressPayload) => {
    const payload: ProgressPayload = { ...progress, source: 'stealth' }
    setProgress(payload)
    broadcast('events:remote-progress', payload, event.sender.id)
  })

  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return Boolean(win && (win.isMaximized() || win.isFullScreen()))
  })
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.on('window:set-fullscreen', (event, value: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.setFullScreen(Boolean(value))
  })
  ipcMain.on('window:set-background', (event, color: string) => {
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
      BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(color)
    }
  })

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.on('app:copy-text', (_event, text: string) => {
    if (typeof text === 'string' && text) clipboard.writeText(text)
  })
  ipcMain.handle('app:capture-screen', async () => {
    if (process.env.EBOOK_DEBUG !== '1') throw new Error('DEBUG_DISABLED')
    const display = screen.getPrimaryDisplay()
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor)
      }
    })
    const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
    return source?.thumbnail.toDataURL() ?? ''
  })
  ipcMain.on('app:show-main', () => showMain())
  ipcMain.on('app:quit', () => {
    setQuitting(true)
    app.quit()
  })
  ipcMain.on('app:theme-source', (_event, mode: 'light' | 'dark' | 'system') => {
    if (mode === 'light' || mode === 'dark' || mode === 'system') {
      nativeTheme.themeSource = mode
      applyThemeBackground()
    }
  })
}

function setProgress(progress: ProgressPayload): void {
  if (!progress?.bookId) return
  getStore().updateProgress(progress.bookId, {
    cfi: progress.cfi,
    percent: progress.percent,
    chapter: progress.chapter,
    sentence: progress.sentence
  })
  refreshTrayMenu()
}
