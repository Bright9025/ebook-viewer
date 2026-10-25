import type { AppData, AppSettings, ReaderSettings, StealthSettings } from './types'

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

export const defaultSettings: AppSettings = {
  theme: 'system',
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
      reader: { ...defaultReaderSettings },
      stealth: { ...defaultStealthSettings },
      hotkeys: { ...defaultSettings.hotkeys }
    },
    bookmarks: []
  }
}

export function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    reader: { ...base.reader, ...(patch.reader ?? {}) },
    stealth: { ...base.stealth, ...(patch.stealth ?? {}) },
    hotkeys: { ...base.hotkeys, ...(patch.hotkeys ?? {}) }
  }
}
