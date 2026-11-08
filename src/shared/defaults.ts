import type { AnnotationColor, AppData, AppSettings, ReaderSettings, StealthSettings } from './types'

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

export const defaultAnnotationColors: AnnotationColor[] = ['yellow', 'green', 'blue', 'pink', 'black']

export const defaultSettings: AppSettings = {
  theme: 'system',
  themeAccent: {
    light: '#9a5a2d',
    dark: '#d49a60'
  },
  annotationColors: [...defaultAnnotationColors],
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
      themeAccent: { ...defaultSettings.themeAccent },
      annotationColors: [...defaultAnnotationColors],
      reader: { ...defaultReaderSettings },
      stealth: { ...defaultStealthSettings },
      hotkeys: { ...defaultSettings.hotkeys }
    },
    bookmarks: [],
    annotations: []
  }
}

export function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    themeAccent: { ...base.themeAccent, ...(patch.themeAccent ?? {}) },
    annotationColors: Array.isArray(patch.annotationColors) ? patch.annotationColors : base.annotationColors,
    reader: { ...base.reader, ...(patch.reader ?? {}) },
    stealth: { ...base.stealth, ...(patch.stealth ?? {}) },
    hotkeys: { ...base.hotkeys, ...(patch.hotkeys ?? {}) }
  }
}
