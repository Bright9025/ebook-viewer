import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

let status: UpdateStatus = { state: 'idle' }

function publish(next: UpdateStatus): UpdateStatus {
  status = next
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('events:update-status', next)
  }
  return status
}

export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    status = { state: 'unsupported', message: '开发模式不检查更新' }
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    publish({ state: 'available', version: info.version, message: '发现新版本，正在下载' })
  )
  autoUpdater.on('update-not-available', () => publish({ state: 'not-available', message: '已经是最新版本' }))
  autoUpdater.on('download-progress', (info) =>
    publish({ state: 'downloading', percent: Math.round(info.percent), message: '正在下载更新' })
  )
  autoUpdater.on('update-downloaded', (info) =>
    publish({ state: 'downloaded', version: info.version, message: '更新已下载，退出应用后安装' })
  )
  autoUpdater.on('error', (error) => publish({ state: 'error', message: String(error?.message ?? error) }))

  setTimeout(() => {
    void checkForUpdates()
  }, 6_000)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return publish({ state: 'unsupported', message: '开发模式不检查更新' })
  try {
    publish({ state: 'checking' })
    const result = await autoUpdater.checkForUpdates()
    if (!result) return publish({ state: 'not-available', message: '已经是最新版本' })
    return status
  } catch (error) {
    return publish({ state: 'error', message: String((error as Error)?.message ?? error) })
  }
}

export function installUpdate(): void {
  if (!app.isPackaged || status.state !== 'downloaded') return
  autoUpdater.quitAndInstall(false, true)
}
