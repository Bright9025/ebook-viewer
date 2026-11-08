import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, join, basename } from 'node:path'
import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { Annotation, Book, Bookmark, ImportRequest, ReadingProgress } from '../shared/types'
import { getStore } from './store'

const MAX_COVER_LENGTH = 2_500_000
const EXPORT_SCHEMA = 'ebook-viewer.annotation-export/v1'
const LEGACY_ANNOTATION_COLORS = ['yellow', 'green', 'blue', 'pink', 'black'] as const
const ANNOTATION_STYLES = ['highlight', 'underline', 'wavy', 'none'] as const

interface ExportSidecar {
  schema?: string
  progress?: Partial<ReadingProgress>
  bookmarks?: Array<Partial<Bookmark>>
  annotations?: Array<Partial<Annotation>>
}

export async function addBook(request: ImportRequest): Promise<Book> {
  const store = getStore()
  const id = randomUUID()
  const fileName = `${id}.epub`
  const targetPath = join(store.booksDir, fileName)
  await fs.mkdir(store.booksDir, { recursive: true })
  await fs.copyFile(request.sourcePath, targetPath)

  const now = Date.now()
  const baseTitle = cleanText(request.title) || basename(request.sourcePath, extname(request.sourcePath)) || '未命名'
  const book: Book = {
    id,
    title: uniqueTitle(baseTitle, store.books),
    author: cleanText(request.author),
    description: cleanText(request.description ?? ''),
    cover: typeof request.cover === 'string' && request.cover.length <= MAX_COVER_LENGTH ? request.cover : '',
    fileName,
    addedAt: now,
    lastOpenedAt: 0,
    progress: {
      cfi: '',
      percent: 0,
      chapter: '',
      sentence: '',
      updatedAt: 0
    }
  }

  const sidecar = await readAndCleanExport(targetPath)
  if (sidecar?.progress) book.progress = normalizeProgress(sidecar.progress)
  await store.addBook(book)
  if (sidecar) {
    for (const annotation of sidecar.annotations ?? []) {
      const normalized = normalizeImportedAnnotation(annotation, id)
      if (normalized) await store.addAnnotation(normalized)
    }
    for (const bookmark of sidecar.bookmarks ?? []) {
      const normalized = normalizeImportedBookmark(bookmark, id)
      if (normalized) await store.addBookmark(normalized)
    }
  }
  return book
}

async function readAndCleanExport(path: string): Promise<ExportSidecar | null> {
  try {
    const zip = await JSZip.loadAsync(await fs.readFile(path))
    const sidecarFile = zip.file('META-INF/ebook-viewer.json')
    if (!sidecarFile) return null
    const sidecar = JSON.parse(await sidecarFile.async('string')) as ExportSidecar
    if (sidecar.schema !== EXPORT_SCHEMA) return null

    let changed = false
    for (const name of Object.keys(zip.files)) {
      if (!/\.x?html?$/i.test(name)) continue
      const entry = zip.file(name)
      if (!entry) continue
      const xhtml = await entry.async('string')
      if (!xhtml.includes('ev-annotation')) continue
      const cleaned = stripInlineAnnotations(xhtml)
      if (cleaned !== xhtml) {
        zip.file(name, cleaned)
        changed = true
      }
    }
    if (changed) {
      const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      await fs.writeFile(path, output)
    }
    return sidecar
  } catch (error) {
    console.warn('[library] failed to import reading data', error)
    return null
  }
}

export function stripInlineAnnotations(xhtml: string): string {
  try {
    const document = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml')
    const spans = Array.from(document.getElementsByTagName('span'))
    let changed = false
    for (const span of spans) {
      if (!span.getAttribute('class')?.split(/\s+/).includes('ev-annotation')) continue
      const parent = span.parentNode
      if (!parent) continue
      while (span.firstChild) parent.insertBefore(span.firstChild, span)
      parent.removeChild(span)
      changed = true
    }
    if (!changed) return xhtml
    document.documentElement?.normalize()
    return new XMLSerializer().serializeToString(document)
  } catch {
    return xhtml
  }
}

function normalizeProgress(value: Partial<ReadingProgress>): ReadingProgress {
  return {
    cfi: typeof value.cfi === 'string' ? value.cfi : '',
    percent: Math.max(0, Math.min(1, Number(value.percent ?? 0))),
    chapter: typeof value.chapter === 'string' ? value.chapter : '',
    sentence: typeof value.sentence === 'string' ? value.sentence : '',
    updatedAt: Number(value.updatedAt ?? 0)
  }
}

function normalizeImportedAnnotation(value: Partial<Annotation>, bookId: string): Annotation | null {
  if (!value.cfi || !value.text) return null
  const color =
    typeof value.color === 'string' &&
    (LEGACY_ANNOTATION_COLORS.includes(value.color as (typeof LEGACY_ANNOTATION_COLORS)[number]) ||
      /^#[0-9a-f]{6}$/i.test(value.color))
      ? value.color
      : 'yellow'
  const style = ANNOTATION_STYLES.includes(value.style as (typeof ANNOTATION_STYLES)[number])
    ? (value.style as Annotation['style'])
    : 'highlight'
  const now = Date.now()
  return {
    id: randomUUID(),
    bookId,
    cfi: String(value.cfi),
    text: String(value.text),
    note: typeof value.note === 'string' ? value.note : '',
    color,
    style,
    chapter: typeof value.chapter === 'string' ? value.chapter : '',
    percent: Math.max(0, Math.min(1, Number(value.percent ?? 0))),
    createdAt: Number(value.createdAt ?? now),
    updatedAt: Number(value.updatedAt ?? now)
  }
}

function normalizeImportedBookmark(value: Partial<Bookmark>, bookId: string): Bookmark | null {
  if (!value.cfi) return null
  return {
    id: randomUUID(),
    bookId,
    cfi: String(value.cfi),
    label: typeof value.label === 'string' ? value.label : '导入的书签',
    chapter: typeof value.chapter === 'string' ? value.chapter : '',
    percent: Math.max(0, Math.min(1, Number(value.percent ?? 0))),
    createdAt: Number(value.createdAt ?? Date.now())
  }
}

export async function removeBook(id: string): Promise<void> {
  await getStore().removeBook(id)
}

export async function readBook(id: string): Promise<Uint8Array> {
  const store = getStore()
  const book = store.book(id)
  if (!book) throw new Error('BOOK_NOT_FOUND')
  const file = join(store.booksDir, basename(book.fileName))
  const buffer = await fs.readFile(file)
  return new Uint8Array(buffer)
}

export async function readPath(path: string): Promise<Uint8Array> {
  const buffer = await fs.readFile(path)
  return new Uint8Array(buffer)
}

export async function touchBook(id: string): Promise<void> {
  await getStore().touchBook(id)
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, 200)
}

function uniqueTitle(base: string, books: Book[]): string {
  const used = new Set(books.map((book) => book.title.trim()))
  if (!used.has(base)) return base
  let index = 1
  while (used.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}
