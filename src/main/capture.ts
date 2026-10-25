import { desktopCapturer, screen, type Rectangle } from 'electron'
import type { UnderlayCapture } from '../shared/types'

/**
 * Capture the desktop rectangle covered by the stealth window.
 *
 * The stealth window calls `setContentProtection(true)`, so Windows excludes
 * the overlay itself from this capture. What remains is the real background
 * under every glyph, not an average of the window border.
 */
export async function captureUnderlay(bounds: Rectangle): Promise<UnderlayCapture | null> {
  try {
    const display = screen.getDisplayMatching(bounds)
    const scale = display.scaleFactor || 1
    const width = Math.min(4096, Math.max(64, Math.round(display.size.width * scale)))
    const height = Math.min(4096, Math.max(64, Math.round((width * display.size.height) / display.size.width)))

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
      fetchWindowIcons: false
    })
    const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
    if (!source || source.thumbnail.isEmpty()) return null

    const image = source.thumbnail
    const size = image.getSize()
    if (!size.width || !size.height) return null

    const sx = size.width / display.size.width
    const sy = size.height / display.size.height
    const left = (bounds.x - display.bounds.x) * sx
    const top = (bounds.y - display.bounds.y) * sy

    const x = Math.max(0, Math.floor(left))
    const y = Math.max(0, Math.floor(top))
    const w = Math.max(1, Math.min(size.width - x, Math.ceil(bounds.width * sx)))
    const h = Math.max(1, Math.min(size.height - y, Math.ceil(bounds.height * sy)))
    if (w < 8 || h < 8) return null

    const crop = image.crop({ x, y, width: w, height: h })
    return {
      dataUrl: crop.toDataURL(),
      width: w,
      height: h,
      windowWidth: bounds.width,
      windowHeight: bounds.height,
      offsetX: Math.max(0, display.bounds.x - bounds.x),
      offsetY: Math.max(0, display.bounds.y - bounds.y)
    }
  } catch (error) {
    console.warn('[capture] underlay capture failed:', error)
    return null
  }
}
