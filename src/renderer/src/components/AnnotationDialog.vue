<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { AnnotationColor } from '@shared/types'
import { annotationColors } from '../lib/annotations'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  open: boolean
  quote: string
  note: string
  color: AnnotationColor
  editing: boolean
}>()

const emit = defineEmits<{
  save: [payload: { note: string; color: AnnotationColor }]
  remove: []
  close: []
}>()

const draftNote = ref('')
const draftColor = ref<AnnotationColor>('yellow')
const textarea = ref<HTMLTextAreaElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    draftNote.value = props.note
    draftColor.value = props.color
    await nextTick()
    textarea.value?.focus()
  },
  { immediate: true }
)

function save(): void {
  emit('save', { note: draftNote.value.trim(), color: draftColor.value })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    save()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="annotation-dialog">
      <div v-if="open" class="annotation-backdrop" @mousedown.self="emit('close')" @keydown="onKeydown">
        <section class="annotation-dialog" role="dialog" aria-modal="true" aria-label="标注">
          <header class="dialog-head">
            <div>
              <span class="dialog-kicker">{{ editing ? '编辑标注' : '添加标注' }}</span>
              <h2>{{ editing ? '修改这条标注' : '标注选中的文字' }}</h2>
            </div>
            <button class="icon-btn" type="button" title="关闭" @click="emit('close')">
              <AppIcon name="close" :size="16" />
            </button>
          </header>

          <blockquote class="quote-preview">{{ quote }}</blockquote>

          <label class="field-label" for="annotation-note">笔记 <span>可选</span></label>
          <textarea
            id="annotation-note"
            ref="textarea"
            v-model="draftNote"
            class="note-input"
            rows="5"
            placeholder="写下你的想法，或留空只做高亮…"
          />

          <div class="color-picker">
            <span class="field-label">高亮颜色</span>
            <div class="color-options">
              <button
                v-for="item in annotationColors"
                :key="item.color"
                class="color-option"
                :class="{ active: draftColor === item.color }"
                type="button"
                :title="item.label"
                :aria-label="item.label"
                @click="draftColor = item.color"
              >
                <span :style="{ background: item.swatch }" />
                <span class="color-name">{{ item.label }}</span>
              </button>
            </div>
          </div>

          <footer class="dialog-actions">
            <button v-if="editing" class="danger-link" type="button" @click="emit('remove')">
              <AppIcon name="trash" :size="14" />
              删除标注
            </button>
            <span v-else class="dialog-hint">Ctrl + Enter 保存</span>
            <div class="dialog-buttons">
              <button class="ghost-button" type="button" @click="emit('close')">取消</button>
              <button class="primary-button" type="button" @click="save">
                {{ editing ? '保存修改' : '保存标注' }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.annotation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 330;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(10, 10, 9, 0.32);
  backdrop-filter: blur(2px);
}

.annotation-dialog {
  width: min(520px, 94vw);
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.dialog-kicker {
  display: block;
  margin-bottom: 5px;
  color: var(--accent);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.dialog-head h2 {
  margin: 0;
  color: var(--ink);
  font-size: 18px;
  font-weight: 600;
}

.quote-preview {
  max-height: 96px;
  overflow: auto;
  margin: 18px 0;
  padding: 11px 13px;
  border-left: 3px solid var(--accent);
  border-radius: 0 7px 7px 0;
  background: var(--accent-soft);
  color: var(--ink-soft);
  font-family: var(--font-reading, Georgia, serif);
  font-size: 13px;
  line-height: 1.7;
}

.field-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 7px;
  color: var(--ink-soft);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.field-label span {
  color: var(--muted);
  font-size: 10px;
}

.note-input {
  width: 100%;
  resize: vertical;
  min-height: 96px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-raised, var(--surface));
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.65;
  outline: none;
}

.note-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.color-picker {
  margin-top: 16px;
}

.color-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 9px 0 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 10.5px;
}

.color-option > span:first-child {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

.color-option.active {
  border-color: var(--accent);
  color: var(--ink);
  background: var(--accent-soft);
}

.color-name {
  letter-spacing: 0.04em;
}

.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 22px;
}

.danger-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--danger);
  font-size: 11px;
}

.dialog-hint {
  color: var(--muted);
  font-size: 10px;
}

.dialog-buttons {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.annotation-dialog-enter-active,
.annotation-dialog-leave-active {
  transition: opacity 0.18s var(--ease);
}

.annotation-dialog-enter-active .annotation-dialog,
.annotation-dialog-leave-active .annotation-dialog {
  transition: transform 0.2s var(--ease), opacity 0.18s var(--ease);
}

.annotation-dialog-enter-from,
.annotation-dialog-leave-to {
  opacity: 0;
}

.annotation-dialog-enter-from .annotation-dialog,
.annotation-dialog-leave-to .annotation-dialog {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
