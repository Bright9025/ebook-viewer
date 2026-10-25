import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAppStore } from './stores/app'
import './styles/tokens.css'
import './styles/base.css'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  app.use(createPinia())

  const store = useAppStore()
  try {
    await store.init()
  } catch (error) {
    console.error('[app] failed to load library', error)
  }

  app.use(router)
  app.mount('#app')
}

void bootstrap()
