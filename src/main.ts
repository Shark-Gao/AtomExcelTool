import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initializeMonacoTypes } from './utils/monacoTypeRegistry'

// 初始化 Monaco 类型定义（全局共享），然后挂载应用
initializeMonacoTypes().then(() => {
  const app = createApp(App)
  app.mount('#app')
})