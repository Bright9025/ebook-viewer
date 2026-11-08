import type { AnnotationColorSetting, AppData, AppSettings, ReaderSettings, StealthSettings } from './types'

export const defaultReaderSettings: ReaderSettings = {
  font: 'serif',
  fontSize: 18,
  lineHeight: 1.8,
  margin: 56,
  justify: true
}

export const defaultStealthSettings: StealthSettings = {
  opacity: 0.72,
  hideImages: true,
  width: 560,
  height: 168,
  x: null,
  y: null,
  fontSize: 15
}

export const defaultAnnotationColors: AnnotationColorSetting[] = [
  { id: 'yellow', label: '黄色', value: '#e7b84b' },
  { id: 'green', label: '绿色', value: '#6faf83' },
  { id: 'blue', label: '蓝色', value: '#6e9fc7' },
  { id: 'pink', label: '粉色', value: '#cf83a0' },
  { id: 'black', label: '黑色', value: '#2b2a27' }
]

export const defaultSettings: AppSettings = {
  theme: 'system',
  annotationColors: defaultAnnotationColors.map((color) => ({ ...color })),
  customFonts: [],
  reader: { ...defaultReaderSettings },
  stealth: { ...defaultStealthSettings },
  hotkeys: {
    boss: 'CommandOrControl+Shift+H',
    stealth: 'CommandOrControl+Shift+M'
  },
  lastBookId: null
}

export function createDefaultData(): AppData {
  return {
    books: [],
    settings: {
      ...defaultSettings,
      annotationColors: defaultAnnotationColors.map((color) => ({ ...color })),
      customFonts: [],
      reader: { ...defaultReaderSettings },
      stealth: { ...defaultStealthSettings },
      hotkeys: { ...defaultSettings.hotkeys }
    },
    bookmarks: [],
    annotations: []
  }
}

export function normalizeAnnotationColors(value: unknown): AnnotationColorSetting[] {
  if (!Array.isArray(value)) return defaultAnnotationColors.map((color) => ({ ...color }))
  const colors: AnnotationColorSetting[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      const preset = defaultAnnotationColors.find((color) => color.id === item)
      if (preset) colors.push({ ...preset })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<AnnotationColorSetting>
    const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : ''
    const label = typeof candidate.label === 'string' ? candidate.label : ''
    const hex = typeof candidate.value === 'string' ? candidate.value : ''
    if (!id || !/^#[0-9a-f]{6}$/i.test(hex)) continue
    colors.push({ id, label: label || '自定义颜色', value: hex })
  }
  return colors.length ? colors : defaultAnnotationColors.map((color) => ({ ...color }))
}

export function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    annotationColors: normalizeAnnotationColors(patch.annotationColors ?? base.annotationColors),
    customFonts: Array.isArray(patch.customFonts) ? patch.customFonts : base.customFonts,
    reader: { ...base.reader, ...(patch.reader ?? {}) },
    stealth: { ...base.stealth, ...(patch.stealth ?? {}) },
    hotkeys: { ...base.hotkeys, ...(patch.hotkeys ?? {}) }
  }
}
