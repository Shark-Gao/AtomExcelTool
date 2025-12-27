<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ClassRegistry } from '../types/MetaDefine'

export type SearchableSelectOption = {
  label: string
  value: string
  funcName?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SearchableSelectOption[]
    registry: ClassRegistry
    placeholder?: string
    disabled?: boolean
    allowEmpty?: boolean
    emptyLabel?: string
  }>(),
  {
    placeholder: '搜索...'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const searchTerm = ref('')
const hoveredValue = ref<string>('')
const tooltipRef = ref<HTMLElement | null>(null)
const keyboardState = reactive({
  activeIndex: -1
})

const normalizedOptions = computed<SearchableSelectOption[]>(() => {
  const baseOptions = props.options ?? []
  if (!props.allowEmpty) {
    return baseOptions
  }
  const emptyLabel = props.emptyLabel ?? '请选择'
  return [{ label: emptyLabel, value: '' }, ...baseOptions]
})

// 连续子串匹配：查找 pattern 在 text 中的位置，返回匹配的字符索引
function substringMatch(text: string, pattern: string): number[] | null {
  const idx = text.indexOf(pattern)
  if (idx === -1) return null
  const indices: number[] = []
  for (let i = 0; i < pattern.length; i++) {
    indices.push(idx + i)
  }
  return indices
}

// 多关键词匹配：按空格分词，每个关键词都要作为连续子串匹配，返回所有匹配的字符索引
function multiKeywordMatch(text: string, keywords: string[]): number[] | null {
  const allIndices = new Set<number>()
  for (const keyword of keywords) {
    if (!keyword) continue
    const indices = substringMatch(text, keyword)
    if (!indices) return null
    indices.forEach(i => allIndices.add(i))
  }
  return allIndices.size > 0 ? Array.from(allIndices).sort((a, b) => a - b) : []
}

// 高亮文本：根据匹配索引生成带高亮的 HTML
function highlightText(text: string, indices: number[]): string {
  if (!indices.length) return text
  const indexSet = new Set(indices)
  let result = ''
  for (let i = 0; i < text.length; i++) {
    if (indexSet.has(i)) {
      result += `<span class="text-primary font-semibold">${text[i]}</span>`
    } else {
      result += text[i]
    }
  }
  return result
}

const searchKeywords = computed(() => {
  return searchTerm.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
})

const filteredOptions = computed<Array<SearchableSelectOption & { highlightedLabel: string }>>(() => {
  const keywords = searchKeywords.value
  if (!keywords.length) {
    return normalizedOptions.value.map(opt => ({
      ...opt,
      highlightedLabel: opt.label + (opt.funcName ? `_${opt.funcName}` : '')
    }))
  }
  
  const results: Array<SearchableSelectOption & { highlightedLabel: string }> = []
  
  for (const option of normalizedOptions.value) {
    const label = option.label?.toLowerCase() ?? ''
    const value = option.value?.toLowerCase() ?? ''
    const funcName = option.funcName?.toLowerCase() ?? ''
    const fullText = label + (funcName ? `_${funcName}` : '')
    const fullTextLower = fullText.toLowerCase()
    
    // 尝试在完整文本中匹配
    const fullIndices = multiKeywordMatch(fullTextLower, keywords)
    if (fullIndices) {
      results.push({
        ...option,
        highlightedLabel: highlightText(fullText, fullIndices)
      })
      continue
    }
    
    // 尝试在 value 中匹配
    const valueIndices = multiKeywordMatch(value, keywords)
    if (valueIndices) {
      results.push({
        ...option,
        highlightedLabel: fullText // value 匹配时不高亮显示文本
      })
    }
  }
  
  return results
})

const selectedOption = computed(() => {
  return normalizedOptions.value.find((option) => option.value === props.modelValue)
})

const hoveredDescription = computed(() => {
  if (!hoveredValue.value) {
    return ''
  }
  const info = props.registry[hoveredValue.value]
  return info?.classMeta.description ?? ''
})

function openDropdown() {
  if (props.disabled) {
    return
  }
  isOpen.value = true
  searchTerm.value = ''
  resetKeyboardNavigation()
}

function closeDropdown() {
  isOpen.value = false
  const opt = selectedOption.value
  searchTerm.value = opt ? (opt.funcName ? `${opt.label}_${opt.funcName}` : opt.label) : ''
  hoveredValue.value = ''
  resetKeyboardNavigation()
}

function resetKeyboardNavigation() {
  keyboardState.activeIndex = filteredOptions.value.findIndex(
    (option) => option.value === props.modelValue
  )
}

function selectOption(value: string) {
  if (props.disabled) {
    return
  }
  emit('update:modelValue', value)
  nextTick(() => {
    closeDropdown()
  })
}

function handleInputFocus() {
  openDropdown()
}

function setHoveredValue(value: string) {
  hoveredValue.value = value
}

function clearHoveredValue() {
  hoveredValue.value = ''
}

function updateTooltipPosition(event: MouseEvent) {
  if (!tooltipRef.value) return
  const offset = 10
  tooltipRef.value.style.left = `${event.clientX + offset}px`
  tooltipRef.value.style.top = `${event.clientY + offset}px`
}

function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value) {
    openDropdown()
  }
  const total = filteredOptions.value.length
  if (total === 0) {
    return
  }
  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault()
      keyboardState.activeIndex = (keyboardState.activeIndex + 1 + total) % total
      ensureOptionVisible()
      break
    }
    case 'ArrowUp': {
      event.preventDefault()
      keyboardState.activeIndex = (keyboardState.activeIndex - 1 + total) % total
      ensureOptionVisible()
      break
    }
    case 'Enter': {
      event.preventDefault()
      if (keyboardState.activeIndex >= 0 && keyboardState.activeIndex < total) {
        const option = filteredOptions.value[keyboardState.activeIndex]
        selectOption(option.value)
      }
      break
    }
    case 'Escape': {
      event.preventDefault()
      closeDropdown()
      break
    }
    default:
      break
  }
}

