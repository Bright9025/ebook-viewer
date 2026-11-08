import { BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { CustomFont } from '../shared/types'
import { getStore } from './store'

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2'])

export async function importCustomFont(parent: BrowserWindow | null, sourcePath?: string): Promise<CustomFont | null> {
  let source = sourcePath ?? ''
  if (!source) {
    const options: Electron.OpenDialogOptions = {
      title: '导入阅读字体',
      properties: ['openFile'],
      filters: [{ name: '字体文件', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    source = result.filePaths[0]
  }
  const extension = extname(source).toLowerCase()
  if (!FONT_EXTENSIONS.has(extension)) return null
  const id = randomUUID()
  const folder = join(getStore().dir, 'fonts')
  await fs.mkdir(folder, { recursive: true })
  const fileName = `${id}${extension}`
  await fs.copyFile(source, join(folder, fileName))
  return {
    id: `custom-${id}`,
    label: basename(source, extension).slice(0, 60) || '导入字体',
    family: `EbookViewerFont-${id.slice(0, 8)}`,
    fileName
  }
}

export async function removeCustomFont(fileName: string): Promise<void> {
  if (!/^[a-z0-9-]+\.(ttf|otf|woff|woff2)$/i.test(fileName)) return
  await fs.rm(join(getStore().dir, 'fonts', basename(fileName)), { force: true })
}

export function fontMimeType(fileName: string): string {
  const extension = extname(fileName).toLowerCase()
  if (extension === '.otf') return 'font/otf'
  if (extension === '.woff') return 'font/woff'
  if (extension === '.woff2') return 'font/woff2'
  return 'font/ttf'
}
