import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initializeMonacoTypes } from './utils/monacoTypeRegistry'

// 先挂载应用，然后等待元数据加载完成后初始化 Monaco 类型
const app = createApp(App)
app.mount('#app')

// 监听元数据加载完成事件，然后初始化 Monaco 类型定义
// @ts-ignore - delegateBridge 在 preload 中暴露
if (window.delegateBridge?.onMetadataLoaded) {
  // @ts-ignore
  const unsubscribe = window.delegateBridge.onMetadataLoaded(() => {
    console.log('[main] Delegate metadata loaded, initializing Monaco types...')
    initializeMonacoTypes().then(() => {
      console.log('[main] Monaco types initialized')
    })
    unsubscribe()
  })
} else {
  // 非 Electron 环境，直接初始化（可能在纯 web 调试模式）
  console.log('[main] No delegateBridge, initializing Monaco types directly...')
  initializeMonacoTypes()
}