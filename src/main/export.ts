import { app, BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join, posix } from 'node:path'
import JSZip from 'jszip'
import type { Annotation, Bookmark, ExportMode } from '../shared/types'
import { readBook, stripInlineAnnotations } from './library'
import { getStore } from './store'

interface ExportPayload {
  schema: string
  exportedAt: string
  book: {
    id: string
    title: string
    author: string
    description: string
    fileName: string
  }
  progress: unknown
  bookmarks: Bookmark[]
  annotations: Annotation[]
}

export async function exportBookAsEpub(
  bookId: string,
  parent: BrowserWindow | null,
  targetPath?: string,
  mode?: ExportMode
): Promise<string | null> {
  const store = getStore()
  const book = store.book(bookId)
  if (!book) throw new Error('BOOK_NOT_FOUND')

  const exportMode = mode ?? (targetPath ? 'data' : await askExportMode(parent))
  if (!exportMode) return null

  let filePath = targetPath?.trim() ?? ''
  if (!filePath) {
    const suffix = exportMode === 'original' ? '纯净版' : '数据版'
    const safeTitle = safeFileStem(book.title)
    const folderOptions: Electron.OpenDialogOptions = {
      title: '选择导出文件夹',
      defaultPath: app.getPath('downloads'),
      buttonLabel: '导出到此文件夹',
      properties: ['openDirectory', 'createDirectory']
    }
    const folderResult = parent
      ? await dialog.showOpenDialog(parent, folderOptions)
      : await dialog.showOpenDialog(folderOptions)
    if (folderResult.canceled || !folderResult.filePaths[0]) return null
    filePath = await uniqueFilePath(folderResult.filePaths[0], `${safeTitle}-${suffix}.epub`)
  }
  if (!extname(filePath).toLowerCase()) filePath += '.epub'

  const bytes = await readBook(bookId)
  const zip = await JSZip.loadAsync(Buffer.from(bytes))
  const exportedAt = new Date().toISOString()
  const bookmarks = store.bookmarksFor(bookId)
  const annotations = store.annotationsFor(bookId)
  const payload: ExportPayload = {
    schema: 'ebook-viewer.annotation-export/v1',
    exportedAt,
    book: {
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      fileName: book.fileName
    },
    progress: { ...book.progress },
    bookmarks,
    annotations
  }

  let output: Buffer
  if (exportMode === 'original') {
    output = await cleanOriginalEpub(zip, Buffer.from(bytes))
  } else {
    zip.file('META-INF/ebook-viewer.json', JSON.stringify(payload, null, 2))
    await injectNotesDocument(zip, payload)
    output = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
  }
  try {
    await writeFile(filePath, output)
  } catch (error) {
    if (!isPermissionError(error)) throw error
    const fallback = join(app.getPath('userData'), 'exports', basename(filePath))
    await writeFile(fallback, output)
    const message: Electron.MessageBoxOptions = {
      type: 'warning',
      title: '导出位置受限',
      message: '系统限制了所选文件夹的写入权限。',
      detail: `文件已改存到程序可写目录：\n${fallback}\n\n你可以在这里打开后手动移动到目标文件夹。`,
      buttons: ['打开文件夹', '关闭'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }
    try {
      const result = parent ? await dialog.showMessageBox(parent, message) : await dialog.showMessageBox(message)
      if (result.response === 0) void shell.openPath(dirname(fallback))
    } catch {
      /* the fallback export already succeeded */
    }
    return fallback
  }
  return filePath
}

export async function exportBooksAsEpub(
  ids: string[],
  parent: BrowserWindow | null,
  mode?: ExportMode,
  targetFolder?: string
): Promise<string[]> {
  const store = getStore()
  const books = ids.map((id) => store.book(id)).filter((book): book is NonNullable<typeof book> => Boolean(book))
  if (!books.length) return []
  const exportMode = mode ?? (await askExportMode(parent))
  if (!exportMode) return []
  const folder = targetFolder?.trim() || (await chooseExportFolder(parent))
  if (!folder) return []
  const suffix = exportMode === 'original' ? '纯净版' : '数据版'
  const paths: string[] = []
  for (const book of books) {
    const target = await uniqueFilePath(folder, `${safeFileStem(book.title)}-${suffix}.epub`)
    const path = await exportBookAsEpub(book.id, parent, target, exportMode)
    if (path) paths.push(path)
  }
  return paths
}

async function chooseExportFolder(parent: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: '选择导出文件夹',
    defaultPath: app.getPath('downloads'),
    buttonLabel: '导出到此文件夹',
    properties: ['openDirectory', 'createDirectory']
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function writeFile(filePath: string, data: Buffer): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, data)
}

