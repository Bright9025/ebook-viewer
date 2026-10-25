import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, join, basename } from 'node:path'
import type { Book, ImportRequest } from '../shared/types'
import { getStore } from './store'

const MAX_COVER_LENGTH = 2_500_000

export async function addBook(request: ImportRequest): Promise<Book> {
  const store = getStore()
  const id = randomUUID()
  const fileName = `${id}.epub`
  await fs.mkdir(store.booksDir, { recursive: true })
  await fs.copyFile(request.sourcePath, join(store.booksDir, fileName))

  const now = Date.now()
  const book: Book = {
    id,
    title: cleanText(request.title) || basename(request.sourcePath, extname(request.sourcePath)) || '未命名',
    author: cleanText(request.author),
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
  await store.addBook(book)
  return book
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
