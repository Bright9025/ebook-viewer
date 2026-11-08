import { app, BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'
import { getMainWindow } from './windows'

interface UpdateState {
  launchCount: number
  pendingVersion?: string
  downloadedVersion?: string
}

let status: UpdateStatus = { state: 'idle' }
let statePath = ''
let state: UpdateState = { launchCount: 0 }
let promptOpen = false
let installAfterDownload = false
let promptedVersion = ''
let pendingAtStartup = false

function publish(next: UpdateStatus): UpdateStatus {
  status = next
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('events:update-status', next)
  }
  return status
}

function compareVersions(a: string, b: string): number {
  const left = a.replace(/^v/i, '').split('.').map(Number)
  const right = b.replace(/^v/i, '').split('.').map(Number)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function readState(): UpdateState {
  if (!statePath || !existsSync(statePath)) return { launchCount: 0 }
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<UpdateState>
    return {
      launchCount: Number(parsed.launchCount || 0),
      pendingVersion: typeof parsed.pendingVersion === 'string' ? parsed.pendingVersion : undefined,
      downloadedVersion: typeof parsed.downloadedVersion === 'string' ? parsed.downloadedVersion : undefined
    }
  } catch {
    return { launchCount: 0 }
  }
}

function saveState(): void {
  if (!statePath) return
  try {
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    console.warn('[updater] failed to save update state', error)
  }
}

function clearStaleState(): void {
  const current = app.getVersion()
  if (state.pendingVersion && compareVersions(state.pendingVersion, current) <= 0) {
    state.pendingVersion = undefined
    state.downloadedVersion = undefined
    saveState()
  }
  if (state.downloadedVersion && state.downloadedVersion === state.pendingVersion) {
    state.pendingVersion = undefined
  }
}

async function promptForUpdate(): Promise<void> {
  if (promptOpen || !app.isPackaged) return
  const current = app.getVersion()
  const downloaded = state.downloadedVersion
  const pending = state.pendingVersion
  const version = downloaded && compareVersions(downloaded, current) > 0 ? downloaded : pending
  if (!version || compareVersions(version, current) <= 0) return
  if (status.state === 'downloading') return
  if (!downloaded && !pendingAtStartup) return
  if (!downloaded && promptedVersion === version) return
  const window = getMainWindow()
  if (!window || window.isDestroyed()) return
  promptOpen = true
  if (!downloaded) promptedVersion = version
  window.webContents.send('events:update-prompt', { version, downloaded: Boolean(downloaded) })
}

export function setupAutoUpdater(storeDir: string): void {
  if (!app.isPackaged) {
    status = { state: 'unsupported', message: '开发模式不检查更新' }
    return
  }
  statePath = join(storeDir, 'update-state.json')
  state = readState()
  state.launchCount += 1
  pendingAtStartup = Boolean(state.pendingVersion || state.downloadedVersion)
  clearStaleState()
  saveState()

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  // Keep updates in the existing installation directory. This also makes a
  // manually moved portable copy update in place instead of using NSIS's
  // default per-user folder.
  ;(autoUpdater as typeof autoUpdater & { installDirectory?: string }).installDirectory = dirname(process.execPath)

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    state.pendingVersion = info.version
    saveState()
    publish({ state: 'available', version: info.version, message: '发现新版本' })
  })
  autoUpdater.on('update-not-available', () => publish({ state: 'not-available', message: '已经是最新版本' }))
  autoUpdater.on('download-progress', (info) =>
    publish({ state: 'downloading', percent: Math.round(info.percent), message: '正在下载更新' })
  )
  autoUpdater.on('update-downloaded', (info) => {
    state.downloadedVersion = info.version
    saveState()
    publish({ state: 'downloaded', version: info.version, message: '更新已下载，等待确认安装' })
    if (installAfterDownload) {
      installAfterDownload = false
      autoUpdater.quitAndInstall(false, true)
      return
    }
    void promptForUpdate()
  })
  autoUpdater.on('error', (error) => publish({ state: 'error', message: String(error?.message ?? error) }))

  // The first launch only records a pending update. The next launch asks the
  // user before downloading. Nothing is installed without confirmation.
  setTimeout(() => {
    void promptForUpdate()
  }, 3_000)
  setTimeout(() => {
    void checkForUpdates()
  }, 7_000)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return publish({ state: 'unsupported', message: '开发模式不检查更新' })
  try {
    publish({ state: 'checking' })
    const result = await autoUpdater.checkForUpdates()
    if (!result) return publish({ state: 'not-available', message: '已经是最新版本' })
    if (result.updateInfo?.version) state.pendingVersion = result.updateInfo.version
    saveState()
    const available = state.pendingVersion
    if (available && compareVersions(available, app.getVersion()) > 0) {
      setTimeout(() => void promptForUpdate(), 800)
    }
    return status
  } catch (error) {
    return publish({ state: 'error', message: String((error as Error)?.message ?? error) })
  }
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) return publish({ state: 'unsupported', message: '开发模式不检查更新' })
  const pending = state.pendingVersion
  if (!pending) return publish({ state: 'not-available', message: '没有可下载的更新' })
  promptOpen = false
  try {
    publish({ state: 'downloading', version: pending, percent: 0, message: '正在下载更新' })
    await autoUpdater.checkForUpdates()
    await autoUpdater.downloadUpdate()
    return status
  } catch (error) {
    return publish({ state: 'error', message: String((error as Error)?.message ?? error) })
  }
}

export function dismissUpdatePrompt(): void {
  promptOpen = false
}

export function installUpdate(): void {
  if (!app.isPackaged) return
  promptOpen = false
  if (status.state === 'downloaded') {
    autoUpdater.quitAndInstall(false, true)
    return
  }
  if (state.downloadedVersion || state.pendingVersion) {
    installAfterDownload = true
    void downloadUpdate()
  }
}