function ensureOptionVisible() {
  nextTick(() => {
    const list = rootRef.value?.querySelector('[data-option-list]') as HTMLElement | null
    if (!list) {
      return
    }
    const optionNodes = Array.from(list.querySelectorAll<HTMLElement>('[data-option-item]'))
    const target = optionNodes[keyboardState.activeIndex]
    if (!target) {
      return
    }
    const listRect = list.getBoundingClientRect()
    const optionRect = target.getBoundingClientRect()
    if (optionRect.top < listRect.top) {
      list.scrollTop -= listRect.top - optionRect.top
    } else if (optionRect.bottom > listRect.bottom) {
      list.scrollTop += optionRect.bottom - listRect.bottom
    }
  })
}

function syncSearchTermFromValue() {
  if (isOpen.value) {
    return
  }
  const opt = selectedOption.value
  searchTerm.value = opt ? (opt.funcName ? `${opt.label}_${opt.funcName}` : opt.label) : ''
}

watch(
  () => props.modelValue,
  () => {
    syncSearchTermFromValue()
  },
  { immediate: true }
)

watch(
  () => props.options,
  () => {
    syncSearchTermFromValue()
    resetKeyboardNavigation()
  },
  { deep: true }
)

function handleClickOutside(event: MouseEvent) {
  if (!rootRef.value) {
    return
  }
  if (!rootRef.value.contains(event.target as Node)) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <div
      class="input input-bordered input-sm flex w-full cursor-text items-center gap-2"
      :class="{ 'opacity-50 pointer-events-none': disabled }"
      @click="handleInputFocus"
    >
      <input
        :value="searchTerm"
        :placeholder="placeholder"
        class="flex-1 bg-transparent text-sm outline-none"
        :disabled="disabled"
        @focus="handleInputFocus"
        @input="searchTerm = ($event.target as HTMLInputElement).value"
        @keydown="handleKeydown"
      />
      <span class="text-xs uppercase text-base-content/60">搜索</span>
    </div>

    <Transition name="fade">
      <div
        v-if="isOpen"
        class="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl"
      >
        <div
          v-if="filteredOptions.length === 0"
          class="px-4 py-3 text-xs text-base-content/50"
        >
          无匹配结果
        </div>
        <ul
          v-else
          data-option-list
          class="max-h-160 overflow-auto py-2"
        >
          <li
            v-for="(option, index) in filteredOptions"
            :key="option.value"
            data-option-item
            class="px-4 py-2 text-sm transition-colors cursor-pointer"
            :class="[
              option.value === modelValue ? 'bg-primary/10 text-primary' : 'hover:bg-base-200',
              keyboardState.activeIndex === index ? 'bg-primary/20 text-primary' : ''
            ]"
            @mouseenter="(e) => {
              setHoveredValue(option.value)
              keyboardState.activeIndex = index
              updateTooltipPosition(e as MouseEvent)
            }"
            @mousemove="updateTooltipPosition"
            @mouseleave="clearHoveredValue"
            @mousedown.prevent="selectOption(option.value)"
          >
            <span v-html="option.highlightedLabel"></span>
          </li>
        </ul>
      </div>
    </Transition>

    <!-- Floating Tooltip -->
    <Teleport to="body">
      <div
        v-if="hoveredDescription"
        ref="tooltipRef"
        class="fixed z-[9999] max-w-xs rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-[12px] leading-relaxed text-base-content shadow-lg pointer-events-none"
      >
        {{ hoveredDescription }}
      </div>
    </Teleport>
  </div>
</template>
