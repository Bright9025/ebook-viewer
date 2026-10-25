<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
  }>(),
  { title: '确认删除', message: '', confirmText: '删除', cancelText: '取消' }
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog-backdrop" @click.self="emit('cancel')" @keydown.esc="emit('cancel')">
        <div class="dialog-card" role="dialog" aria-modal="true">
          <h2>{{ title }}</h2>
          <p v-if="message">{{ message }}</p>
          <div class="dialog-actions">
            <button class="ghost-button" type="button" @click="emit('cancel')">{{ cancelText }}</button>
            <button class="danger-button" type="button" @click="emit('confirm')">{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: grid;
  place-items: center;
  background: rgba(10, 10, 9, 0.32);
  backdrop-filter: blur(3px);
}

.dialog-card {
  width: min(380px, calc(100vw - 48px));
  padding: 26px 26px 20px;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
}

.dialog-card h2 {
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 600;
  margin-bottom: 10px;
}

.dialog-card p {
  color: var(--ink-soft);
  line-height: 1.7;
  font-size: 13.5px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.danger-button {
  height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-weight: 500;
}

.danger-button:hover {
  filter: brightness(1.06);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.18s var(--ease);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .dialog-card,
.dialog-leave-active .dialog-card {
  transition: transform 0.22s var(--ease);
}

.dialog-enter-from .dialog-card,
.dialog-leave-to .dialog-card {
  transform: translateY(8px) scale(0.98);
}
</style>
