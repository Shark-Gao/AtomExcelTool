<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface Option {
  label: string
  value: any
}

const props = defineProps<{
  modelValue: string
  options: Option[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchTerm = ref('')

// 同步外部值到搜索词
watch(() => props.modelValue, (val) => {
  searchTerm.value = val ?? ''
}, { immediate: true })




// 模糊搜索：空格分隔多个片段，每个片段必须作为连续子串按顺序出现
function fuzzyMatch(text: string, pattern: string): boolean {
  const lowerText = text.toLowerCase()
  // 按空格分隔成多个片段，过滤空片段
  const segments = pattern.toLowerCase().split(/\s+/).filter(s => s.length > 0)
  
  if (segments.length === 0) return true
  
  // 每个片段必须按顺序作为子串出现
  let searchFrom = 0
  for (const segment of segments) {
    const foundIndex = lowerText.indexOf(segment, searchFrom)
    if (foundIndex === -1) {
      return false
    }
    searchFrom = foundIndex + segment.length
  }
  return true
}

// 高亮匹配的片段
function highlightMatch(text: string, pattern: string): string {
  if (!pattern) return text
  
  const segments = pattern.toLowerCase().split(/\s+/).filter(s => s.length > 0)
  if (segments.length === 0) return text
  
  const lowerText = text.toLowerCase()
  const matchedRanges: Array<{start: number, end: number}> = []
  let searchFrom = 0
  
  for (const segment of segments) {
    const foundIndex = lowerText.indexOf(segment, searchFrom)
    if (foundIndex !== -1) {
      matchedRanges.push({ start: foundIndex, end: foundIndex + segment.length })
      searchFrom = foundIndex + segment.length
    }
  }
  
  // 构建高亮结果
  let result = ''
  let lastEnd = 0
  for (const range of matchedRanges) {
    result += text.slice(lastEnd, range.start)
    result += `<span style="color:#3b82f6">${text.slice(range.start, range.end)}</span>`
    lastEnd = range.end
  }
  result += text.slice(lastEnd)
  
  return result
}

// 过滤后的选项（支持模糊搜索）
const filteredOptions = computed(() => {
  if (!searchTerm.value) {
    return props.options
  }
  return props.options.filter(opt => 
    fuzzyMatch(opt.label, searchTerm.value) || 
    fuzzyMatch(String(opt.value), searchTerm.value)
  )
})

// 处理输入
function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  searchTerm.value = value
  emit('update:modelValue', value)
  isOpen.value = true
}

// 选择选项
function selectOption(option: Option) {
  searchTerm.value = option.value
  emit('update:modelValue', option.value)
  isOpen.value = false
}

// 清空内容
function clearValue() {
  searchTerm.value = ''
  emit('update:modelValue', '')
  inputRef.value?.focus()
}

// 切换下拉框
function toggleDropdown() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

// 点击外部关闭
function handleClickOutside(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="rootRef" class="relative flex-1">
    <div class="flex items-center">
      <input
        ref="inputRef"
        type="text"
        class="input input-xs input-bordered flex-1 h-6 min-h-0 pr-12"
        :value="searchTerm"
        :disabled="disabled"
        @input="handleInput"
        @focus="isOpen = true"
      />
      <!-- 清空按钮 -->
      <button
        v-if="searchTerm && !disabled"
        type="button"
        class="btn btn-xs btn-ghost h-5 min-h-0 w-5 p-0 absolute right-6 text-base-content/50 hover:text-base-content"
        title="清空"
        @click.stop="clearValue"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <!-- 下拉按钮 -->
      <button
        type="button"
        class="btn btn-xs btn-ghost h-6 min-h-0 px-1 border-0 hover:bg-base-200 absolute right-0"
        :class="{ 'pointer-events-none opacity-50': disabled }"
        @click.stop="toggleDropdown"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
    <ul
      v-if="isOpen && filteredOptions.length > 0"
      class="absolute left-0 top-full mt-1 w-full bg-base-100 rounded-box z-50 p-1 shadow-lg border border-base-300 max-h-60 overflow-y-auto"
    >
      <li
        v-for="option in filteredOptions"
        :key="option.value"
        class="text-xs py-1 px-2 cursor-pointer hover:bg-base-200 rounded"
        :class="{ 'bg-primary/20': modelValue === option.value }"
        @click="selectOption(option)"
        v-html="highlightMatch(option.label, searchTerm)"
      ></li>
    </ul>
    <div
      v-else-if="isOpen && filteredOptions.length === 0"
      class="absolute left-0 top-full mt-1 w-full bg-base-100 rounded-box z-50 p-2 shadow-lg border border-base-300 text-xs text-base-content/50"
    >
      无匹配选项
    </div>
  </div>
</template>
