<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ClassRegistry } from '../types/MetaDefine'

export type SearchableSelectOption = {
  label: string
  value: string
  funcName?: string
}

/** 分组后的选项结构 */
type GroupedOption = SearchableSelectOption & { 
  highlightedLabel: string
  isNumberShortcut?: boolean
  isBooleanShortcut?: boolean
  category?: string
  author?: string
}

type CategoryGroup = {
  category: string
  isExpanded: boolean
  options: GroupedOption[]
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
    /** 当前字段的基类，用于智能推断选项 */
    baseClass?: string
  }>(),
  {
    placeholder: '搜索...'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** 当用户输入数字并选择 NumberValueConstDelegate 时，传递输入的数字值 */
  'select-with-number': [className: string, numberValue: number]
  /** 当用户输入布尔值并选择 BoolValueConstDelegate 时，传递输入的布尔值 */
  'select-with-boolean': [className: string, boolValue: boolean]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const searchTerm = ref('')
const hoveredValue = ref<string>('')
const tooltipRef = ref<HTMLElement | null>(null)
const keyboardState = reactive({
  activeIndex: -1
})

/** 分类展开状态 */
const expandedCategories = reactive<Record<string, boolean>>({})

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

/** 检测搜索词是否为有效数字 */
const parsedNumberValue = computed<number | null>(() => {
  const trimmed = searchTerm.value.trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
})

/** 是否应该显示 NumberValueConstDelegate 快捷选项 */
const shouldShowNumberConstShortcut = computed(() => {
  return (
    parsedNumberValue.value !== null &&
    props.baseClass === 'NumberValueDelegate' &&
    props.options.some(opt => opt.value === 'NumberValueConstDelegate')
  )
})

/** 检测搜索词是否为布尔值 */
const parsedBooleanValue = computed<boolean | null>(() => {
  const trimmed = searchTerm.value.trim().toLowerCase()
  if (trimmed === 'true' || trimmed === '1') return true
  if (trimmed === 'false' || trimmed === '0') return false
  return null
})

/** 是否应该显示 BoolValueConstDelegate 快捷选项 */
const shouldShowBoolConstShortcut = computed(() => {
  return (
    parsedBooleanValue.value !== null &&
    props.baseClass === 'BoolValueDelegate' &&
    props.options.some(opt => opt.value === 'BoolValueConstDelegate')
  )
})

/** 获取选项的分类和作者信息 */
function getOptionMeta(optionValue: string): { category?: string; author?: string } {
  const info = props.registry[optionValue]
  return {
    category: info?.classMeta?.category,
    author: info?.classMeta?.author
  }
}

const filteredOptions = computed<GroupedOption[]>(() => {
  const keywords = searchKeywords.value
  
  // 如果应该显示数字常量快捷选项
  if (shouldShowNumberConstShortcut.value) {
    const numberConstOption = props.options.find(opt => opt.value === 'NumberValueConstDelegate')
    if (numberConstOption) {
      const displayLabel = `${numberConstOption.label}_${numberConstOption.funcName ?? 'NumberValueConst'}`
      const highlightedLabel = `<span class="text-primary font-semibold">${parsedNumberValue.value}</span> → ${displayLabel}`
      const meta = getOptionMeta(numberConstOption.value)
      return [{
        ...numberConstOption,
        highlightedLabel,
        isNumberShortcut: true,
        category: meta.category,
        author: meta.author
      }]
    }
  }
  
  // 如果应该显示布尔常量快捷选项
  if (shouldShowBoolConstShortcut.value) {
    const boolConstOption = props.options.find(opt => opt.value === 'BoolValueConstDelegate')
    if (boolConstOption) {
      const displayLabel = `${boolConstOption.label}_${boolConstOption.funcName ?? 'BoolValueConst'}`
      const boolDisplayValue = parsedBooleanValue.value ? 'true' : 'false'
      const highlightedLabel = `<span class="text-primary font-semibold">${boolDisplayValue}</span> → ${displayLabel}`
      const meta = getOptionMeta(boolConstOption.value)
      return [{
        ...boolConstOption,
        highlightedLabel,
        isBooleanShortcut: true,
        category: meta.category,
        author: meta.author
      }]
    }
  }
  
  if (!keywords.length) {
    return normalizedOptions.value.map(opt => {
      const meta = getOptionMeta(opt.value)
      return {
        ...opt,
        highlightedLabel: opt.label + (opt.funcName ? `_${opt.funcName}` : ''),
        category: meta.category,
        author: meta.author
      }
    })
  }
  
  const results: GroupedOption[] = []
  
  for (const option of normalizedOptions.value) {
    const label = option.label ?? ''
    const funcName = option.funcName ?? ''
    // 原始文本用于显示
    const fullText = label + (funcName ? `_${funcName}` : '')
    // 小写文本用于匹配
    const fullTextLower = fullText.toLowerCase()
    const valueLower = (option.value ?? '').toLowerCase()
    const meta = getOptionMeta(option.value)
    // 也支持按分类搜索
    const categoryLower = (meta.category ?? '').toLowerCase()
    
    // 尝试在完整文本中匹配
    const fullIndices = multiKeywordMatch(fullTextLower, keywords)
    if (fullIndices) {
      results.push({
        ...option,
        highlightedLabel: highlightText(fullText, fullIndices),
        category: meta.category,
        author: meta.author
      })
      continue
    }
    
    // 尝试在 value 中匹配
    const valueIndices = multiKeywordMatch(valueLower, keywords)
    if (valueIndices) {
      results.push({
        ...option,
        highlightedLabel: fullText,
        category: meta.category,
        author: meta.author
      })
      continue
    }
    
    // 尝试在分类中匹配
    const categoryIndices = multiKeywordMatch(categoryLower, keywords)
    if (categoryIndices) {
      results.push({
        ...option,
        highlightedLabel: fullText,
        category: meta.category,
        author: meta.author
      })
    }
  }
  
  return results
})

/** 默认分类名称 */
const DEFAULT_CATEGORY = '未分类'

/** 按分类分组的选项 */
const groupedByCategory = computed<CategoryGroup[]>(() => {
  const options = filteredOptions.value
  const categoryMap = new Map<string, GroupedOption[]>()
  
  // 按分类分组
  for (const opt of options) {
    const cat = opt.category || DEFAULT_CATEGORY
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, [])
    }
    categoryMap.get(cat)!.push(opt)
  }
  
  // 转换为数组，未分类放在最后
  const groups: CategoryGroup[] = []
  const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) => {
    if (a === DEFAULT_CATEGORY) return 1
    if (b === DEFAULT_CATEGORY) return -1
    return a.localeCompare(b, 'zh-CN')
  })
  
  for (const category of sortedCategories) {
    groups.push({
      category,
      isExpanded: expandedCategories[category] ?? true, // 默认展开
      options: categoryMap.get(category)!
    })
  }
  
  return groups
})

