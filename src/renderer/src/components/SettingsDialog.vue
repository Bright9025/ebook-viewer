<script setup lang="ts">
import type { AnnotationColor, AppTheme, ReaderFont, ThemeMode } from '@shared/types'
import { computed } from 'vue'
import { annotationColors } from '../lib/annotations'
import { readerFontLabels, readerFontStacks } from '../lib/theme'
import { useAppStore } from '../stores/app'
import AppIcon from './AppIcon.vue'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useAppStore()
const fonts = Object.keys(readerFontLabels) as ReaderFont[]
const fontSample = computed(() => readerFontStacks[store.settings.reader.font])
const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '明亮' },
  { value: 'dark', label: '暗黑' },
  { value: 'system', label: '跟随系统' },
  { value: 'auto', label: '日出日落' }
]

async function setTheme(mode: ThemeMode): Promise<void> {
  await store.updateSettings({ theme: mode })
}

async function setAccent(theme: AppTheme, value: string): Promise<void> {
  await store.updateSettings({
    themeAccent: {
      ...store.settings.themeAccent,
      [theme]: value
    }
  })
}

async function setFont(font: ReaderFont): Promise<void> {
  await store.updateSettings({ reader: { ...store.settings.reader, font } })
}

async function toggleColor(color: AnnotationColor): Promise<void> {
  const active = store.settings.annotationColors.includes(color)
  if (active && store.settings.annotationColors.length <= 1) return
  const next = active
    ? store.settings.annotationColors.filter((item) => item !== color)
    : [...store.settings.annotationColors, color]
  await store.updateSettings({ annotationColors: next })
}
</script>

<template>
  <Transition name="fade">
    <div v-if="open" class="settings-backdrop" @click.self="emit('close')">
      <section class="app-settings" role="dialog" aria-modal="true" aria-label="设置">
        <header class="settings-head">
          <div>
            <p class="eyebrow">PREFERENCES</p>
            <h2>设置</h2>
          </div>
          <button class="settings-close" type="button" title="关闭" @click="emit('close')">
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <div class="settings-scroll">
          <section class="settings-section">
            <h3>外观</h3>
            <div class="theme-options">
              <button
                v-for="item in themeOptions"
                :key="item.value"
                :class="{ active: store.settings.theme === item.value }"
                type="button"
                @click="setTheme(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
            <p class="settings-note">
              「日出日落」会根据本地定位计算当天的日出和日落时间并自动切换；定位不可用时按本地 06:00 / 18:00 切换。
            </p>

            <div class="accent-row">
              <label>
                <span>明亮模式强调色</span>
                <input
                  type="color"
                  :value="store.settings.themeAccent.light"
                  @input="setAccent('light', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label>
                <span>暗黑模式强调色</span>
                <input
                  type="color"
                  :value="store.settings.themeAccent.dark"
                  @input="setAccent('dark', ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </section>

          <section class="settings-section">
            <h3>阅读字体</h3>
            <div class="font-options">
              <button
                v-for="font in fonts"
                :key="font"
                :class="{ active: store.settings.reader.font === font }"
                type="button"
                @click="setFont(font)"
              >
                {{ readerFontLabels[font] }}
              </button>
            </div>
            <p class="font-sample" :style="{ fontFamily: fontSample }">山窗读书，风过竹林。</p>
          </section>

          <section class="settings-section">
            <h3>标注颜色</h3>
            <p class="settings-note">取消勾选后，右键菜单和笔记弹窗中不再显示该颜色；至少保留一种。</p>
            <div class="color-options">
              <button
                v-for="item in annotationColors"
                :key="item.color"
                class="color-option"
                :class="{ active: store.settings.annotationColors.includes(item.color) }"
                type="button"
                @click="toggleColor(item.color)"
              >
                <span class="color-dot" :style="{ background: item.swatch }" />
                {{ item.label }}
                <AppIcon v-if="store.settings.annotationColors.includes(item.color)" name="check" :size="12" />
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 350;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 18, 14, 0.34);
  backdrop-filter: blur(7px);
}

.app-settings {
  width: min(620px, 94vw);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.settings-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 26px 14px;
}

.settings-head .eyebrow {
  margin: 0 0 6px;
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 0.18em;
}

.settings-head h2 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-display, Georgia, serif);
  font-size: 26px;
}

.settings-close {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--muted);
}

.settings-close:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.settings-scroll {
  overflow-y: auto;
  padding: 0 26px 26px;
}

.settings-section {
  padding: 18px 0;
  border-top: 1px solid var(--line);
}

.settings-section:first-child {
  border-top: 0;
  padding-top: 6px;
}

.settings-section h3 {
  margin: 0 0 11px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.theme-options,
.font-options,
.color-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.theme-options button,
.font-options button,
.color-option {
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--muted);
  font-size: 11px;
}

.theme-options button:hover,
.font-options button:hover,
.color-option:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.theme-options button.active,
.font-options button.active,
.color-option.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.settings-note {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.65;
}

.accent-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 16px;
}

.accent-row label {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--ink-soft);
  font-size: 11px;
}

.accent-row input[type='color'] {
  width: 32px;
  height: 24px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.font-sample {
  margin: 14px 0 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--ink);
  font-size: 18px;
}

.color-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.color-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
</style>
