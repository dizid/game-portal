import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createUnhead, headSymbol } from '@unhead/vue'
import router from './router'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)
const head = createUnhead()

app.use(createPinia())
app.provide(headSymbol, head)
app.use(router)

// GA4: track page views on route change (SPA-aware)
declare function gtag(...args: unknown[]): void
router.afterEach((to) => {
  if (typeof gtag === 'function') {
    gtag('event', 'page_view', {
      page_path: to.fullPath,
      page_title: document.title,
    })
  }
})

app.mount('#app')