/** 是否有多个分类（用于决定是否显示分类折叠） */
const hasMultipleCategories = computed(() => {
  return groupedByCategory.value.length > 1
})

/** 切换分类展开状态 */
function toggleCategory(category: string) {
  expandedCategories[category] = !(expandedCategories[category] ?? true)
}

/** 获取扁平化的选项列表（用于键盘导航） */
const flatVisibleOptions = computed<GroupedOption[]>(() => {
  const result: GroupedOption[] = []
  for (const group of groupedByCategory.value) {
    if (group.isExpanded) {
      result.push(...group.options)
    }
  }
  return result
})

const selectedOption = computed(() => {
  return normalizedOptions.value.find((option) => option.value === props.modelValue)
})

const hoveredDescription = computed(() => {
  if (!hoveredValue.value) {
    return ''
  }
  const info = props.registry[hoveredValue.value]
  if (!info?.classMeta) {
    return ''
  }
  const parts: string[] = []
  if (info.classMeta.author) {
    parts.push(`作者: ${info.classMeta.author}`)
  }
  if (info.classMeta.description) {
    parts.push(info.classMeta.description)
  }
  return parts.join('\n')
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
  keyboardState.activeIndex = flatVisibleOptions.value.findIndex(
    (option) => option.value === props.modelValue
  )
}

function selectOption(value: string, isNumberShortcut?: boolean, isBooleanShortcut?: boolean) {
  if (props.disabled) {
    return
  }
  
  // 如果是数字快捷方式选择 NumberValueConstDelegate，额外 emit 数字值
  if (isNumberShortcut && value === 'NumberValueConstDelegate' && parsedNumberValue.value !== null) {
    emit('select-with-number', value, parsedNumberValue.value)
  }
  
  // 如果是布尔快捷方式选择 BoolValueConstDelegate，额外 emit 布尔值
  if (isBooleanShortcut && value === 'BoolValueConstDelegate' && parsedBooleanValue.value !== null) {
    emit('select-with-boolean', value, parsedBooleanValue.value)
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
  const total = flatVisibleOptions.value.length
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
      // 如果没有选中项，默认选择第一项
      // const targetIndex = keyboardState.activeIndex >= 0 ? keyboardState.activeIndex : 0
      // if (targetIndex < total) {
        const option = flatVisibleOptions.value[0]
        selectOption(option.value, option.isNumberShortcut, option.isBooleanShortcut)
      // }
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
        class="absolute z-[9999] mt-1 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl"
      >
        <div
          v-if="filteredOptions.length === 0"
          class="px-4 py-3 text-xs text-base-content/50"
        >
          无匹配结果
        </div>
        <div
          v-else
          data-option-list
          class="max-h-160 overflow-auto py-2"
        >
          <!-- 有多个分类时显示分类折叠 -->
          <template v-if="hasMultipleCategories">
            <div v-for="group in groupedByCategory" :key="group.category" class="mb-1">
              <!-- 分类标题 -->
              <div
                class="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-base-content/70 bg-base-200/50 cursor-pointer select-none hover:bg-base-200"
                @click="toggleCategory(group.category)"
              >
                <svg
                  class="w-3 h-3 transition-transform"
                  :class="{ 'rotate-90': group.isExpanded }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span>{{ group.category }}</span>
                <span class="text-base-content/40 ml-1">({{ group.options.length }})</span>
              </div>
              <!-- 分类下的选项 -->
              <ul v-show="group.isExpanded">
                <li
                  v-for="option in group.options"
                  :key="option.value"
                  data-option-item
                  class="pl-8 pr-4 py-2 text-sm transition-colors cursor-pointer"
                  :class="[
                    option.value === modelValue ? 'bg-primary/10 text-primary' : 'hover:bg-base-200',
                    flatVisibleOptions[keyboardState.activeIndex]?.value === option.value ? 'bg-primary/20 text-primary' : ''
                  ]"
                  @mouseenter="(e) => {
                    setHoveredValue(option.value)
                    keyboardState.activeIndex = flatVisibleOptions.findIndex(o => o.value === option.value)
                    updateTooltipPosition(e as MouseEvent)
                  }"
                  @mousemove="updateTooltipPosition"
                  @mouseleave="clearHoveredValue"
                  @mousedown.prevent="selectOption(option.value, option.isNumberShortcut, option.isBooleanShortcut)"
                >
                  <span v-html="option.highlightedLabel"></span>
                </li>
              </ul>
            </div>
          </template>
          <!-- 只有一个分类或无分类时，平铺显示 -->
          <ul v-else>
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
              @mousedown.prevent="selectOption(option.value, option.isNumberShortcut, option.isBooleanShortcut)"
            >
              <span v-html="option.highlightedLabel"></span>
            </li>
          </ul>
        </div>
      </div>
    </Transition>

    <!-- Floating Tooltip -->
    <Teleport to="body">
      <div
        v-if="hoveredDescription"
        ref="tooltipRef"
        class="fixed z-[9999] max-w-xs rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-[12px] leading-relaxed text-base-content shadow-lg pointer-events-none whitespace-pre-line"
      >
        {{ hoveredDescription }}
      </div>
    </Teleport>
  </div>
</template>
