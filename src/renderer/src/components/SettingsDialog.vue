<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AnnotationColorSetting, CustomFont, ReaderFont, ThemeMode, UpdateStatus } from '@shared/types'
import { defaultSettings } from '@shared/defaults'
import { fontLabel, fontStack, readerFontLabels } from '../lib/theme'
import { useAppStore } from '../stores/app'
import { toast } from '../lib/toast'
import AppIcon from './AppIcon.vue'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useAppStore()
const fonts = computed<ReaderFont[]>(() => [
  ...Object.keys(readerFontLabels),
  ...store.settings.customFonts.map((font) => font.id)
])
const fontSample = computed(() => fontStack(store.settings.reader.font, store.settings.customFonts))
const customFonts = computed(() => store.settings.customFonts)
const updateStatus = ref<UpdateStatus>({ state: 'idle' })
const updateText = computed(() => {
  const status = updateStatus.value
  if (status.state === 'checking') return '正在检查更新…'
  if (status.state === 'available') return `发现新版本 ${status.version ?? ''}，正在下载…`
  if (status.state === 'downloading') return `正在下载更新 ${status.percent ?? 0}%`
  if (status.state === 'downloaded') return `新版本 ${status.version ?? ''} 已下载，退出应用后自动安装`
  if (status.state === 'not-available') return '已经是最新版本'
  if (status.state === 'unsupported') return '开发模式不检查更新'
  if (status.state === 'error') return `检查更新失败：${status.message ?? '未知错误'}`
  return '启动时会自动检查更新'
})
let offUpdateStatus: (() => void) | null = null

onMounted(() => {
  offUpdateStatus = window.api.events.onUpdateStatus((status) => {
    updateStatus.value = status
  })
})

onBeforeUnmount(() => {
  offUpdateStatus?.()
})
const confirmReset = ref(false)
const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '明亮' },
  { value: 'dark', label: '暗黑' },
  { value: 'system', label: '跟随系统' },
  { value: 'auto', label: '日出日落' }
]

async function setTheme(mode: ThemeMode): Promise<void> {
  await store.updateSettings({ theme: mode })
}

async function setFont(font: ReaderFont): Promise<void> {
  await store.updateSettings({ reader: { ...store.settings.reader, font } })
}

async function importFont(): Promise<void> {
  try {
    const font = await window.api.fonts.import()
    if (!font) return
    const customFonts = [...store.settings.customFonts.map((item) => ({ ...item })), font]
    await store.updateSettings({
      customFonts,
      reader: { ...store.settings.reader, font: font.id }
    })
    toast(`已导入字体：${font.label}`, 'success')
  } catch (error) {
    toast(`字体导入失败：${String(error)}`, 'error')
  }
}

async function removeFont(font: CustomFont): Promise<void> {
  try {
    await window.api.fonts.remove(font.fileName)
    const customFonts = store.settings.customFonts
      .filter((item) => item.id !== font.id)
      .map((item) => ({ ...item }))
    const nextFont = store.settings.reader.font === font.id ? 'serif' : store.settings.reader.font
    await store.updateSettings({ customFonts, reader: { ...store.settings.reader, font: nextFont } })
    toast(`已删除字体：${font.label}`, 'success')
  } catch (error) {
    toast(`删除字体失败：${String(error)}`, 'error')
  }
}

async function setPalette(next: AnnotationColorSetting[]): Promise<void> {
  await store.updateSettings({
    annotationColors: next.map(({ id, label, value }) => ({ id, label, value }))
  })
}

function updateColor(id: string, value: string): void {
  void setPalette(store.settings.annotationColors.map((item) => (item.id === id ? { ...item, value } : item)))
}

function updateLabel(id: string, event: Event): void {
  const label = (event.target as HTMLInputElement).value.trim()
  void setPalette(
    store.settings.annotationColors.map((item) => (item.id === id ? { ...item, label: label || '自定义颜色' } : item))
  )
}

function addColor(): void {
  const id = `custom-${Date.now().toString(36)}`
  void setPalette([
    ...store.settings.annotationColors,
    { id, label: '新颜色', value: '#c88a4a' }
  ])
}

function removeColor(id: string): void {
  if (store.settings.annotationColors.length <= 1) return
  void setPalette(store.settings.annotationColors.filter((item) => item.id !== id))
}

async function resetDefaults(): Promise<void> {
  confirmReset.value = false
  for (const font of store.settings.customFonts) {
    try {
      await window.api.fonts.remove(font.fileName)
    } catch {
      /* a missing imported font file should not block resetting */
    }
  }
  await store.updateSettings(JSON.parse(JSON.stringify(defaultSettings)))
}

async function checkUpdates(): Promise<void> {
  updateStatus.value = { state: 'checking' }
  try {
    updateStatus.value = await window.api.updates.check()
  } catch (error) {
    updateStatus.value = { state: 'error', message: String(error) }
  }
}

