<script setup lang="ts">
import { computed } from 'vue'
import type { Book } from '@shared/types'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  open: boolean
  book: Book | null
}>()

const emit = defineEmits<{
  close: []
}>()

const added = computed(() => {
  if (!props.book?.addedAt) return '未知'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(props.book.addedAt)
})

function percent(book: Book | null): string {
  return `${Math.round((book?.progress.percent ?? 0) * 1000) / 10}%`
}
</script>

<template>
  <Transition name="fade">
    <div v-if="open && book" class="detail-backdrop" @click.self="emit('close')">
      <section class="book-detail" role="dialog" aria-modal="true" aria-label="书籍详情">
        <button class="detail-close" type="button" title="关闭" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>

        <div class="detail-head">
          <div class="detail-cover">
            <img v-if="book.cover" :src="book.cover" :alt="book.title" draggable="false" />
            <div v-else class="detail-cover-fallback">{{ book.title.slice(0, 2) }}</div>
          </div>
          <div class="detail-title">
            <p class="eyebrow">BOOK DETAILS</p>
            <h2>{{ book.title }}</h2>
            <p class="detail-author">{{ book.author || '未知作者' }}</p>
            <div class="detail-stats">
              <span>阅读进度 {{ percent(book) }}</span>
              <span>加入于 {{ added }}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>简介</h3>
          <p class="detail-desc">{{ book.description || '这本书没有提供简介。' }}</p>
        </div>

        <footer class="detail-actions">
          <button class="ghost-button" type="button" @click="emit('close')">关闭</button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 320;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 18, 14, 0.34);
  backdrop-filter: blur(7px);
}

.book-detail {
  position: relative;
  width: min(620px, 94vw);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 26px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.detail-close {
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

.detail-close:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.detail-head {
  display: flex;
  gap: 22px;
  padding-right: 28px;
}

.detail-cover {
  flex: 0 0 128px;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 4px 10px 10px 4px;
  background: var(--bg-deep);
  box-shadow: 0 12px 26px -18px rgba(0, 0, 0, 0.55);
}

.detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.detail-cover-fallback {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 12px;
  color: var(--ink-soft);
  font-family: var(--font-reading, Georgia, serif);
  font-size: 22px;
  text-align: center;
}

.detail-title {
  min-width: 0;
}

.detail-title .eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 0.18em;
}

.detail-title h2 {
  margin: 0 0 6px;
  color: var(--ink);
  font-family: var(--font-reading, Georgia, serif);
  font-size: 26px;
  line-height: 1.25;
}

.detail-author {
  margin: 0 0 18px;
  color: var(--ink-soft);
  font-size: 13px;
}

.detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-stats span {
  padding: 4px 8px;
  border-radius: 5px;
  background: var(--accent-soft);
  color: var(--muted);
  font-size: 10px;
}

.detail-section {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.detail-section h3 {
  margin: 0 0 10px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.detail-desc {
  margin: 0;
  color: var(--ink-soft);
  font-family: var(--font-reading, Georgia, serif);
  font-size: 13px;
  line-height: 1.85;
  white-space: pre-wrap;
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

@media (max-width: 520px) {
  .detail-head {
    flex-direction: column;
  }

  .detail-cover {
    flex-basis: auto;
    width: 112px;
  }
}
</style>
