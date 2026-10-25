import type { BgSample } from '@shared/types'

export interface InkStyle {
  color: string
  shadow: string
  contrast: number
}

interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * Build a text color that follows the hue of the desktop behind the overlay
 * but stays deliberately low-contrast. The target contrast is roughly 3:1:
 * readable at a glance, not something a passer-by would notice.
 */
export function inkForBackground(sample: BgSample, opacity: number): InkStyle {
  const bg: Rgb = {
    r: clampByte(sample.r),
    g: clampByte(sample.g),
    b: clampByte(sample.b)
  }
  const bgLuminance = relativeLuminance(bg)
  const useDarkText = bgLuminance > 0.38
  const hsl = rgbToHsl(bg)
  const saturation = Math.min(hsl.s, 0.2)

  // Start with an ink far from the background and walk its lightness toward
  // the background until the blended contrast lands near 3:1.
  let lightness = useDarkText ? 0.12 : 0.95
  let alpha = clamp(opacity, 0.5, 0.92)
  let text = hslToRgb(hsl.h, saturation, lightness)
  let effective = contrastRatio(blend(text, bg, alpha), bg)
  const targetLow = 2.6
  const targetHigh = 3.6

  for (let step = 0; step < 60; step++) {
    if (effective >= targetLow && effective <= targetHigh) break
    const delta = effective > targetHigh ? (useDarkText ? 0.012 : -0.01) : useDarkText ? -0.012 : 0.01
    lightness = clamp(lightness + delta, 0.02, 0.985)
    text = hslToRgb(hsl.h, saturation, lightness)
    effective = contrastRatio(blend(text, bg, alpha), bg)
  }

  // Mid-gray backgrounds cannot reach 3:1 at low opacity; nudge opacity only
  // when the result would otherwise be unreadable.
  let guard = 0
  while (effective < 2.35 && alpha < 0.9 && guard++ < 10) {
    alpha = Math.min(0.92, alpha + 0.03)
    effective = contrastRatio(blend(text, bg, alpha), bg)
  }

  return {
    color: `rgba(${text.r}, ${text.g}, ${text.b}, ${round(alpha, 2)})`,
    shadow: `0 0 1px rgba(${bg.r}, ${bg.g}, ${bg.b}, 0.6)`,
    contrast: round(effective, 2)
  }
}

export function relativeLuminance(color: Rgb): number {
  return 0.2126 * channelToLinear(color.r) + 0.7152 * channelToLinear(color.g) + 0.0722 * channelToLinear(color.b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

function blend(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha)
  }
}

function channelToLinear(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function rgbToHsl(color: Rgb): { h: number; s: number; l: number } {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0)
      break
    case g:
      h = (b - r) / d + 2
      break
    default:
      h = (r - g) / d + 4
  }
  return { h: h / 6, s, l }
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const value = Math.round(l * 255)
    return { r: value, g: value, b: value }
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
