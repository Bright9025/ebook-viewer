import type { AnnotationColor, AnnotationStyle } from '@shared/types'
import { defaultAnnotationColors } from '@shared/defaults'

export interface AnnotationColorOption {
  color: AnnotationColor
  label: string
  swatch: string
  fill: string
}

export interface AnnotationStyleOption {
  style: AnnotationStyle
  label: string
}

export const annotationColors: AnnotationColorOption[] = defaultAnnotationColors.map((item) => ({
  color: item.value,
  label: item.label,
  swatch: item.value,
  fill: hexToRgba(item.value, 0.35)
}))

export const annotationStyles: AnnotationStyleOption[] = [
  { style: 'highlight', label: '高亮' },
  { style: 'underline', label: '下划线' },
  { style: 'wavy', label: '下波浪线' },
  { style: 'none', label: '只记笔记' }
]

export function annotationColor(color: AnnotationColor): AnnotationColorOption {
  const preset = defaultAnnotationColors.find((item) => item.id === color || item.value === color)
  const swatch = preset?.value ?? (/^#[0-9a-f]{6}$/i.test(color) ? color : defaultAnnotationColors[0].value)
  return {
    color,
    label: preset?.label ?? '自定义',
    swatch,
    fill: hexToRgba(swatch, 0.35)
  }
}

export function annotationStyle(style: AnnotationStyle): string {
  return annotationStyles.find((item) => item.style === style)?.label ?? '高亮'
}

export function hexToRgba(hex: string, alpha: number): string {
  const match = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!match) return `rgba(231, 184, 75, ${alpha})`
  return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${alpha})`
}
