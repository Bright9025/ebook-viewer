import type { Rendition } from 'epubjs'

export interface ReaderAnchor {
  cfi: string
  sentence: string
  href: string
  percent: number
}

interface VisibleBox {
  left: number
  top: number
  right: number
  bottom: number
}

const SENTENCE_END = new Set(['。', '！', '？', '!', '?', '…', '；', ';', '\n'])

/**
 * Find the first visible character of the current EPUB page and turn it into
 * a CFI plus a short sentence used both for restoring and for verification.
 */
export function collectTopAnchor(rendition: Rendition | null): ReaderAnchor | null {
  const contents = getContents(rendition)
  if (!contents) return null
  const box = visibleBox(contents)
  if (!box) return null

  const anchor = findFirstVisibleText(contents, box)
  if (!anchor) return null

  const location = safeLocation(rendition)
  const href = String(location?.start?.href ?? '')
  const percent = Number(location?.start?.percentage ?? 0) || 0

  return {
    cfi: anchor.cfi,
    sentence: anchor.sentence,
    href,
    percent
  }
}

/** Whether the given CFI still sits at the top of the current page. */
export function isAnchorAtTop(rendition: Rendition | null, cfi: string): boolean {
  const contents = getContents(rendition)
  if (!contents || !cfi) return false
  const box = visibleBox(contents)
  if (!box) return false
  let rect: DOMRect | null = null
  try {
    const range = contents.range(cfi) as Range | null
    if (!range) return false
    rect = range.getBoundingClientRect()
  } catch {
    return false
  }
  if (!rect || rect.height <= 0) return false
  const lineHeight = 30
  return (
    rect.left >= box.left - 6 &&
    rect.left < box.right &&
    rect.top >= box.top - 8 &&
    rect.top <= box.top + lineHeight * 1.8
  )
}

/** Whether the given CFI still sits somewhere on the current page. */
export function isAnchorVisible(rendition: Rendition | null, cfi: string): boolean {
  const contents = getContents(rendition)
  if (!contents || !cfi) return false
  const box = visibleBox(contents)
  if (!box) return false
  try {
    const range = contents.range(cfi) as Range | null
    if (!range) return false
    return intersects(range.getBoundingClientRect(), box)
  } catch {
    return false
  }
}

export function normalizeText(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, '')
    .replace(/[。！？!?…；;，,、""''《》「」『』（）()]/g, '')
    .toLowerCase()
}

export function sameSentence(a: string, b: string): boolean {
  const left = normalizeText(a)
  const right = normalizeText(b)
  if (!left || !right) return false
  if (left === right) return true
  const size = Math.min(12, left.length, right.length)
  if (size >= 6 && (left.slice(0, size) === right.slice(0, size) || left.includes(right.slice(0, size)) || right.includes(left.slice(0, size)))) {
    return true
  }
  return false
}

function getContents(rendition: Rendition | null): any | null {
  if (!rendition) return null
  const list = rendition.getContents() as unknown
  const array = (Array.isArray(list) ? list : [list]).filter((item: any) => item?.document?.body)
  if (!array.length) return null
  const parentWidth = window.innerWidth
  const parentHeight = window.innerHeight
  const visible = array.find((item: any) => {
    const frame = item.window?.frameElement as HTMLIFrameElement | null
    if (!frame) return false
    const rect = frame.getBoundingClientRect()
    return (
      rect.width > 4 &&
      rect.height > 4 &&
      rect.right > 1 &&
      rect.left < parentWidth - 1 &&
      rect.bottom > 1 &&
      rect.top < parentHeight - 1
    )
  })
  return visible ?? array[0]
}

function visibleBox(contents: any): VisibleBox | null {
  const frame = contents.window?.frameElement as HTMLIFrameElement | null
  const doc = contents.document as Document
  if (!frame || !doc?.body) return null
  const frameRect = frame.getBoundingClientRect()
  const parentWidth = window.innerWidth
  const parentHeight = window.innerHeight
  const left = Math.max(0, -frameRect.left)
  const top = Math.max(0, -frameRect.top)
  const right = Math.min(contents.window.innerWidth, parentWidth - frameRect.left)
  const bottom = Math.min(contents.window.innerHeight, parentHeight - frameRect.top)
  if (right - left < 10 || bottom - top < 10) return null
  return { left, top, right, bottom }
}

