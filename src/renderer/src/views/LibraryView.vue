<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Book } from '@shared/types'
import TitleBar from '../components/TitleBar.vue'
import AppIcon from '../components/AppIcon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { inspectEpub, toArrayBuffer } from '../lib/epub'
import { errorMessage, toast } from '../lib/toast'
import { useAppStore } from '../stores/app'

const router = useRouter()
const store = useAppStore()

const query = ref('')
const sort = ref<'recent' | 'added' | 'title'>('recent')
const importing = ref(false)
const dragDepth = ref(0)
const dragging = computed(() => dragDepth.value > 0)
const pendingDelete = ref<Book | null>(null)

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const list = keyword
    ? store.books.filter(
        (book) => book.title.toLowerCase().includes(keyword) || book.author.toLowerCase().includes(keyword)
      )
    : [...store.books]
  return list.sort((a, b) => {
    if (sort.value === 'title') return a.title.localeCompare(b.title, 'zh-Hans-CN')
    if (sort.value === 'added') return b.addedAt - a.addedAt
    return (b.lastOpenedAt || b.addedAt) - (a.lastOpenedAt || a.addedAt)
  })
})

const readingCount = computed(() => store.books.filter((book) => book.progress.percent > 0).length)

onMounted(() => {
  window.__ebookTest = {
    importBook: (path: string) => importFiles([path]),
    listBooks: () => store.books.map((book) => ({ id: book.id, title: book.title })),
    openBook: (id: string) => router.push(`/reader/${id}`)
  }
})

onBeforeUnmount(() => {
  delete window.__ebookTest
})

async function pickAndImport(): Promise<void> {
  if (importing.value) return
  try {
    const paths = await window.api.library.pick()
    if (paths.length) await importFiles(paths)
  } catch (error) {
    toast(`无法打开文件选择器：${errorMessage(error)}`, 'error')
  }
}

async function importFiles(paths: string[]): Promise<Book[]> {
  const list = paths.filter((path) => path.toLowerCase().endsWith('.epub'))
  if (!list.length) {
    toast('只支持 .epub 格式的电子书', 'error')
    return []
  }
  if (importing.value) return []
  importing.value = true
  const added: Book[] = []
  for (const path of list) {
    const name = path.split(/[\\/]/).pop() ?? '电子书'
    try {
      const bytes = await window.api.library.readPath(path)
      const meta = await inspectEpub(toArrayBuffer(bytes))
      const book = await window.api.library.add({
        sourcePath: path,
        title: meta.title || name.replace(/\.epub$/i, ''),
        author: meta.author,
        cover: meta.cover
      })
      store.addBookLocal(book)
      added.push(book)
    } catch (error) {
      console.error('[library] import failed', path, error)
      toast(`《${name}》导入失败：${errorMessage(error)}`, 'error', 5000)
    }
  }
  importing.value = false
  if (added.length) {
    toast(added.length === 1 ? `已导入《${added[0].title}》` : `已导入 ${added.length} 本书`, 'success')
  }
  return added
}

async function openBook(book: Book): Promise<void> {
  try {
    await window.api.library.touch(book.id)
    store.touchLocal(book.id)
    await router.push(`/reader/${book.id}`)
  } catch (error) {
    toast(`无法打开这本书：${errorMessage(error)}`, 'error')
  }
}

function confirmDelete(book: Book): void {
  pendingDelete.value = book
}

async function doDelete(): Promise<void> {
  const book = pendingDelete.value
  pendingDelete.value = null
  if (!book) return
  try {
    await window.api.library.remove(book.id)
    store.removeBookLocal(book.id)
    toast(`已移除《${book.title}》`)
  } catch (error) {
    toast(`删除失败：${errorMessage(error)}`, 'error')
  }
}

async function toggleTheme(): Promise<void> {
  await store.updateSettings({ theme: store.theme === 'dark' ? 'light' : 'dark' })
}

function onDragEnter(event: DragEvent): void {
  event.preventDefault()
  if (!event.dataTransfer?.types.includes('Files')) return
  dragDepth.value++
}

