import ePub from 'epubjs'
import type { Book, NavItem } from 'epubjs'

export interface EpubMeta {
  title: string
  author: string
  cover: string
}

export interface FlatTocItem {
  href: string
  label: string
  level: number
}

export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer
  }
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export async function inspectEpub(data: ArrayBuffer): Promise<EpubMeta> {
  const book = ePub(data)
  try {
    await book.ready
    const metadata = (await book.loaded.metadata) as { title?: string; creator?: string } | undefined
    let cover = ''
    try {
      const url = await book.coverUrl()
      if (url) cover = await coverToDataUrl(url)
    } catch (error) {
      console.warn('[epub] cover extraction failed', error)
    }
    return {
      title: String(metadata?.title ?? '').trim(),
      author: String(metadata?.creator ?? '').trim(),
      cover
    }
  } finally {
    try {
      // Let epub.js finish its pending resource-replacement microtasks before
      // tearing the temporary book down.
      await new Promise((resolve) => window.setTimeout(resolve, 80))
      book.destroy()
    } catch {
      /* ignore */
    }
  }
}

export function flattenToc(items: NavItem[] | undefined, level = 0): FlatTocItem[] {
  if (!items?.length) return []
  const result: FlatTocItem[] = []
  for (const item of items) {
    const label = String(item.label ?? '').trim()
    const href = String(item.href ?? '')
    if (href) result.push({ href, label: label || '未命名章节', level })
    if (item.subitems?.length) result.push(...flattenToc(item.subitems as NavItem[], level + 1))
  }
  return result
}

export function chapterLabelFor(toc: FlatTocItem[], href: string | undefined): string {
  if (!href) return ''
  const clean = stripHash(href)
  let best: FlatTocItem | null = null
  for (const item of toc) {
    const itemHref = stripHash(item.href)
    if (itemHref === clean) return item.label
    if (clean.startsWith(itemHref) || itemHref.startsWith(clean)) {
      if (!best || itemHref.length > stripHash(best.href).length) best = item
    }
  }
  return best?.label ?? ''
}

export function stripHash(href: string): string {
  return href.split('#')[0]
}

export function loadBook(data: ArrayBuffer): Book {
  return ePub(data)
}

async function coverToDataUrl(url: string): Promise<string> {
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
  } catch {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('cover load failed'))
    })
  }
  if (!image.naturalWidth || !image.naturalHeight) return ''
  const width = 300
  const height = 450
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#f1e7d5'
  ctx.fillRect(0, 0, width, height)
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  URL.revokeObjectURL(url)
  return canvas.toDataURL('image/jpeg', 0.84)
}
