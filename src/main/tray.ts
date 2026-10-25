import { app, Menu, nativeImage, Tray } from 'electron'
import { TRAY_ICON_DATA_URL } from './icon-data'
import { getStore } from './store'
import { hideStealth, isStealthVisible, openStealth, setQuitting, showMain, toggleBoss } from './windows'
let tray: Tray | null = null

export function createTray(): void {
  if (tray) return
  const image = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip('Ebook Viewer')
  tray.on('click', () => showMain())
  refreshTrayMenu()
}

export function refreshTrayMenu(): void {
  if (!tray) return
  const hasBook = Boolean(getStore().settings.lastBookId)
  const menu = Menu.buildFromTemplate([
    {
      label: '打开书库',
      click: () => showMain()
    },
    {
      label: '摸鱼模式',
      enabled: hasBook,
      click: () => {
        void openStealth()
      }
    },
    {
      label: '隐藏 / 恢复',
      click: () => toggleBoss()
    },
    { type: 'separator' },
    {
      label: '退出 Ebook Viewer',
      click: () => {
        setQuitting(true)
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

export function updateTrayTooltip(): void {
  if (!tray) return
  tray.setToolTip(isStealthVisible() ? 'Ebook Viewer · 摸鱼中' : 'Ebook Viewer')
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export function hideStealthFromTray(): void {
  hideStealth()
}
