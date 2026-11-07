import type { AnnotationColor, AnnotationStyle } from '@shared/types'

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

export const annotationColors: AnnotationColorOption[] = [
  { color: 'yellow', label: '黄色', swatch: '#e7b84b', fill: 'rgba(231, 184, 75, 0.38)' },
  { color: 'green', label: '绿色', swatch: '#6faf83', fill: 'rgba(111, 175, 131, 0.34)' },
  { color: 'blue', label: '蓝色', swatch: '#6e9fc7', fill: 'rgba(110, 159, 199, 0.34)' },
  { color: 'pink', label: '粉色', swatch: '#cf83a0', fill: 'rgba(207, 131, 160, 0.32)' },
  { color: 'black', label: '黑色', swatch: '#2b2a27', fill: 'rgba(43, 42, 39, 0.28)' }
]

export const annotationStyles: AnnotationStyleOption[] = [
  { style: 'highlight', label: '高亮' },
  { style: 'underline', label: '下划线' },
  { style: 'wavy', label: '下波浪线' },
  { style: 'none', label: '只记笔记' }
]

export function annotationColor(color: AnnotationColor): AnnotationColorOption {
  return annotationColors.find((item) => item.color === color) ?? annotationColors[0]
}

export function annotationStyle(style: AnnotationStyle): string {
  return annotationStyles.find((item) => item.style === style)?.label ?? '高亮'
}