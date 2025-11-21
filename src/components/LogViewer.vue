<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface LogInfo {
  ok: boolean
  logDir?: string
  logFilePath?: string
  error?: string
}

const logInfo = ref<LogInfo | null>(null)
const isLoading = ref(false)
const showDetails = ref(false)

onMounted(async () => {
  await fetchLogInfo()
})

async function fetchLogInfo() {
  isLoading.value = true
  try {
    if (!window.electronAPI?.getLogInfo) {
      logInfo.value = { ok: false, error: '日志接口未初始化' }
      return
    }
    const result = await window.electronAPI.getLogInfo()
    logInfo.value = result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logInfo.value = { ok: false, error: `获取日志信息失败: ${message}` }
  } finally {
    isLoading.value = false
  }
}

function openLog() {
  if (logInfo.value?.logDir) {
    window.electronAPI?.invoke('shell:openPath', logInfo.value.logFilePath)
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('已复制到剪贴板')
  })
}
</script>

<template>
  <div class="tooltip tooltip-left" data-tip="查看应用日志">
    <button
      @click="showDetails = !showDetails"
      class="btn btn-sm btn-ghost gap-2"
      title="查看日志"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      日志
    </button>

    <!-- 日志详情弹窗 -->
    <div v-if="showDetails" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showDetails = false">
      <div class="modal-box w-full max-w-md shadow-xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-lg flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            应用日志
          </h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="showDetails = false">✕</button>
        </div>

        <div class="divider my-2"></div>

        <!-- 加载状态 -->
        <div v-if="isLoading" class="flex justify-center py-8">
          <span class="loading loading-spinner loading-md"></span>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="logInfo && !logInfo.ok" class="alert alert-error py-3">
          <svg class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l-2-2m0 0l-2-2m2 2l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 class="font-bold">错误</h3>
            <div class="text-xs">{{ logInfo.error }}</div>
          </div>
        </div>

        <!-- 日志信息 -->
        <div v-else-if="logInfo && logInfo.ok" class="space-y-4">
          <div class="form-control">
            <label class="label">
              <span class="label-text text-sm font-semibold">日志目录</span>
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                :value="logInfo.logDir || ''"
                readonly
                class="input input-bordered input-sm flex-1 font-mono text-xs"
              />
              <button
                class="btn btn-sm btn-ghost"
                @click="copyToClipboard(logInfo.logDir || '')"
                title="复制"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div class="form-control">
            <label class="label">
              <span class="label-text text-sm font-semibold">当前日志文件</span>
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                :value="logInfo.logFilePath || ''"
                readonly
                class="input input-bordered input-sm flex-1 font-mono text-xs"
              />
              <button
                class="btn btn-sm btn-ghost"
                @click="copyToClipboard(logInfo.logFilePath || '')"
                title="复制"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <button
            class="btn btn-sm btn-primary w-full"
            @click="openLog"
            title="打开当前日志"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v10a2 2 0 01-2 2H5z" />
            </svg>
            打开当前日志
          </button>
        </div>

        <div class="modal-action">
          <button class="btn btn-sm" @click="showDetails = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>