function onDragLeave(event: DragEvent): void {
  event.preventDefault()
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  dragDepth.value = 0
  const files = Array.from(event.dataTransfer?.files ?? [])
  const paths = files.map((file) => window.api.pathForFile(file)).filter(Boolean)
  if (paths.length) await importFiles(paths)
}

function progressPercent(book: Book): number {
  return Math.max(0, Math.min(100, Math.round((book.progress.percent ?? 0) * 100)))
}

function initial(book: Book): string {
  return (book.title || '书').trim().slice(0, 1)
}

function relativeTime(book: Book): string {
  const stamp = book.lastOpenedAt || book.addedAt
  if (!stamp) return '刚刚加入'
  const diff = Date.now() - stamp
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(stamp)
}
</script>

<template>
  <div
    class="window-shell library-shell"
    @dragenter="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <TitleBar subtitle="书库">
      <template #center>
        <label class="search-box no-drag">
          <AppIcon name="search" :size="15" />
          <input v-model="query" type="text" placeholder="搜索书名或作者" spellcheck="false" />
          <button v-if="query" class="search-clear" type="button" title="清空" @click="query = ''">
            <AppIcon name="close" :size="13" />
          </button>
        </label>
      </template>
      <template #actions>
        <button class="icon-btn" type="button" :title="store.theme === 'dark' ? '切换明亮模式' : '切换暗黑模式'" @click="toggleTheme">
          <AppIcon :name="store.theme === 'dark' ? 'sun' : 'moon'" :size="17" />
        </button>
        <button class="pill-button import-button" type="button" :disabled="importing" @click="pickAndImport">
          <AppIcon name="plus" :size="16" />
          {{ importing ? '导入中…' : '导入' }}
        </button>
      </template>
    </TitleBar>

    <main class="library-main">
      <div class="library-glow" aria-hidden="true" />

      <header class="library-hero">
        <div class="hero-copy">
          <p class="eyebrow">YOUR PRIVATE LIBRARY</p>
          <h1>我的书架</h1>
          <p class="hero-sub">把想读的书放在这里，安静地读。</p>
        </div>
        <div class="hero-side">
          <div class="stats">
            <div class="stat">
              <strong>{{ store.books.length }}</strong>
              <span>本藏书</span>
            </div>
            <div class="stat">
              <strong>{{ readingCount }}</strong>
              <span>本在读</span>
            </div>
          </div>
          <div class="sort-group" role="group" aria-label="排序">
            <button :class="{ active: sort === 'recent' }" type="button" @click="sort = 'recent'">最近阅读</button>
            <button :class="{ active: sort === 'added' }" type="button" @click="sort = 'added'">最近加入</button>
            <button :class="{ active: sort === 'title' }" type="button" @click="sort = 'title'">书名</button>
          </div>
        </div>
      </header>

      <section v-if="!store.books.length" class="empty-state">
        <div class="empty-art">
          <AppIcon name="book-open" :size="44" :stroke="1.2" />
        </div>
        <h2>书架还是空的</h2>
        <p>导入一本 EPUB，开始你的第一段阅读。<br />也可以直接把文件拖进这个窗口。</p>
        <button class="pill-button" type="button" @click="pickAndImport">
          <AppIcon name="plus" :size="16" />
          选择 EPUB 文件
        </button>
        <span class="empty-hint">支持 .epub · 本地保存 · 不上传</span>
      </section>

      <template v-else>
        <div class="shelf-head">
          <span>{{ filtered.length }} 本{{ query ? ` · 筛选 “${query}”` : '' }}</span>
          <span class="shelf-tip">拖动窗口边缘可自由调整阅读界面大小</span>
        </div>

        <div class="book-grid">
          <article
            v-for="(book, index) in filtered"
            :key="book.id"
            class="book-card"
            :style="{ animationDelay: `${Math.min(index, 12) * 35}ms` }"
            @click="openBook(book)"
          >
            <div class="cover">
              <img v-if="book.cover" :src="book.cover" :alt="book.title" loading="lazy" draggable="false" />
              <div v-else class="cover-fallback">
                <span class="fallback-mark">{{ initial(book) }}</span>
                <em>{{ book.title }}</em>
              </div>
              <div class="cover-stroke" />
              <button class="delete-button" type="button" title="从书架移除" @click.stop="confirmDelete(book)">
                <AppIcon name="trash" :size="14" />
              </button>
              <div class="cover-action">
                <span>{{ progressPercent(book) > 0 ? '继续阅读' : '开始阅读' }}</span>
                <AppIcon name="arrow-right" :size="13" />
              </div>
            </div>

            <div class="book-meta">
              <h3 :title="book.title">{{ book.title }}</h3>
              <p>{{ book.author || '未知作者' }}</p>
              <div class="progress-track"><span :style="{ width: `${progressPercent(book)}%` }" /></div>
              <div class="book-foot">
                <span>{{ progressPercent(book) ? `${progressPercent(book)}%` : '未开始' }}</span>
                <span>{{ relativeTime(book) }}</span>
              </div>
            </div>
          </article>

          <button class="add-card" type="button" @click="pickAndImport">
            <span class="add-circle"><AppIcon name="plus" :size="20" /></span>
            <span>导入 EPUB</span>
            <small>或拖入窗口</small>
          </button>
        </div>
      </template>
    </main>

    <Transition name="fade">
      <div v-if="dragging" class="drop-overlay">
        <div class="drop-inner">
          <AppIcon name="book-open" :size="38" :stroke="1.3" />
          <strong>松手导入 EPUB</strong>
          <span>文件会复制到本地书架，不会改动原文件</span>
        </div>
      </div>
    </Transition>

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      title="从书架移除？"
      :message="pendingDelete ? `《${pendingDelete.title}》会从书架和本地存储中移除，原始文件不受影响。` : ''"
      confirm-text="移除"
      @confirm="doDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>
