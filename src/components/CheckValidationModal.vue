<script setup lang="ts">
import { computed, ref } from 'vue'

export type ValidationErrorItem = {
  rowName: string
  fieldName: string
  error: string
  content?: string
}

export type ValidationResult = {
  isOpen: boolean
  isChecking: boolean
  totalRows: number
  totalFields: number
  errorCount: number
  errors: ValidationErrorItem[]
}

const props = defineProps<{
  result: ValidationResult
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

const copyMessageTimeout = ref<number | null>(null)
const copyMessage = ref<string | null>(null)

const hasErrors = computed(() => props.result.errors && props.result.errors.length > 0)

const successPercentage = computed(() => {
  if (props.result.totalFields === 0) return 0
  return ((props.result.totalFields - props.result.errorCount) / props.result.totalFields) * 100
})

const successPercentageFormatted = computed(() => {
  return successPercentage.value.toFixed(2)
})

const generateErrorText = () => {
  const lines: string[] = [
    '原子字段检查结果',
    `\n总检查字段数: ${props.result.totalFields}`,
    `\n失败字段数: ${props.result.errorCount}`,
    `\n成功率: ${successPercentageFormatted.value}%`,
    ''
  ]

  if (hasErrors.value) {
    lines.push(`\n检查失败的字段 (${props.result.errors.length}):`)
    lines.push('\n')
    props.result.errors.forEach((error, index) => {
      lines.push(`\n[${index + 1}] RowName:${error.rowName}  Field:${error.fieldName}`)
      lines.push(`\n    错误: ${error.error}`)
      if (error.content) {
        lines.push(`\n    内容: ${error.content}`)
      }
      lines.push('\n')
    })
  } else {
    lines.push('\n所有原子字段解析检查通过！')
  }

  return lines.join('')
}

const copyAllErrors = async () => {
  try {
    const text = generateErrorText()
    await navigator.clipboard.writeText(text)
    copyMessage.value = '已复制到剪贴板'
    if (copyMessageTimeout.value) {
      clearTimeout(copyMessageTimeout.value)
    }
    copyMessageTimeout.value = window.setTimeout(() => {
      copyMessage.value = null
    }, 2000)
  } catch (error) {
    console.error('复制失败:', error)
    copyMessage.value = '复制失败'
  }
}
</script>

<template>
  <div v-if="result.isOpen" class="modal modal-open">
    <div class="modal-box max-w-2xl max-h-[80vh] flex flex-col">
      <button
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
        @click="emit('update:isOpen', false)"
      >
        ✕
      </button>

      <h3 class="font-bold text-lg mb-4">原子字段检查结果</h3>

      <!-- 检查中状态 -->
      <div v-if="result.isChecking" class="flex flex-col items-center justify-center py-12">
        <span class="loading loading-spinner loading-lg text-primary mb-4"></span>
        <p class="text-base-content/60">正在检查所有原子字段...</p>
      </div>

      <!-- 检查完成状态 -->
      <div v-else class="flex-1 overflow-y-auto">
        <!-- 统计信息 -->
        <div class="stats stats-vertical lg:stats-horizontal w-full mb-4 shadow">
          <div class="stat">
            <div class="stat-title">总检查字段数</div>
            <div class="stat-value text-primary">{{ result.totalFields }}</div>
          </div>
          <div class="stat">
            <div class="stat-title">失败</div>
            <div class="stat-value text-error">{{ result.errorCount }}</div>
          </div>
          <div class="stat">
            <div class="stat-title">成功率</div>
            <div class="stat-value text-info">{{ successPercentageFormatted }}%</div>
          </div>
        </div>

        <!-- 复制提示 -->
        <div v-if="copyMessage" class="alert alert-info mb-4">
          {{ copyMessage }}
        </div>

        <!-- 错误列表 -->
        <div v-if="hasErrors" class="mt-6">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-semibold text-error">检查失败的字段 ({{ result.errors.length }})</h4>
            <button
              class="btn btn-sm btn-outline"
              @click="copyAllErrors"
              title="复制所有错误信息"
            >
              复制错误
            </button>
          </div>
          <div class="space-y-3 max-h-[400px] overflow-y-auto">
            <div
              v-for="(error, index) in result.errors"
              :key="index"
              class="alert alert-error shadow-md"
            >
              <div class="flex-1">
                <div class="font-semibold">
                  {{ error.rowName }} / {{ error.fieldName }}
                </div>
                <div class="text-sm mt-1">{{ error.error }}</div>
                <div v-if="error.content" class="text-xs mt-2 font-mono bg-black/20 p-2 rounded break-all">
                  内容: {{ error.content }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 成功提示 -->
        <div v-else class="alert alert-success shadow-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <span>所有原子字段解析检查通过！</span>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="modal-action mt-6">
        <button
          class="btn"
          @click="emit('update:isOpen', false)"
          :disabled="result.isChecking"
        >
          关闭
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button @click="emit('update:isOpen', false)"></button>
    </form>
  </div>
</template>

<style scoped>
/* 保证滚动条显示 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
</style>