function intersects(rect: DOMRect, box: VisibleBox): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > box.left + 0.5 &&
    rect.left < box.right - 0.5 &&
    rect.bottom > box.top + 0.5 &&
    rect.top < box.bottom - 0.5
  )
}

function findFirstVisibleText(contents: any, box: VisibleBox): { cfi: string; sentence: string } | null {
  const doc = contents.document as Document
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const text = node.nodeValue ?? ''
      if (!text.trim()) return NodeFilter.FILTER_REJECT
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'RT', 'RP'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT
      const style = contents.window.getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })

  let node: Node | null = walker.nextNode()
  while (node) {
    const textNode = node as Text
    const text = textNode.nodeValue ?? ''
    const probe = doc.createRange()
    probe.selectNodeContents(textNode)
    const rects = Array.from(probe.getClientRects())
    if (rects.some((rect) => intersects(rect as DOMRect, box))) {
      const offset = firstVisibleOffset(doc, textNode, box)
      if (offset !== null) {
        let start = sentenceStart(text, offset)
        if (start !== offset && !isOffsetVisible(doc, textNode, start, box)) {
          start = offset
        }
        const safeStart = Math.min(Math.max(0, start), Math.max(0, text.length - 1))
        const safeEnd = Math.min(text.length, Math.max(safeStart + 1, offset + 1))
        const range = doc.createRange()
        try {
          range.setStart(textNode, safeStart)
          range.setEnd(textNode, safeEnd)
          const cfi = contents.cfiFromRange(range) as string
          const sentence = sentenceFrom(text, safeStart)
          return { cfi, sentence }
        } catch (error) {
          console.warn('[anchor] failed to build cfi', error)
          return null
        }
      }
    }
    node = walker.nextNode()
  }
  return null
}

function firstVisibleOffset(doc: Document, node: Text, box: VisibleBox): number | null {
  const text = node.nodeValue ?? ''
  for (let offset = 0; offset < text.length; offset++) {
    const rect = charRect(doc, node, offset)
    if (rect && intersects(rect, box)) return offset
  }
  return null
}

function isOffsetVisible(doc: Document, node: Text, offset: number, box: VisibleBox): boolean {
  const rect = charRect(doc, node, offset)
  return Boolean(rect && intersects(rect, box))
}

function charRect(doc: Document, node: Text, offset: number): DOMRect | null {
  const length = node.nodeValue?.length ?? 0
  if (offset < 0 || offset >= length) return null
  const range = doc.createRange()
  try {
    range.setStart(node, offset)
    range.setEnd(node, Math.min(length, offset + 1))
    const rect = range.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null
    return rect
  } catch {
    return null
  }
}

function sentenceStart(text: string, offset: number): number {
  const limit = Math.max(0, offset - 120)
  for (let index = offset - 1; index >= limit; index--) {
    const char = text[index]
    if (SENTENCE_END.has(char)) return index + 1
    if (char === '.' && /\s/.test(text[index + 1] ?? '')) return index + 1
  }
  return offset
}

function sentenceText(text: string, offset: number): string {
  let start = sentenceStart(text, offset)
  if (start > offset) start = offset
  let end = Math.min(text.length, offset + 160)
  for (let index = offset; index < end; index++) {
    const char = text[index]
    if (SENTENCE_END.has(char) || (char === '.' && /\s/.test(text[index + 1] ?? ''))) {
      end = index + 1
      break
    }
  }
  const sentence = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return sentence.slice(0, 160)
}

/** Sentence starting exactly at `start` (used when the anchor was clamped to a visible character). */
function sentenceFrom(text: string, start: number): string {
  let end = Math.min(text.length, start + 160)
  for (let index = start; index < end; index++) {
    const char = text[index]
    if (SENTENCE_END.has(char) || (char === '.' && /\s/.test(text[index + 1] ?? ''))) {
      end = index + 1
      break
    }
  }
  const sentence = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return sentence.slice(0, 160)
}

function safeLocation(rendition: Rendition | null): any {
  try {
    return rendition?.currentLocation()
  } catch {
    return null
  }
}
