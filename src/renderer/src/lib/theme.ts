import type { AppTheme, ReaderFont } from '@shared/types'

export const readerFontStacks: Record<ReaderFont, string> = {
  serif: '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, serif',
  song: 'SimSun, "Songti SC", "Noto Serif CJK SC", serif',
  kai: 'KaiTi, STKaiti, "Kaiti SC", serif',
  sans: '"Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
}

export const readerFontLabels: Record<ReaderFont, string> = {
  serif: '思源宋体',
  song: '宋体',
  kai: '楷体',
  sans: '黑体'
}

export interface ReaderPalette {
  background: string
  ink: string
  muted: string
  link: string
  selection: string
}

export function readerPalette(theme: AppTheme): ReaderPalette {
  if (theme === 'dark') {
    return {
      background: '#17191d',
      ink: '#d8d1c2',
      muted: '#8e8778',
      link: '#d6a56e',
      selection: 'rgba(214,165,110,0.26)'
    }
  }
  return {
    background: '#faf5e9',
    ink: '#302c25',
    muted: '#8d8474',
    link: '#9a5a2d',
    selection: 'rgba(154,90,45,0.18)'
  }
}

export function appBackground(theme: AppTheme): string {
  return theme === 'dark' ? '#15171a' : '#f6f1e7'
}
