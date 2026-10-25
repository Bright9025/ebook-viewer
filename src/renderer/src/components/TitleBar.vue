<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ subtitle?: string; back?: boolean }>(), { subtitle: '书库', back: false })
const emit = defineEmits<{ back: [] }>()

const maximized = ref(false)
let offMaximized: (() => void) | null = null

onMounted(async () => {
  maximized.value = await window.api.window.isMaximized()
  offMaximized = window.api.window.onMaximized((value) => {
    maximized.value = value
  })
})

onBeforeUnmount(() => offMaximized?.())

function toggleMaximize(): void {
  window.api.window.toggleMaximize()
}

function minimize(): void {
  window.api.window.minimize()
}

function closeWindow(): void {
  window.api.window.close()
}

function onHeaderDoubleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (target.closest('button, input, .no-drag')) return
  toggleMaximize()
}
</script>

<template>
  <header class="titlebar drag" @dblclick="onHeaderDoubleClick">
    <div class="tb-left">
      <button v-if="back" class="icon-btn no-drag tb-back" type="button" title="返回" @click="emit('back')">
        <AppIcon name="arrow-left" :size="18" />
      </button>
      <div class="brand">
        <span class="brand-mark"><AppIcon name="book-open" :size="15" /></span>
        <span class="brand-name">Ebook Viewer</span>
        <span class="brand-sep">/</span>
        <span class="brand-page">{{ subtitle }}</span>
      </div>
    </div>

    <div class="tb-center no-drag">
      <slot name="center" />
    </div>

    <div class="tb-right no-drag">
      <slot name="actions" />
      <div class="window-controls">
        <button class="win-btn" type="button" title="最小化" @click="minimize">
          <AppIcon name="minus" :size="15" />
        </button>
        <button class="win-btn" type="button" :title="maximized ? '还原' : '最大化'" @click="toggleMaximize">
          <AppIcon :name="maximized ? 'restore' : 'maximize'" :size="13" />
        </button>
        <button class="win-btn win-close" type="button" title="关闭" @click="closeWindow">
          <AppIcon name="close" :size="15" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: 48px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 0 0 18px;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  position: relative;
  z-index: 30;
}

.tb-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tb-back {
  margin-left: -6px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-size: 12.5px;
  letter-spacing: 0.02em;
}

.brand-mark {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--ink);
  color: var(--bg);
}

.brand-name {
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}

.brand-sep {
  color: var(--muted);
  opacity: 0.7;
}

.brand-page {
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.tb-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.window-controls {
  display: flex;
  align-items: center;
  margin-left: 6px;
}

.win-btn {
  width: 44px;
  height: 48px;
  display: grid;
  place-items: center;
  color: var(--ink-soft);
  transition: background 0.15s var(--ease), color 0.15s var(--ease);
}

.win-btn:hover {
  background: var(--accent-soft);
  color: var(--accent);
}

.win-close:hover {
  background: #c7392c;
  color: #fff;
}
</style>
