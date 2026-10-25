import type { Api } from '../shared/api'

declare global {
  interface Window {
    api: Api
    __ebookTest?: Record<string, unknown>
  }
}

export {}
