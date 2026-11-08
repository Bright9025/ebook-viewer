import { app, BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join, posix } from 'node:path'
import JSZip from 'jszip'
import type { Annotation, Bookmark, ExportMode } from '../shared/types'
import { readBook } from './library'
import { getStore } from './store'

interface ExportPayload {
  schema: string
  exportedAt: string
  book: {
    id: string
    title: string
    author: string
    fileName: string
  }
  progress: unknown
  bookmarks: Bookmark[]
  annotations: Annotation[]
}

const annotationHex: Record<Annotation['color'], string> = {
  yellow: '#e7b84b',
  green: '#6faf83',
  blue: '#6e9fc7',
  pink: '#cf83a0',
  black: '#2b2a27'
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
    const suffix = exportMode === 'inline' ? '原位标注版' : '标注版'
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
      fileName: book.fileName
    },
    progress: { ...book.progress },
    bookmarks,
    annotations
  }

  zip.file('META-INF/ebook-viewer.json', JSON.stringify(payload, null, 2))
  if (exportMode === 'inline') {
    await injectInlineAnnotations(zip, payload)
  } else {
    await injectNotesDocument(zip, payload)
  }

  const output = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
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
      '数据版：保留原文，附带阅读笔记章节和完整标注 JSON。\n原位标注版：把高亮、下划线和波浪线直接写进原文。\n两种方式都只生成一个 EPUB 文件。',
    buttons: ['数据版（附带阅读笔记）', '原位标注版（写入正文）', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  }
  const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (result.response === 2) return null
  return result.response === 1 ? 'inline' : 'data'
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

async function injectInlineAnnotations(zip: JSZip, payload: ExportPayload): Promise<void> {
  const opf = await readOpf(zip)
  if (!opf) return
  const manifest = new Map<string, string>()
  for (const tag of opf.text.match(/<item\b[^>]*>/gi) ?? []) {
    const attrs = parseAttrs(tag)
    if (attrs.id && attrs.href) manifest.set(attrs.id, attrs.href)
  }
  const spine = (opf.text.match(/<itemref\b[^>]*>/gi) ?? [])
    .map((tag) => parseAttrs(tag).idref ?? '')
    .filter(Boolean)

  const byChapter = new Map<string, Annotation[]>()
  for (const annotation of payload.annotations) {
    const index = spineIndexFromCfi(annotation.cfi)
    const idref = index >= 0 ? spine[index] : ''
    const href = idref ? manifest.get(idref) : ''
    if (!href) continue
    const path = posix.normalize(posix.join(opf.dir, decodeURIComponent(href)))
    const list = byChapter.get(path) ?? []
    list.push(annotation)
    byChapter.set(path, list)
  }

  for (const [path, annotations] of byChapter) {
    const file = zip.file(path)
    if (!file) continue
    let xhtml = await file.async('string')
    for (const annotation of annotations) {
      xhtml = wrapAnnotationInXhtml(xhtml, annotation)
    }
    zip.file(path, xhtml)
  }
}

function wrapAnnotationInXhtml(xhtml: string, annotation: Annotation): string {
  const { text, nodes } = scanText(xhtml)
  const range = findQuote(text, annotation.text)
  if (!range) return xhtml

  const open = annotationSpanOpen(annotation)
  const inserts: Array<{ pos: number; text: string }> = []
  for (const node of nodes) {
    if (node.end <= range.start || node.start >= range.end) continue
    const localStart = Math.max(range.start, node.start) - node.start
    const localEnd = Math.min(range.end, node.end) - node.start
    const rawStart = node.rawStart + node.starts[localStart]
    const rawEnd = node.rawStart + node.ends[localEnd - 1]
    if (rawStart == null || rawEnd == null) continue
    inserts.push({ pos: rawEnd, text: '</span>' })
    inserts.push({ pos: rawStart, text: open })
  }
  inserts.sort((a, b) => b.pos - a.pos || (a.text.startsWith('</') ? -1 : 1))
  let output = xhtml
  for (const insert of inserts) {
    output = output.slice(0, insert.pos) + insert.text + output.slice(insert.pos)
  }
  return output
}

