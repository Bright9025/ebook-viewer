import { desktopCapturer, screen, type Rectangle } from 'electron'
import type { BgSample } from '../shared/types'

const THUMB_WIDTH = 1024

/**
 * Sample the desktop color behind the stealth window.
 *
 * When the window is hidden we can sample the exact rectangle it will occupy.
 * When it is visible we sample a thin ring just outside its bounds so the
 * overlay's own text does not skew the result.
 */
export async function sampleBackground(bounds: Rectangle, interior: boolean): Promise<BgSample | null> {
  try {
    const display = screen.getDisplayMatching(bounds)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: THUMB_WIDTH,
        height: Math.max(1, Math.round((THUMB_WIDTH * display.size.height) / display.size.width))
      },
      fetchWindowIcons: false
    })
    const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
    if (!source || source.thumbnail.isEmpty()) return null

    const size = source.thumbnail.getSize()
    if (!size.width || !size.height) return null
    const bitmap = source.thumbnail.toBitmap()
    const sx = size.width / display.size.width
    const sy = size.height / display.size.height

    const left = (bounds.x - display.bounds.x) * sx
    const top = (bounds.y - display.bounds.y) * sy
    const right = left + bounds.width * sx
    const bottom = top + bounds.height * sy

    const samples: Array<[number, number]> = []
    if (interior) {
      const insetX = Math.max(2, (right - left) * 0.08)
      const insetY = Math.max(2, (bottom - top) * 0.12)
      const stepsX = 12
      const stepsY = 6
      for (let iy = 0; iy < stepsY; iy++) {
        for (let ix = 0; ix < stepsX; ix++) {
          const px = Math.round(left + insetX + ((right - left - insetX * 2) * ix) / (stepsX - 1))
          const py = Math.round(top + insetY + ((bottom - top - insetY * 2) * iy) / (stepsY - 1))
          samples.push([px, py])
        }
      }
    } else {
      const pad = Math.max(2, Math.round(8 * sx))
      const outerLeft = Math.max(0, Math.floor(left - pad))
      const outerTop = Math.max(0, Math.floor(top - pad))
      const outerRight = Math.min(size.width - 1, Math.ceil(right + pad))
      const outerBottom = Math.min(size.height - 1, Math.ceil(bottom + pad))
      const innerLeft = Math.floor(left)
      const innerTop = Math.floor(top)
      const innerRight = Math.ceil(right)
      const innerBottom = Math.ceil(bottom)
      for (let y = outerTop; y <= outerBottom; y += 2) {
        for (let x = outerLeft; x <= outerRight; x += 2) {
          if (x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom) continue
          samples.push([x, y])
        }
      }
      if (samples.length < 8) {
        const corners: Array<[number, number]> = [
          [left + 6, top + 6],
          [right - 6, top + 6],
          [left + 6, bottom - 6],
          [right - 6, bottom - 6]
        ]
        for (const point of corners) samples.push([Math.round(point[0]), Math.round(point[1])])
      }
    }

    let sumR = 0
    let sumG = 0
    let sumB = 0
    let sumLr = 0
    let sumLg = 0
    let sumLb = 0
    let count = 0

    for (const [x, y] of samples) {
      if (x < 0 || y < 0 || x >= size.width || y >= size.height) continue
      const index = (y * size.width + x) * 4
      const b = bitmap[index]
      const g = bitmap[index + 1]
      const r = bitmap[index + 2]
      const a = bitmap[index + 3]
      if (a < 8) continue
      sumR += r
      sumG += g
      sumB += b
      sumLr += srgbToLinear(r / 255)
      sumLg += srgbToLinear(g / 255)
      sumLb += srgbToLinear(b / 255)
      count++
    }

    if (!count) return null
    const luminance = 0.2126 * (sumLr / count) + 0.7152 * (sumLg / count) + 0.0722 * (sumLb / count)
    return {
      r: Math.round(sumR / count),
      g: Math.round(sumG / count),
      b: Math.round(sumB / count),
      luminance: Math.round(luminance * 1000) / 1000
    }
  } catch (error) {
    console.warn('[capture] sample failed:', error)
    return null
  }
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}
