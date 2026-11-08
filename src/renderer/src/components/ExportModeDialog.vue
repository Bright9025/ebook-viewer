<script setup lang="ts">
import type { ExportMode } from '@shared/types'
import AppIcon from './AppIcon.vue'

defineProps<{
  open: boolean
  count?: number
}>()

const emit = defineEmits<{
  select: [mode: ExportMode]
  close: []
}>()
</script>

<template>
  <Transition name="fade">
    <div v-if="open" class="export-backdrop" @click.self="emit('close')">
      <section class="export-dialog" role="dialog" aria-modal="true" aria-label="选择导出方式">
        <button class="export-close" type="button" title="关闭" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>
        <p class="export-eyebrow">EXPORT EPUB</p>
        <h2>选择导出方式</h2>
        <p class="export-desc">
          两种方式都只生成一个 EPUB 文件<span v-if="count && count > 1">，本次共导出 {{ count }} 本书</span>。
        </p>

        <div class="export-options">
          <button class="export-option" type="button" @click="emit('select', 'data')">
            <span class="option-icon"><AppIcon name="note" :size="19" /></span>
            <span class="option-copy">
              <strong>数据版</strong>
              <small>附带批注、书签、阅读进度和「阅读笔记」章节</small>
            </span>
            <AppIcon name="chevron-right" :size="15" />
          </button>
          <button class="export-option" type="button" @click="emit('select', 'original')">
            <span class="option-icon"><AppIcon name="book" :size="19" /></span>
            <span class="option-copy">
              <strong>纯净版</strong>
              <small>只复制原始 EPUB，不包含任何标注或阅读数据</small>
            </span>
            <AppIcon name="chevron-right" :size="15" />
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.export-backdrop {
  position: fixed;
  inset: 0;
  z-index: 340;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 18, 14, 0.34);
  backdrop-filter: blur(7px);
}

.export-dialog {
  position: relative;
  width: min(500px, 94vw);
  padding: 26px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.export-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--muted);
}

.export-close:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.export-eyebrow {
  margin: 0 0 7px;
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 0.18em;
}

.export-dialog h2 {
  margin: 0 0 7px;
  color: var(--ink);
  font-family: var(--font-display, Georgia, serif);
  font-size: 25px;
  font-weight: 600;
}

.export-desc {
  margin: 0 0 20px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.7;
}

.export-options {
  display: grid;
  gap: 8px;
}

.export-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--ink-soft);
  text-align: left;
  transition: border-color 0.18s var(--ease), background 0.18s var(--ease);
}

.export-option:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.option-icon {
  flex: 0 0 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}

.option-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.option-copy strong {
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.option-copy small {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}
</style>