.library-shell {
  position: relative;
}

.library-main {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 38px clamp(28px, 5vw, 72px) 64px;
}

.library-glow {
  position: fixed;
  top: -160px;
  right: -80px;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-soft), transparent 68%);
  pointer-events: none;
  filter: blur(10px);
}

.library-hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  padding-bottom: 30px;
  border-bottom: 1px solid var(--line);
}

.eyebrow {
  font-size: 10px;
  letter-spacing: 0.24em;
  color: var(--muted);
  margin-bottom: 12px;
}

.hero-copy h1 {
  font-family: var(--font-display);
  font-size: clamp(38px, 4.2vw, 54px);
  line-height: 1.05;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.hero-sub {
  margin-top: 12px;
  color: var(--ink-soft);
  font-size: 13.5px;
  letter-spacing: 0.03em;
}

.hero-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 18px;
}

.stats {
  display: flex;
  gap: 30px;
}

.stat {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.stat strong {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
}

.stat span {
  color: var(--muted);
  font-size: 12px;
}

.sort-group {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--bg-deep);
  border: 1px solid var(--line);
}

.sort-group button {
  height: 27px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--muted);
  transition: background 0.18s var(--ease), color 0.18s var(--ease);
}

.sort-group button:hover {
  color: var(--ink);
}

.sort-group button.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

.shelf-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 2px 18px;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.shelf-tip {
  opacity: 0.7;
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: 30px 24px;
}

.book-card {
  min-width: 0;
  cursor: pointer;
  animation: card-in 0.5s var(--ease) both;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.cover {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 4px 10px 10px 4px;
  overflow: hidden;
  background: var(--bg-deep);
  box-shadow: 0 10px 30px -18px rgba(0, 0, 0, 0.55), 0 2px 6px -3px rgba(0, 0, 0, 0.25);
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease);
}

