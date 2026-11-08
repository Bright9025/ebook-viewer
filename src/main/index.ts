import { app, nativeTheme, protocol, session } from 'electron'
import { existsSync, promises as fs, mkdirSync } from 'node:fs'
import { dirname, join, normalize, sep, basename } from 'node:path'
import { registerIpc } from './ipc'
import { initStore, getStore } from './store'
import { fontMimeType } from './fonts'
import { setupAutoUpdater } from './updater'
import { registerHotkeys, unregisterHotkeys } from './shortcuts'
import { createTray, destroyTray } from './tray'
import {
  applyThemeBackground,
  createMainWindow,
  getMainWindow,
  isQuitting,
  sendToMain,
  setQuitting,
  showMain
} from './windows'

// Keep Chromium's profile next to the executable: some Windows sessions and
// security products crash when Chromium initializes a profile under %APPDATA%.
// The actual store lives in a separate per-user folder so installing an update
// cannot remove the library, books, annotations or reading progress.
const chromiumDataDir = app.isPackaged
  ? join(dirname(process.execPath), 'data')
  : join(app.getAppPath(), '.data')
const localAppData = process.env.LOCALAPPDATA || app.getPath('appData')
const storeDataDir =
  process.env.EBOOK_USER_DATA ||
  (app.isPackaged ? join(localAppData, 'Ebook Viewer') : chromiumDataDir)

if (process.env.EBOOK_USER_DATA || chromiumDataDir) {
  try {
    mkdirSync(process.env.EBOOK_USER_DATA || chromiumDataDir, { recursive: true })
    app.setPath('userData', process.env.EBOOK_USER_DATA || chromiumDataDir)
  } catch (error) {
    console.warn('[app] failed to set chromium data dir', error)
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  },
  {
    scheme: 'app-font',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

// Note: some restricted Windows sessions cannot initialize Chromium's sandbox.
// The dev/preview scripts pass --no-sandbox for that case.

app.setAppUserModelId('com.ebookviewer.app')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMain())
  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'geolocation')
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'geolocation')

  await migrateLegacyStore()
  initStore(storeDataDir)
  await getStore().load()
  const themeMode = getStore().settings.theme
  nativeTheme.themeSource = themeMode === 'auto' ? 'system' : themeMode

  registerAppProtocol()
  registerIpc()
  createMainWindow()
  setupAutoUpdater(storeDataDir)
  createTray()
  const hotkeys = registerHotkeys()
  setTimeout(() => {
    if (getMainWindow() && !getMainWindow()?.isDestroyed()) {
      sendToMain('events:hotkeys', hotkeys)
    }
  }, 1200)

  nativeTheme.on('updated', () => {
    if (getStore().settings.theme === 'system') applyThemeBackground()
  })

  app.on('activate', () => showMain())
}

async function migrateLegacyStore(): Promise<void> {
  if (process.env.EBOOK_USER_DATA || !app.isPackaged) return
  const targetData = join(storeDataDir, 'data.json')
  if (existsSync(targetData)) return
  const candidates = [
    join(dirname(process.execPath), 'data'),
    join(localAppData, 'Programs', 'Ebook Viewer', 'data'),
    join(localAppData, 'Programs', 'ebook-viewer', 'data'),
    join(app.getPath('appData'), 'ebook-viewer')
  ]
  for (const source of candidates) {
    if (source === storeDataDir || !existsSync(join(source, 'data.json'))) continue
    try {
      await fs.mkdir(storeDataDir, { recursive: true })
      await fs.copyFile(join(source, 'data.json'), targetData)
      for (const directory of ['books', 'fonts', 'exports']) {
        const from = join(source, directory)
        if (!existsSync(from)) continue
        await fs.cp(from, join(storeDataDir, directory), { recursive: true, force: false })
      }
      console.info('[app] migrated legacy store from', source)
      return
    } catch (error) {
      console.warn('[app] failed to migrate legacy store', source, error)
    }
  }
}

function registerAppProtocol(): void {
  const rendererDir = join(__dirname, '../renderer')
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url)
      let pathname = decodeURIComponent(url.pathname)
      if (!pathname || pathname === '/') pathname = '/index.html'
      const filePath = normalize(join(rendererDir, pathname))
      if (filePath !== rendererDir && !filePath.startsWith(rendererDir + sep)) {
        return new Response('Forbidden', { status: 403 })
      }
      const data = await fs.readFile(filePath)
      return new Response(data, {
        headers: {
          'content-type': mimeType(filePath),
          'cache-control': 'no-cache'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  protocol.handle('app-font', async (request) => {
    try {
      const name = basename(decodeURIComponent(new URL(request.url).pathname))
      if (!/^[a-z0-9-]+\.(ttf|otf|woff|woff2)$/i.test(name)) {
        return new Response('Forbidden', { status: 403 })
      }
      const data = await fs.readFile(join(getStore().dir, 'fonts', name))
      return new Response(new Uint8Array(data), {
        headers: {
          'content-type': fontMimeType(name),
          'cache-control': 'no-cache'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function mimeType(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.woff2')) return 'font/woff2'
  if (lower.endsWith('.woff')) return 'font/woff'
  if (lower.endsWith('.ttf')) return 'font/ttf'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  return 'application/octet-stream'
}

app.on('before-quit', () => {
  setQuitting(true)
  unregisterHotkeys()
  destroyTray()
  if (isQuitting()) {
    void getStore().flush()
  }
})

app.on('window-all-closed', () => {
  // Keep the reader alive in the tray, like a desktop reading app.
})
