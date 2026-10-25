<script setup lang="ts">
import { dismissToast, toasts } from '../lib/toast'
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <button
          v-for="item in toasts"
          :key="item.id"
          class="toast-item"
          :class="`is-${item.kind}`"
          type="button"
          @click="dismissToast(item.id)"
        >
          {{ item.message }}
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 1000;
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
  max-width: 460px;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-md);
  font-size: 13px;
  line-height: 1.4;
  transition: transform 0.2s var(--ease), opacity 0.2s var(--ease);
}

.toast-item.is-error {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 35%, transparent);
}

.toast-item.is-success {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
</style>
