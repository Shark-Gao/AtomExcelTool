<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  isVisible: boolean
  message?: string
  progress?: number // 0-100
  type?: 'saving' | 'loading' | 'processing'
}

const props = withDefaults(defineProps<Props>(), {
  message: '处理中...',
  progress: 0,
  type: 'processing'
})

const displayMessage = computed(() => {
  const typeMessages: Record<string, string> = {
    saving: '正在保存...',
    loading: '正在加载...',
    processing: '处理中...'
  }
  return props.message || typeMessages[props.type]
})

const showProgress = computed(() => props.progress > 0 && props.progress < 100)
</script>

<template>
  <Transition name="modal">
    <div v-if="isVisible" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div class="rounded-lg bg-base-100 p-8 shadow-2xl w-80">
        <div class="flex flex-col items-center gap-4">
          <!-- 加载动画 -->
          <span class="loading loading-spinner text-primary" style="width: 3rem; height: 3rem"></span>
          
          <!-- 消息文本 -->
          <p class="text-center font-semibold">{{ displayMessage }}</p>
          
          <!-- 进度条 -->
          <div v-if="showProgress" class="w-full">
            <progress class="progress progress-primary w-full" :value="progress" max="100"></progress>
            <p class="text-center text-sm text-base-content/60 mt-2">{{ progress }}%</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from {
  opacity: 0;
}

.modal-leave-to {
  opacity: 0;
}

.modal-enter-from :deep(div),
.modal-leave-to :deep(div) {
  transform: scale(0.9);
}

:deep(.modal-enter-active div),
:deep(.modal-leave-active div) {
  transition: transform 0.3s ease;
}
</style>
