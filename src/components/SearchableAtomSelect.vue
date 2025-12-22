<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ClassRegistry } from '../types/MetaDefine'

export type SearchableSelectOption = {
  label: string
  value: string
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
const tooltipPos = reactive({
  x: 0,
  y: 0
})
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

const filteredOptions = computed<SearchableSelectOption[]>(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) {
    return normalizedOptions.value
  }
  return normalizedOptions.value.filter((option) => {
    const label = option.label?.toLowerCase() ?? ''
    const value = option.value?.toLowerCase() ?? ''
    return label.includes(term) || value.includes(term)
  })
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
  searchTerm.value = selectedOption.value?.label ?? ''
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
  tooltipPos.x = event.clientX + offset
  tooltipPos.y = event.clientY + offset
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
  searchTerm.value = selectedOption.value?.label ?? ''
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
      class="input input-bordered flex w-full cursor-text items-center gap-2"
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
            <span>{{ option.label }}</span>
          </li>
        </ul>
      </div>
    </Transition>

    <!-- Floating Tooltip -->
    <Transition name="fade">
      <div
        v-if="hoveredDescription"
        ref="tooltipRef"
        class="fixed z-[9999] max-w-xs rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-[12px] leading-relaxed text-base-content shadow-lg pointer-events-none"
        :style="{
          left: `${tooltipPos.x}px`,
          top: `${tooltipPos.y}px`
        }"
      >
        {{ hoveredDescription }}
      </div>
    </Transition>
  </div>
</template>
