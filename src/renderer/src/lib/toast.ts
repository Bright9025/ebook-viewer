import { reactive } from 'vue'

export type ToastKind = 'info' | 'error' | 'success'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

export const toasts = reactive<ToastItem[]>([])
let nextId = 1

export function dismissToast(id: number): void {
  const index = toasts.findIndex((item) => item.id === id)
  if (index >= 0) toasts.splice(index, 1)
}

export function toast(message: string, kind: ToastKind = 'info', duration = 3200): number {
  const id = nextId++
  toasts.push({ id, message, kind })
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration)
  }
  return id
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}
