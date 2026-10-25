import { globalShortcut } from 'electron'
import type { HotkeyStatus } from '../shared/types'
import { getStore } from './store'
import { hideStealth, isStealthVisible, openStealth, sendToMain, toggleBoss } from './windows'

export function registerHotkeys(): HotkeyStatus {
  globalShortcut.unregisterAll()
  const { hotkeys } = getStore().settings
  let boss = false
  let stealth = false
  let error: string | undefined

  try {
    boss = globalShortcut.register(hotkeys.boss, () => toggleBoss())
    if (!boss) error = `无法注册老板键 ${hotkeys.boss}（可能被其他程序占用）`
  } catch (cause) {
    error = `老板键注册失败：${String(cause)}`
  }

  try {
    stealth = globalShortcut.register(hotkeys.stealth, () => {
      if (isStealthVisible()) hideStealth()
      else void openStealth()
    })
    if (!stealth) {
      error = error ?? `无法注册摸鱼快捷键 ${hotkeys.stealth}（可能被其他程序占用）`
    }
  } catch (cause) {
    error = error ?? `摸鱼快捷键注册失败：${String(cause)}`
  }

  const status: HotkeyStatus = { boss, stealth, error }
  sendToMain('events:hotkeys', status)
  return status
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
