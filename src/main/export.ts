import { app, BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, extname, join, posix } from 'node:path'
import JSZip from 'jszip'
import type { Annotation, Bookmark } from '../shared/types'
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

export async function exportBookAsEpub(
  bookId: string,
  parent: BrowserWindow | null,
  targetPath?: string
): Promise<string | null> {
  const store = getStore()
  const book = store.book(bookId)
  if (!book) throw new Error('BOOK_NOT_FOUND')

  let filePath = targetPath?.trim() ?? ''
  if (!filePath) {
    const safeTitle = book.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 90) || '未命名'
    const defaultPath = join(app.getPath('downloads'), `${safeTitle}-标注版.epub`)
    const result = parent
      ? await dialog.showSaveDialog(parent, {
          title: '导出带标注的 EPUB',
          defaultPath,
          filters: [{ name: 'EPUB 电子书', extensions: ['epub'] }]
        })
      : await dialog.showSaveDialog({
          title: '导出带标注的 EPUB',
          defaultPath,
          filters: [{ name: 'EPUB 电子书', extensions: ['epub'] }]
        })
    if (result.canceled || !result.filePath) return null
    filePath = result.filePath
  }
  if (!extname(filePath).toLowerCase()) filePath += '.epub'

  const bytes = await readBook(bookId)
  const zip = await JSZip.loadAsync(Buffer.from(bytes))
  const exportedAt = new Date().toISOString()
  const progress = { ...book.progress }
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
    progress,
    bookmarks,
    annotations
  }

  zip.file('META-INF/ebook-viewer.json', JSON.stringify(payload, null, 2))
  await injectNotesDocument(zip, payload)

  const output = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, output)
  return filePath
}

async function injectNotesDocument(zip: JSZip, payload: ExportPayload): Promise<void> {
  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) return
  const container = await containerFile.async('string')
  const opfPath = container.match(/full-path="([^"]+)"/i)?.[1]
  if (!opfPath) return
  const opfFile = zip.file(opfPath)
  if (!opfFile) return

  const opfDir = posix.dirname(opfPath)
  const notesName = 'ebook-viewer-notes.xhtml'
  const notesPath = opfDir === '.' ? notesName : posix.join(opfDir, notesName)
  zip.file(notesPath, buildNotesXhtml(payload))

  let opf = await opfFile.async('string')
  opf = opf
    .replace(/\s*<item\b[^>]*id="ebook-viewer-notes"[^>]*\/>/gi, '')
    .replace(/\s*<itemref\b[^>]*idref="ebook-viewer-notes"[^>]*\/>/gi, '')
  const manifestItem = `<item id="ebook-viewer-notes" href="${notesName}" media-type="application/xhtml+xml"/>`
  const spineItem = `<itemref idref="ebook-viewer-notes"/>`
  opf = opf.replace(/<\/manifest>/i, `  ${manifestItem}\n</manifest>`)
  opf = opf.replace(/<\/spine>/i, `  ${spineItem}\n</spine>`)
  zip.file(opfPath, opf)
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
