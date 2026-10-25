import { createRouter, createWebHashHistory } from 'vue-router'
import LibraryView from './views/LibraryView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'library', component: LibraryView },
    {
      path: '/reader/:id',
      name: 'reader',
      component: () => import('./views/ReaderView.vue')
    },
    {
      path: '/stealth',
      name: 'stealth',
      component: () => import('./views/StealthView.vue')
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

export default router
