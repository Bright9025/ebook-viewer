<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AnnotationColor, AnnotationStyle } from '@shared/types'
import { annotationColors, annotationStyles } from '../lib/annotations'
import { useAppStore } from '../stores/app'
import AppIcon from './AppIcon.vue'

const store = useAppStore()
const visibleColors = computed(() =>
  annotationColors.filter((item) => store.settings.annotationColors.includes(item.color))
)

const props = defineProps<{
  open: boolean
  x: number
  y: number
}>()

const emit = defineEmits<{
  copy: []
  annotate: [color: AnnotationColor, style: AnnotationStyle]
  note: []
  close: []
}>()

const selectedStyle = ref<AnnotationStyle>('highlight')

watch(
  () => props.open,
  (open) => {
    if (open) selectedStyle.value = 'highlight'
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="selection-menu">
      <div
        v-if="open"
        class="selection-menu"
        :style="{ left: `${x}px`, top: `${y}px` }"
        role="menu"
        aria-label="选中文字操作"
        @mousedown.stop
        @contextmenu.prevent
      >
        <button class="menu-item" type="button" role="menuitem" @click="emit('copy')">
          <AppIcon name="copy" :size="15" />
          <span>复制</span>
          <kbd>Ctrl C</kbd>
        </button>

        <div class="menu-separator" />
        <div class="style-row" role="group" aria-label="标注样式">
          <button
            v-for="item in annotationStyles.filter((option) => option.style !== 'none')"
            :key="item.style"
            class="style-option"
            :class="{ active: selectedStyle === item.style }"
            type="button"
            @click="selectedStyle = item.style"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="color-row" role="group" aria-label="标注颜色">
          <span class="color-label">颜色</span>
          <button
            v-for="item in visibleColors"
            :key="item.color"
            class="color-swatch"
            :style="{ '--swatch': item.swatch }"
            type="button"
            :title="`${item.label}${annotationStyles.find((option) => option.style === selectedStyle)?.label}`"
            :aria-label="`${item.label}${annotationStyles.find((option) => option.style === selectedStyle)?.label}`"
            @click="emit('annotate', item.color, selectedStyle)"
          />
        </div>

        <button class="menu-item" type="button" role="menuitem" @click="emit('note')">
          <AppIcon name="note" :size="15" />
          <span>添加笔记…</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.selection-menu {
  position: fixed;
  z-index: 310;
  width: 224px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  color: var(--ink-soft);
  backdrop-filter: blur(12px);
}
.menu-item {
  width: 100%;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12.5px;
  text-align: left;
}

.menu-item:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.menu-item kbd {
  margin-left: auto;
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.menu-separator {
  height: 1px;
  margin: 4px 8px;
  background: var(--line);
}

.color-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 8px;
}

.style-row {
  display: flex;
  gap: 2px;
  padding: 3px 5px;
}

.style-option {
  flex: 1;
  height: 27px;
  border-radius: 5px;
  color: var(--muted);
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.style-option:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.style-option.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.color-label {
  margin-right: 2px;
  font-size: 12.5px;
  color: var(--muted);
}

.color-swatch {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--swatch);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  transition: transform 0.14s var(--ease), border-color 0.14s var(--ease);
}

.color-swatch:hover {
  transform: scale(1.12);
  border-color: var(--surface);
  outline: 1px solid var(--swatch);
}

.selection-menu-enter-active,
.selection-menu-leave-active {
  transition: opacity 0.12s var(--ease), transform 0.12s var(--ease);
  transform-origin: top left;
}

.selection-menu-enter-from,
.selection-menu-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
