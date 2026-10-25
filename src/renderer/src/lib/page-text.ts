import type { Rendition } from 'epubjs'

interface CharBox {
  ch: string
  top: number
  left: number
}

interface VisibleBox {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Extract the text of the currently displayed EPUB page, line by line.
 * The stealth overlay renders this text itself, which lets us colour every
 * character from the desktop pixels underneath it.
 */
export function extractPageLines(rendition: Rendition | null): string[] {
  const contents = getContents(rendition)
  if (!contents) return []
  const box = visibleBox(contents)
  if (!box) return []

  const doc = contents.document as Document
  const chars: CharBox[] = []
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT
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
      for (let offset = 0; offset < text.length; offset++) {
        const ch = text[offset]
        if (ch === '\n' || ch === '\r') continue
        const rect = charRect(doc, textNode, offset)
        if (!rect || !intersects(rect, box)) continue
        chars.push({ ch, top: rect.top, left: rect.left })
      }
    }
    node = walker.nextNode()
  }

  if (!chars.length) return []
  chars.sort((a, b) => (Math.abs(a.top - b.top) > 3 ? a.top - b.top : a.left - b.left))

  const lines: { top: number; chars: CharBox[] }[] = []
  for (const char of chars) {
    const line = lines[lines.length - 1]
    if (!line || Math.abs(char.top - line.top) > 6) {
      lines.push({ top: char.top, chars: [char] })
    } else {
      line.chars.push(char)
    }
  }

  return lines
    .map((line) =>
      line.chars
        .sort((a, b) => a.left - b.left)
        .map((char) => char.ch)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
}

function getContents(rendition: Rendition | null): any | null {
  if (!rendition) return null
  const list = rendition.getContents() as unknown
  const array = (Array.isArray(list) ? list : [list]).filter((item: any) => item?.document?.body)
  const parentWidth = window.innerWidth
  const parentHeight = window.innerHeight
  return (
    array.find((item: any) => {
      const frame = item.window?.frameElement as HTMLIFrameElement | null
      if (!frame) return false
      const rect = frame.getBoundingClientRect()
      return rect.width > 4 && rect.height > 4 && rect.right > 1 && rect.bottom > 1 && rect.left < parentWidth && rect.top < parentHeight
    }) ?? array[0] ?? null
  )
}

function visibleBox(contents: any): VisibleBox | null {
  const frame = contents.window?.frameElement as HTMLIFrameElement | null
  if (!frame || !contents.document?.body) return null
  const frameRect = frame.getBoundingClientRect()
  const left = Math.max(0, -frameRect.left)
  const top = Math.max(0, -frameRect.top)
  const right = Math.min(contents.window.innerWidth, window.innerWidth - frameRect.left)
  const bottom = Math.min(contents.window.innerHeight, window.innerHeight - frameRect.top)
  if (right - left < 10 || bottom - top < 10) return null
  return { left, top, right, bottom }
}

function intersects(rect: DOMRect, box: VisibleBox): boolean {
  return rect.width > 0 && rect.height > 0 && rect.right > box.left + 0.5 && rect.left < box.right - 0.5 && rect.bottom > box.top + 0.5 && rect.top < box.bottom - 0.5
}

function charRect(doc: Document, node: Text, offset: number): DOMRect | null {
  const length = node.nodeValue?.length ?? 0
  if (offset < 0 || offset >= length) return null
  const range = doc.createRange()
  try {
    range.setStart(node, offset)
    range.setEnd(node, Math.min(length, offset + 1))
    const rect = range.getBoundingClientRect()
    return rect && rect.width > 0 && rect.height > 0 ? rect : null
  } catch {
    return null
  }
}
