import { app, nativeTheme, protocol } from 'electron'
import { promises as fs, mkdirSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { registerIpc } from './ipc'
import { initStore, getStore } from './store'
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

// Keep app data next to the project / portable build. Some Windows sessions
// (or security products) crash Chromium while it initializes a profile under
// %APPDATA%; a writable local folder avoids that entirely.
// EBOOK_USER_DATA still wins, which is what the e2e script uses.
const defaultDataDir = app.isPackaged
  ? join(dirname(process.execPath), 'data')
  : join(app.getAppPath(), '.data')

if (process.env.EBOOK_USER_DATA) {
  try {
    mkdirSync(process.env.EBOOK_USER_DATA, { recursive: true })
    app.setPath('userData', process.env.EBOOK_USER_DATA)
  } catch (error) {
    console.warn('[app] failed to set user data dir', error)
  }
} else {
  try {
    mkdirSync(defaultDataDir, { recursive: true })
    app.setPath('userData', defaultDataDir)
  } catch (error) {
    console.warn('[app] local data dir unavailable, using default', error)
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

  initStore(app.getPath('userData'))
  await getStore().load()
  nativeTheme.themeSource = getStore().settings.theme

  registerAppProtocol()
  registerIpc()
  createMainWindow()
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
