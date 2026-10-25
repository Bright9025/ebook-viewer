<script setup lang="ts">
import { computed } from 'vue'
import type { AppTheme, ReaderFont, ReaderSettings, ThemeMode } from '@shared/types'
import { readerFontLabels, readerFontStacks } from '../lib/theme'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  open: boolean
  draft: ReaderSettings
  themeMode: ThemeMode
  appTheme: AppTheme
}>()

const emit = defineEmits<{
  close: []
  update: [patch: Partial<ReaderSettings>]
  persist: []
  theme: [mode: ThemeMode]
  reset: []
}>()

const fonts = Object.keys(readerFontLabels) as ReaderFont[]

const fontSizeLabel = computed(() => `${props.draft.fontSize}px`)
const lineHeightLabel = computed(() => props.draft.lineHeight.toFixed(2))
const marginLabel = computed(() => `${props.draft.margin}px`)

function update(patch: Partial<ReaderSettings>): void {
  emit('update', patch)
}

function stepFont(delta: number): void {
  const next = Math.max(13, Math.min(30, props.draft.fontSize + delta))
  update({ fontSize: next })
  emit('persist')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="settings">
      <div v-if="open" class="settings-layer">
        <div class="settings-scrim" @click="emit('close')" />
        <aside class="settings-card" role="dialog" aria-label="排版设置">
          <header class="settings-head">
            <div>
              <h2>排版</h2>
              <p>调整后会保持当前阅读位置</p>
            </div>
            <button class="icon-btn" type="button" title="关闭" @click="emit('close')">
              <AppIcon name="close" :size="16" />
            </button>
          </header>

          <div class="settings-body">
            <section class="setting-block">
              <label class="setting-label">主题</label>
              <div class="segmented">
                <button
                  v-for="item in [
                    { value: 'light', label: '明亮' },
                    { value: 'dark', label: '暗黑' },
                    { value: 'system', label: '跟随系统' }
                  ]"
                  :key="item.value"
                  :class="{ active: themeMode === item.value }"
                  type="button"
                  @click="emit('theme', item.value as ThemeMode)"
                >
                  {{ item.label }}
                </button>
              </div>
            </section>

            <section class="setting-block">
              <label class="setting-label">字体</label>
              <div class="font-grid">
                <button
                  v-for="font in fonts"
                  :key="font"
                  class="font-option"
                  :class="{ active: draft.font === font }"
                  :style="{ fontFamily: readerFontStacks[font] }"
                  type="button"
                  @click="update({ font }); emit('persist')"
                >
                  {{ readerFontLabels[font] }}
                </button>
              </div>
            </section>

            <section class="setting-block">
              <div class="setting-row">
                <label class="setting-label">字号</label>
                <span class="setting-value">{{ fontSizeLabel }}</span>
              </div>
              <div class="slider-row">
                <button class="step-btn" type="button" title="减小字号" @click="stepFont(-1)">
                  <AppIcon name="minus" :size="14" />
                </button>
                <input
                  class="slider"
                  type="range"
                  min="13"
                  max="30"
                  step="1"
                  :value="draft.fontSize"
                  @input="update({ fontSize: Number(($event.target as HTMLInputElement).value) })"
                  @change="emit('persist')"
                />
                <button class="step-btn" type="button" title="增大字号" @click="stepFont(1)">
                  <AppIcon name="plus" :size="14" />
                </button>
              </div>
            </section>

            <section class="setting-block">
              <div class="setting-row">
                <label class="setting-label">行高</label>
                <span class="setting-value">{{ lineHeightLabel }}</span>
              </div>
              <input
                class="slider"
                type="range"
                min="1.4"
                max="2.2"
                step="0.05"
                :value="draft.lineHeight"
                @input="update({ lineHeight: Number(($event.target as HTMLInputElement).value) })"
                @change="emit('persist')"
              />
            </section>

            <section class="setting-block">
              <div class="setting-row">
                <label class="setting-label">页边距</label>
                <span class="setting-value">{{ marginLabel }}</span>
              </div>
              <input
                class="slider"
                type="range"
                min="24"
                max="104"
                step="4"
                :value="draft.margin"
                @input="update({ margin: Number(($event.target as HTMLInputElement).value) })"
                @change="emit('persist')"
              />
            </section>

            <section class="setting-block switch-block">
              <div>
                <label class="setting-label">两端对齐</label>
                <p>中文正文推荐开启，英文长句可关闭。</p>
              </div>
              <button
                class="switch"
                :class="{ active: draft.justify }"
                type="button"
                role="switch"
                :aria-checked="draft.justify"
                @click="update({ justify: !draft.justify }); emit('persist')"
              >
                <span />
              </button>
            </section>
          </div>

          <footer class="settings-foot">
            <button class="reset-button" type="button" @click="emit('reset')">恢复默认</button>
            <span class="preview-note" :style="{ fontFamily: readerFontStacks[draft.font] }">阅读，是安静的出走。</span>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.settings-layer {
  position: fixed;
  inset: 0;
  z-index: 230;
}

.settings-scrim {
  position: absolute;
  inset: 0;
  background: rgba(10, 10, 9, 0.18);
}

.settings-card {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(340px, 90vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
}

.settings-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 18px 16px 24px;
  border-bottom: 1px solid var(--line);
}

.settings-head h2 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
}

.settings-head p {
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 24px 24px;
}

.setting-block {
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}

.setting-block:last-child {
  border-bottom: 0;
}

.setting-label {
  display: block;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  text-transform: uppercase;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.setting-value {
  font-size: 11.5px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.segmented {
  display: flex;
  gap: 3px;
  margin-top: 10px;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg-deep);
}

.segmented button {
  flex: 1;
  height: 31px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--muted);
  transition: background 0.18s var(--ease), color 0.18s var(--ease);
}

.segmented button.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

.font-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}

.font-option {
  height: 46px;
  border-radius: 10px;
  border: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 14px;
  transition: border-color 0.18s var(--ease), color 0.18s var(--ease), background 0.18s var(--ease);
}

.font-option:hover {
  border-color: var(--line-strong);
}

.font-option.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.step-btn {
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--line);
  color: var(--ink-soft);
}

.step-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.slider {
  --track: var(--line);
  width: 100%;
  height: 22px;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.slider::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 3px;
  background: var(--line);
}

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5.5px;
  border-radius: 50%;
  background: var(--surface);
  border: 1.5px solid var(--accent);
  box-shadow: var(--shadow-sm);
}

.switch-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.switch-block p {
  margin-top: 6px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.switch {
  width: 42px;
  height: 24px;
  flex: none;
  border-radius: 999px;
  background: var(--line-strong);
  padding: 2px;
  transition: background 0.2s var(--ease);
}

.switch span {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s var(--ease);
}

.switch.active {
  background: var(--accent);
}

.switch.active span {
  transform: translateX(18px);
}

.settings-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  border-top: 1px solid var(--line);
}

.reset-button {
  font-size: 11.5px;
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.reset-button:hover {
  color: var(--accent);
}

.preview-note {
  font-size: 12px;
  color: var(--muted);
}

.settings-enter-active,
.settings-leave-active {
  transition: opacity 0.2s var(--ease);
}

.settings-enter-active .settings-card,
.settings-leave-active .settings-card {
  transition: transform 0.26s var(--ease);
}

.settings-enter-from,
.settings-leave-to {
  opacity: 0;
}

.settings-enter-from .settings-card,
.settings-leave-to .settings-card {
  transform: translateX(100%);
}
</style>