function installUpdate(): void {
  window.api.updates.install()
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
                {{ fontLabel(font, store.settings.customFonts) }}
              </button>
            </div>
            <div class="custom-font-actions">
              <button class="ghost-button" type="button" @click="importFont">
                <AppIcon name="plus" :size="13" />
                导入字体
              </button>
              <span v-if="!customFonts.length" class="settings-note inline-note">支持 .ttf / .otf / .woff / .woff2</span>
            </div>
            <div v-if="customFonts.length" class="custom-font-list">
              <div v-for="font in customFonts" :key="font.id" class="custom-font-row">
                <span>{{ font.label }}</span>
                <button type="button" title="删除字体" @click="removeFont(font)">
                  <AppIcon name="trash" :size="13" />
                </button>
              </div>
            </div>
            <p class="font-sample" :style="{ fontFamily: fontSample }">山窗读书，风过竹林。</p>
          </section>

          <section class="settings-section">
            <h3>标注颜色</h3>
            <p class="settings-note">可以修改颜色、改名、增加或删除。右键菜单和笔记弹窗只显示这里的颜色，至少保留一种。</p>
            <div class="palette-list">
              <div v-for="item in store.settings.annotationColors" :key="item.id" class="palette-row">
                <input
                  class="palette-color"
                  type="color"
                  :value="item.value"
                  :aria-label="`${item.label}颜色`"
                  @input="updateColor(item.id, ($event.target as HTMLInputElement).value)"
                />
                <input
                  class="palette-name"
                  type="text"
                  :value="item.label"
                  maxlength="12"
                  @change="updateLabel(item.id, $event)"
                />
                <button
                  class="palette-remove"
                  type="button"
                  :disabled="store.settings.annotationColors.length <= 1"
                  title="删除这个颜色"
                  @click="removeColor(item.id)"
                >
                  <AppIcon name="trash" :size="13" />
                </button>
              </div>
              <button class="palette-add" type="button" @click="addColor">
                <AppIcon name="plus" :size="13" />
                增加颜色
              </button>
            </div>
          </section>

          <section class="settings-section update-section">
            <h3>应用更新</h3>
            <p class="settings-note">{{ updateText }}</p>
            <div class="update-actions">
              <button class="ghost-button" type="button" :disabled="updateStatus.state === 'checking'" @click="checkUpdates">
                检查更新
              </button>
              <button v-if="updateStatus.state === 'downloaded'" class="primary-button" type="button" @click="installUpdate">
                重启并安装
              </button>
            </div>
          </section>

          <section class="settings-section reset-section">
            <h3>恢复默认设置</h3>
            <p class="settings-note">恢复主题、字体、标注颜色等偏好设置；书籍、批注和书签不会被删除。</p>
            <div v-if="!confirmReset">
              <button class="ghost-button" type="button" @click="confirmReset = true">恢复默认设置</button>
            </div>
            <div v-else class="reset-confirm">
              <span>确认恢复默认？</span>
              <button class="ghost-button" type="button" @click="confirmReset = false">取消</button>
              <button class="danger-button" type="button" @click="resetDefaults">确认恢复</button>
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
.font-options button {
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--muted);
  font-size: 11px;
}

.theme-options button:hover,
.font-options button:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.theme-options button.active,
.font-options button.active {
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

.font-sample {
  margin: 14px 0 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--ink);
  font-size: 18px;
}

.custom-font-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.custom-font-actions .ghost-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 29px;
  font-size: 10px;
}

.inline-note {
  margin: 0;
}

.custom-font-list {
  display: grid;
  gap: 5px;
  margin-top: 8px;
}

.custom-font-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 29px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink-soft);
  font-size: 10px;
}

.custom-font-row button {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  color: var(--muted);
}

.custom-font-row button:hover {
  background: rgba(180, 70, 60, 0.1);
  color: var(--danger);
}

.palette-list {
  display: grid;
  gap: 7px;
  margin-top: 12px;
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.palette-color {
  width: 34px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.palette-name {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--ink-soft);
  font-size: 11px;
}

.palette-name:focus {
  border-color: var(--accent);
  outline: none;
}

.palette-remove {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--muted);
}

.palette-remove:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}

.palette-remove:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.palette-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  border: 1px dashed var(--line-strong);
  border-radius: 7px;
  color: var(--accent);
  font-size: 11px;
}

.palette-add:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.reset-section .ghost-button,
.reset-section .danger-button {
  height: 30px;
  margin-top: 12px;
  padding: 0 12px;
  font-size: 11px;
}

.update-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.update-actions .ghost-button,
.update-actions .primary-button {
  height: 30px;
  padding: 0 12px;
  font-size: 11px;
}

.reset-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  color: var(--ink-soft);
  font-size: 11px;
}

.reset-confirm button {
  margin-top: 0;
}
</style>