async function uniqueFilePath(dir: string, fileName: string): Promise<string> {
  const extension = extname(fileName)
  const stem = fileName.slice(0, -extension.length)
  for (let index = 0; index < 100; index += 1) {
    const candidate = join(dir, index === 0 ? fileName : `${stem}-${index + 1}${extension}`)
    try {
      await fs.access(candidate)
    } catch {
      return candidate
    }
  }
  return join(dir, `${stem}-${Date.now()}${extension}`)
}

function isPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS'
}

async function askExportMode(parent: BrowserWindow | null): Promise<ExportMode | null> {
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    title: '导出 EPUB',
    message: '选择导出方式',
    detail:
      '数据版：附带批注、书签、阅读进度和「阅读笔记」章节。\n纯净版：只复制原始 EPUB，不包含任何标注或阅读数据。\n两种方式都只生成一个 EPUB 文件。',
    buttons: ['数据版（含标注和进度）', '纯净版（仅原始正文）', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  }
  const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (result.response === 2) return null
  return result.response === 1 ? 'original' : 'data'
}

async function cleanOriginalEpub(zip: JSZip, bytes: Buffer): Promise<Buffer> {
  const hasSidecar = Boolean(zip.file('META-INF/ebook-viewer.json'))
  let changed = false
  if (hasSidecar) {
    zip.remove('META-INF/ebook-viewer.json')
    changed = true
  }
  const opf = await readOpf(zip)
  if (opf) {
    let text = opf.text
      .replace(/\s*<item\b[^>]*id="ebook-viewer-notes"[^>]*\/?>/gi, '')
      .replace(/\s*<itemref\b[^>]*idref="ebook-viewer-notes"[^>]*\/?>/gi, '')
    if (text !== opf.text) {
      zip.file(opf.path, text)
      changed = true
    }
    const notesPath = opf.dir === '.' ? 'ebook-viewer-notes.xhtml' : posix.join(opf.dir, 'ebook-viewer-notes.xhtml')
    if (zip.file(notesPath)) {
      zip.remove(notesPath)
      changed = true
    }
  }
  for (const name of Object.keys(zip.files)) {
    if (!/\.x?html?$/i.test(name)) continue
    const entry = zip.file(name)
    if (!entry) continue
    const xhtml = await entry.async('string')
    if (!xhtml.includes('ev-annotation')) continue
    zip.file(name, stripInlineAnnotations(xhtml))
    changed = true
  }
  if (!changed) return bytes
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function injectNotesDocument(zip: JSZip, payload: ExportPayload): Promise<void> {
  const opf = await readOpf(zip)
  if (!opf) return

  const notesName = 'ebook-viewer-notes.xhtml'
  const notesPath = opf.dir === '.' ? notesName : posix.join(opf.dir, notesName)
  zip.file(notesPath, buildNotesXhtml(payload))

  let text = opf.text
    .replace(/\s*<item\b[^>]*id="ebook-viewer-notes"[^>]*\/?>/gi, '')
    .replace(/\s*<itemref\b[^>]*idref="ebook-viewer-notes"[^>]*\/?>/gi, '')
  const manifestItem = `<item id="ebook-viewer-notes" href="${notesName}" media-type="application/xhtml+xml"/>`
  const spineItem = `<itemref idref="ebook-viewer-notes"/>`
  text = text.replace(/<\/manifest>/i, `  ${manifestItem}\n</manifest>`)
  text = text.replace(/<\/spine>/i, `  ${spineItem}\n</spine>`)
  zip.file(opf.path, text)
}

async function readOpf(zip: JSZip): Promise<{ path: string; text: string; dir: string } | null> {
  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) return null
  const container = await containerFile.async('string')
  const opfPath = container.match(/full-path="([^"]+)"/i)?.[1]
  if (!opfPath) return null
  const opfFile = zip.file(opfPath)
  if (!opfFile) return null
  return { path: opfPath, text: await opfFile.async('string'), dir: posix.dirname(opfPath) }
}

