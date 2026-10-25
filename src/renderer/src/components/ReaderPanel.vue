<script setup lang="ts">
import type { Bookmark } from '@shared/types'
import type { FlatTocItem } from '../lib/epub'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  open: boolean
  tab: 'toc' | 'bookmarks'
  toc: FlatTocItem[]
  bookmarks: Bookmark[]
  activeHref: string
  percent: number
}>()

const emit = defineEmits<{
  close: []
  'update:tab': [value: 'toc' | 'bookmarks']
  selectHref: [href: string]
  selectCfi: [cfi: string]
  removeBookmark: [id: string]
}>()

function isActive(href: string): boolean {
  const target = href.split('#')[0]
  const current = props.activeHref.split('#')[0]
  return Boolean(target && current && (target === current || current.endsWith(target) || target.endsWith(current)))
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="panel-layer">
        <div class="panel-scrim" @click="emit('close')" />
        <aside class="drawer" role="dialog" aria-label="阅读导航">
          <header class="drawer-head">
            <div class="tabs">
              <button :class="{ active: tab === 'toc' }" type="button" @click="emit('update:tab', 'toc')">目录</button>
              <button :class="{ active: tab === 'bookmarks' }" type="button" @click="emit('update:tab', 'bookmarks')">
                书签
                <span v-if="bookmarks.length" class="count">{{ bookmarks.length }}</span>
              </button>
            </div>
            <button class="icon-btn" type="button" title="关闭" @click="emit('close')">
              <AppIcon name="close" :size="16" />
            </button>
          </header>

          <div class="drawer-body">
            <template v-if="tab === 'toc'">
              <div v-if="!toc.length" class="panel-empty">这本书没有提供目录。</div>
              <button
                v-for="(item, index) in toc"
                :key="`${item.href}-${index}`"
                class="toc-item"
                :class="{ active: isActive(item.href), sub: item.level > 0 }"
                :style="{ paddingLeft: `${18 + Math.min(item.level, 4) * 16}px` }"
                type="button"
                @click="emit('selectHref', item.href)"
              >
                <span class="toc-index">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="toc-label">{{ item.label }}</span>
              </button>
            </template>

            <template v-else>
              <div v-if="!bookmarks.length" class="panel-empty">
                还没有书签。<br />阅读时点击顶部书签按钮即可记录当前页。
              </div>
              <div v-for="bookmark in bookmarks" :key="bookmark.id" class="bookmark-item">
                <button class="bookmark-main" type="button" @click="emit('selectCfi', bookmark.cfi)">
                  <span class="bookmark-title">{{ bookmark.label || '未命名位置' }}</span>
                  <span class="bookmark-meta">
                    {{ bookmark.chapter || '正文' }} · {{ formatPercent(bookmark.percent) }}
                  </span>
                </button>
                <button class="bookmark-remove" type="button" title="删除书签" @click="emit('removeBookmark', bookmark.id)">
                  <AppIcon name="trash" :size="13" />
                </button>
              </div>
            </template>
          </div>

          <footer class="drawer-foot">
            <span>{{ tab === 'toc' ? `${toc.length} 个章节` : `${bookmarks.length} 个书签` }}</span>
            <span>当前 {{ formatPercent(percent) }}</span>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-layer {
  position: fixed;
  inset: 0;
  z-index: 220;
}

.panel-scrim {
  position: absolute;
  inset: 0;
  background: rgba(10, 10, 9, 0.22);
  backdrop-filter: blur(1.5px);
}

.drawer {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: min(360px, 86vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px 20px;
  border-bottom: 1px solid var(--line);
}

.tabs {
  display: flex;
  gap: 18px;
}

.tabs button {
  position: relative;
  height: 32px;
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.04em;
}

.tabs button.active {
  color: var(--ink);
  font-weight: 600;
}

.tabs button.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -11px;
  height: 2px;
  background: var(--accent);
}

.count {
  display: inline-grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  margin-left: 4px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0 18px;
}

.toc-item {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 10px 18px;
  text-align: left;
  color: var(--ink-soft);
  transition: background 0.16s var(--ease), color 0.16s var(--ease);
}

.toc-item:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.toc-item.active {
  color: var(--accent);
}

.toc-index {
  flex: none;
  width: 18px;
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.08em;
}

.toc-item.sub .toc-label {
  font-size: 12.5px;
}

.toc-label {
  font-size: 13px;
  line-height: 1.6;
}

.panel-empty {
  padding: 56px 28px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.9;
  text-align: center;
}

.bookmark-item {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--line);
}

.bookmark-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px 10px 13px 20px;
  text-align: left;
}

.bookmark-main:hover .bookmark-title {
  color: var(--accent);
}

.bookmark-title {
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-meta {
  font-size: 10.5px;
  color: var(--muted);
  letter-spacing: 0.02em;
}

.bookmark-remove {
  width: 44px;
  color: var(--muted);
  display: grid;
  place-items: center;
}

.bookmark-remove:hover {
  color: var(--danger);
}

.drawer-foot {
  display: flex;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s var(--ease);
}

.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.26s var(--ease);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(-100%);
}
</style>