.book-card:hover .cover {
  transform: translateY(-5px);
  box-shadow: 0 22px 44px -24px rgba(0, 0, 0, 0.6), 0 4px 10px -4px rgba(0, 0, 0, 0.3);
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-fallback {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px 16px;
  background:
    linear-gradient(150deg, rgba(255, 255, 255, 0.2), transparent 42%),
    linear-gradient(160deg, var(--accent), var(--accent-soft) 72%, var(--bg-deep));
  color: var(--accent-ink);
}

.fallback-mark {
  font-family: var(--font-display);
  font-size: 44px;
  line-height: 1;
  opacity: 0.9;
}

.cover-fallback em {
  font-family: var(--font-display);
  font-style: normal;
  font-size: 13px;
  line-height: 1.5;
  max-height: 4.5em;
  overflow: hidden;
  opacity: 0.92;
}

.cover-stroke {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 4px 0 10px -6px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.delete-button {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: #fff;
  background: rgba(12, 12, 10, 0.45);
  backdrop-filter: blur(6px);
  opacity: 0;
  transform: translateY(-3px);
  transition: opacity 0.2s var(--ease), transform 0.2s var(--ease), background 0.2s var(--ease);
}

.book-card:hover .delete-button {
  opacity: 1;
  transform: none;
}

.delete-button:hover {
  background: var(--danger);
}

.cover-action {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-radius: 8px;
  background: rgba(12, 12, 10, 0.55);
  color: #fff;
  font-size: 12px;
  letter-spacing: 0.04em;
  backdrop-filter: blur(8px);
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.22s var(--ease), transform 0.22s var(--ease);
}

.book-card:hover .cover-action {
  opacity: 1;
  transform: none;
}

.book-meta {
  padding: 12px 2px 0;
}

.book-meta h3 {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.9em;
}

.book-meta p {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-track {
  margin-top: 10px;
  height: 2px;
  border-radius: 2px;
  background: var(--line);
  overflow: hidden;
}

.progress-track span {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.3s var(--ease);
}

.book-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 7px;
  color: var(--muted);
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.add-card {
  aspect-ratio: 2 / 3;
  align-self: start;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 4px 10px 10px 4px;
  border: 1px dashed var(--line-strong);
  color: var(--muted);
  transition: border-color 0.2s var(--ease), color 0.2s var(--ease), background 0.2s var(--ease);
}

.add-card:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.add-card span:not(.add-circle) {
  font-size: 12.5px;
}

.add-card small {
  font-size: 10.5px;
  opacity: 0.7;
}

.add-circle {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--line);
  margin-bottom: 2px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 80px 20px 40px;
}

.empty-art {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--accent);
  background: var(--accent-soft);
  margin-bottom: 24px;
}

.empty-state h2 {
  font-family: var(--font-display);
  font-size: 27px;
  font-weight: 600;
}

.empty-state p {
  margin: 12px 0 24px;
  color: var(--ink-soft);
  line-height: 1.8;
  font-size: 13px;
}

.empty-hint {
  margin-top: 16px;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.06em;
}

.search-box {
  width: min(360px, 42vw);
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--bg-deep);
  color: var(--muted);
  border: 1px solid transparent;
  transition: border-color 0.18s var(--ease), background 0.18s var(--ease);
}

.search-box:focus-within {
  border-color: var(--line-strong);
  background: var(--surface);
}

.search-box input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 12.5px;
}

.search-box input::placeholder {
  color: var(--muted);
}

.search-clear {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--muted);
}

.search-clear:hover {
  background: var(--line);
  color: var(--ink);
}

.import-button {
  height: 32px;
  padding: 0 14px;
  font-size: 12.5px;
  margin-left: 6px;
}

.import-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  padding: 18px;
  background: rgba(10, 10, 9, 0.28);
  backdrop-filter: blur(2px);
}

.drop-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1.5px dashed var(--accent);
  border-radius: 18px;
  color: var(--ink);
  background: var(--surface-glass);
}

.drop-inner strong {
  font-family: var(--font-display);
  font-size: 22px;
}

.drop-inner span {
  color: var(--muted);
  font-size: 12px;
}
</style>