function buildNotesXhtml(payload: ExportPayload): string {
  const progress = payload.progress as {
    percent?: number
    chapter?: string
    sentence?: string
    cfi?: string
    updatedAt?: number
  }
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress?.percent ?? 0) * 1000) / 10))
  const chapter = escapeXml(progress?.chapter || '正文')
  const sentence = escapeXml(progress?.sentence || '')
  const annotations = payload.annotations
    .map((annotation) => {
      const note = annotation.note ? `<p class="note">${escapeXml(annotation.note)}</p>` : ''
      return `<article class="annotation">
        <blockquote>${escapeXml(annotation.text)}</blockquote>
        ${note}
        <p class="meta">${styleLabel(annotation.style)} · ${escapeXml(annotation.chapter || '正文')} · ${Math.round(annotation.percent * 1000) / 10}%</p>
      </article>`
    })
    .join('')
  const bookmarks = payload.bookmarks
    .map(
      (bookmark) =>
        `<li><strong>${escapeXml(bookmark.label || '未命名位置')}</strong><span class="meta">${escapeXml(bookmark.chapter || '正文')} · ${Math.round(bookmark.percent * 1000) / 10}%</span></li>`
    )
    .join('')

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>阅读笔记</title>
  <style>
    body { font-family: serif; line-height: 1.75; margin: 2em 1.2em; color: #302c26; }
    h1 { font-size: 1.8em; margin-bottom: 0.2em; }
    h2 { font-size: 1.2em; margin-top: 2em; border-bottom: 1px solid #d8d0c2; padding-bottom: 0.3em; }
    .book-meta, .meta { color: #857d70; font-size: 0.82em; }
    blockquote { margin: 0.6em 0; padding: 0.6em 0.9em; border-left: 3px solid #b99a5b; background: #f7f2e8; }
    .annotation { margin: 1.1em 0; }
    .note { margin: 0.2em 0 0.4em 1em; white-space: pre-wrap; }
    ul { padding-left: 1.2em; }
    li { margin: 0.6em 0; }
    footer { margin-top: 3em; color: #9a9286; font-size: 0.75em; }
  </style>
</head>
<body>
  <h1>阅读笔记</h1>
  <p class="book-meta">《${escapeXml(payload.book.title)}》${payload.book.author ? ` · ${escapeXml(payload.book.author)}` : ''}</p>

  <section>
    <h2>当前进度</h2>
    <p>${chapter} · ${percent}%</p>
    ${sentence ? `<blockquote>${sentence}</blockquote>` : ''}
  </section>

  <section>
    <h2>书签（${payload.bookmarks.length}）</h2>
    ${bookmarks ? `<ul>${bookmarks}</ul>` : '<p class="meta">这本书还没有书签。</p>'}
  </section>

  <section>
    <h2>标注（${payload.annotations.length}）</h2>
    ${annotations || '<p class="meta">这本书还没有标注。</p>'}
  </section>

  <footer>由 Ebook Viewer 导出 · ${escapeXml(payload.exportedAt)}<br />完整标注数据位于 META-INF/ebook-viewer.json。</footer>
</body>
</html>`
}

function styleLabel(style: Annotation['style']): string {
  if (style === 'underline') return '下划线'
  if (style === 'wavy') return '下波浪线'
  if (style === 'none') return '仅笔记'
  return '高亮'
}

function safeFileStem(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|：／＼？＊＜＞｜＂]/g, '_')
      .replace(/[\u0000-\u001f]/g, '')
      .replace(/[. ]+$/g, '')
      .slice(0, 90) || '未命名'
  )
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