function annotationSpanOpen(annotation: Annotation): string {
  const color = annotationHex[annotation.color] ?? '#e7b84b'
  const style =
    annotation.style === 'highlight'
      ? `background-color:${color}66;`
      : annotation.style === 'underline'
        ? `text-decoration:underline solid ${color};text-decoration-thickness:1.6px;text-underline-offset:3px;`
        : annotation.style === 'wavy'
          ? `text-decoration:underline wavy ${color};text-decoration-thickness:1.6px;text-underline-offset:3px;`
          : ''
  const title = annotation.note ? ` title="${escapeXml(annotation.note)}"` : ''
  return `<span class="ev-annotation ev-${annotation.style}" data-annotation-id="${escapeXml(annotation.id)}" style="${style}"${title}>`
}

interface TextNodeRange {
  rawStart: number
  rawEnd: number
  start: number
  end: number
  starts: number[]
  ends: number[]
}

function scanText(xhtml: string): { text: string; nodes: TextNodeRange[] } {
  const nodes: TextNodeRange[] = []
  let text = ''
  let index = 0
  while (index < xhtml.length) {
    if (xhtml.startsWith('<!--', index)) {
      const end = xhtml.indexOf('-->', index + 4)
      index = end >= 0 ? end + 3 : xhtml.length
      continue
    }
    if (xhtml[index] === '<') {
      const end = findTagEnd(xhtml, index)
      const tag = xhtml.slice(index + 1, end).trim()
      if (/^(script|style)\b/i.test(tag)) {
        const close = new RegExp(`</${tag.split(/\s/)[0]}>`, 'i')
        const match = close.exec(xhtml.slice(end + 1))
        index = match ? end + 1 + match.index + match[0].length : end + 1
        continue
      }
      index = end + 1
      continue
    }
    const next = xhtml.indexOf('<', index)
    const rawEnd = next >= 0 ? next : xhtml.length
    const raw = xhtml.slice(index, rawEnd)
    const decoded = decodeText(raw)
    const start = text.length
    text += decoded.text
    nodes.push({
      rawStart: index,
      rawEnd,
      start,
      end: text.length,
      starts: decoded.starts,
      ends: decoded.ends
    })
    index = rawEnd
  }
  return { text, nodes }
}

function findQuote(text: string, quote: string): { start: number; end: number } | null {
  if (!quote) return null
  const direct = text.indexOf(quote)
  if (direct >= 0) return { start: direct, end: direct + quote.length }

  const normalized = normalizeWithMap(text)
  const target = quote.replace(/\s+/g, ' ').trim()
  const index = normalized.text.indexOf(target)
  if (index < 0) return null
  const start = normalized.map[index]
  const last = normalized.map[index + target.length - 1]
  return { start, end: last + 1 }
}

function normalizeWithMap(text: string): { text: string; map: number[] } {
  let output = ''
  const map: number[] = []
  let pendingSpace = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (/\s/.test(char)) {
      pendingSpace = output.length > 0
      continue
    }
    if (pendingSpace) {
      output += ' '
      map.push(index)
      pendingSpace = false
    }
    output += char
    map.push(index)
  }
  return { text: output, map }
}

function decodeText(raw: string): { text: string; starts: number[]; ends: number[] } {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index]
    if (char === '&') {
      const end = raw.indexOf(';', index + 1)
      if (end > index + 1 && end - index <= 12) {
        const entity = raw.slice(index + 1, end)
        const decoded = decodeEntity(entity)
        if (decoded !== null) {
          for (let i = 0; i < decoded.length; i++) {
            text += decoded[i]
            starts.push(index)
            ends.push(end + 1)
          }
          index = end
          continue
        }
      }
    }
    text += char
    starts.push(index)
    ends.push(index + 1)
  }
  return { text, starts, ends }
}

function decodeEntity(entity: string): string | null {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  }
  if (entity[0] === '#') {
    const value = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    if (!Number.isFinite(value)) return null
    try {
      return String.fromCodePoint(value)
    } catch {
      return null
    }
  }
  return named[entity] ?? null
}

function findTagEnd(text: string, start: number): number {
  let quote = ''
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return index
    }
  }
  return text.length - 1
}

function spineIndexFromCfi(cfi: string): number {
  const match = cfi.match(/^epubcfi\(\/6\/(\d+)/)
  if (!match) return -1
  const rank = Number(match[1])
  return Number.isFinite(rank) && rank >= 2 ? Math.floor(rank / 2) - 1 : -1
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2]
  }
  return attrs
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
