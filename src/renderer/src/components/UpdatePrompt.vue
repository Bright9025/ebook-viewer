<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { UpdatePrompt } from '@shared/types'
import AppIcon from './AppIcon.vue'

const open = ref(false)
const version = ref('')
const downloaded = ref(false)
const busy = ref(false)
const percent = ref(0)
const error = ref('')
let offPrompt: (() => void) | null = null
let offStatus: (() => void) | null = null

onMounted(() => {
  offPrompt = window.api.events.onUpdatePrompt((prompt: UpdatePrompt) => {
    version.value = prompt.version
    downloaded.value = prompt.downloaded
    percent.value = 0
    error.value = ''
    busy.value = false
    open.value = true
  })
  offStatus = window.api.events.onUpdateStatus((status) => {
    if (status.state === 'downloading') {
      busy.value = true
      percent.value = status.percent ?? 0
    } else if (status.state === 'downloaded') {
      busy.value = false
      downloaded.value = true
    } else if (status.state === 'error') {
      busy.value = false
      error.value = status.message ?? '更新失败'
    }
  })
})

onBeforeUnmount(() => {
  offPrompt?.()
  offStatus?.()
})

function later(): void {
  open.value = false
  window.api.updates.dismiss()
}

async function accept(): Promise<void> {
  error.value = ''
  if (downloaded.value) {
    window.api.updates.install()
    return
  }
  busy.value = true
  const result = await window.api.updates.download()
  busy.value = false
  if (result.state === 'error') {
    error.value = result.message ?? '下载更新失败'
  } else if (result.state === 'downloaded') {
    downloaded.value = true
  }
}
</script>

<template>
  <Transition name="fade">
    <div v-if="open" class="update-backdrop" @click.self="later">
      <section class="update-dialog" role="dialog" aria-modal="true" aria-label="应用更新">
        <button class="update-close" type="button" title="稍后" @click="later">
          <AppIcon name="close" :size="16" />
        </button>
        <p class="update-eyebrow">APPLICATION UPDATE</p>
        <h2>{{ downloaded ? '更新已下载' : '发现新版本' }}</h2>
        <p class="update-version">Ebook Viewer <strong>v{{ version }}</strong></p>
        <p class="update-desc">
          {{
            downloaded
              ? '更新包已下载并完成完整性校验。现在重启应用安装吗？'
              : '新版本来自 GitHub Releases。是否现在下载？下载完成后会再次询问是否重启安装。'
          }}
        </p>
        <p v-if="busy && !downloaded" class="update-progress">正在下载更新… {{ percent }}%</p>
        <p v-if="error" class="update-error">{{ error }}</p>
        <p class="update-security">
          <AppIcon name="info" :size="14" />
          <span>更新来自 GitHub Releases，并由 electron-updater 校验 SHA-512。更新不会修改书库、书籍、批注或阅读进度。</span>
        </p>
        <div class="update-actions">
          <button class="update-later" type="button" :disabled="busy" @click="later">稍后</button>
          <button class="update-accept" type="button" :disabled="busy" @click="accept">
            {{ downloaded ? '立即重启安装' : busy ? '正在下载…' : '立即下载' }}
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.update-backdrop {
  position: fixed;
  inset: 0;
  z-index: 420;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 18, 14, 0.4);
  backdrop-filter: blur(7px);
}

.update-dialog {
  position: relative;
  width: min(480px, 94vw);
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.update-close {
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

.update-close:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.update-eyebrow {
  margin: 0 0 7px;
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 0.18em;
}

.update-dialog h2 {
  margin: 0 0 7px;
  color: var(--ink);
  font-family: var(--font-display, Georgia, serif);
  font-size: 25px;
  font-weight: 600;
}

.update-version {
  margin: 0 0 12px;
  color: var(--ink-soft);
  font-size: 12px;
}

.update-version strong {
  color: var(--accent);
  font-weight: 600;
}

.update-desc {
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.75;
}

.update-progress {
  margin: 0 0 12px;
  color: var(--accent);
  font-size: 11px;
}

.update-error {
  margin: 0 0 12px;
  color: var(--danger, #a14f45);
  font-size: 11px;
  line-height: 1.6;
}

.update-security {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0 0 20px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.65;
}

.update-security svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--accent);
}

.update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.update-later,
.update-accept {
  height: 34px;
  padding: 0 15px;
  border-radius: 8px;
  font-size: 11px;
}

.update-later {
  border: 1px solid var(--line);
  color: var(--muted);
}

.update-later:hover {
  color: var(--ink);
  border-color: var(--accent);
}

.update-accept {
  background: var(--accent);
  color: var(--on-accent, #fffaf2);
}

.update-accept:disabled,
.update-later:disabled {
  opacity: 0.58;
  cursor: default;
}
</style>
