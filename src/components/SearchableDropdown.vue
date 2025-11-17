<script setup lang="ts" generic="T extends { label: string; value: any }">
import { Transition } from 'vue'
import { computed, defineEmits, defineProps, reactive, ref, withDefaults } from 'vue'
import { ClassRegistry } from '../types/MetaDefine'

interface Props {
  modelValue?: string
  placeholder?: string
  options: Record<string, T[]>
  searchKeyword?: string
  open?: boolean
  disabled?: boolean
  registry: ClassRegistry
}

interface Emits {
  'update:modelValue': [value: string]
  'update:searchKeyword': [value: string]
  'update:open': [value: boolean]
  'select': [value: string, option: T]
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '搜索...',
  searchKeyword: '',
  open: false,
  disabled: false
})

const emit = defineEmits<Emits>()

let blurTimeoutId: ReturnType<typeof setTimeout> | null = null
const hoveredValue = ref<string>('')
const tooltipPos = reactive({
  x: 0,
  y: 0
})
const tooltipRef = ref<HTMLElement | null>(null)

// 过滤选项（支持搜索）
const filteredOptions = computed(() => {
  const keyword = props.searchKeyword.trim().toLowerCase()
  const result: Record<string, T[]> = {}

  for (const [baseClass, options] of Object.entries(props.options)) {
    if (!keyword) {
      result[baseClass] = options
      continue
    }

    const filtered = options.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) ||
        String(option.value).toLowerCase().includes(keyword)
    )

    if (filtered.length > 0) {
      result[baseClass] = filtered
    }
  }

  return result
})

const hasResults = computed(() => {
  return Object.values(filteredOptions.value).some(options => options.length > 0)
})

const hoveredDescription = computed(() => {
  if (!hoveredValue.value) {
    return ''
  }
  const info = props.registry[hoveredValue.value]
  return info?.classMeta.description ?? ''
})

function handleSelect(value: string, option: T) {
  emit('update:modelValue', value)
  emit('select', value, option)
  emit('update:searchKeyword', '')
  emit('update:open', false)
  hoveredValue.value = ''
}

function handleSearchInput(value: string) {
  emit('update:searchKeyword', value)
}

function handleFocus() {
  if (blurTimeoutId !== null) {
    clearTimeout(blurTimeoutId)
    blurTimeoutId = null
  }
  emit('update:open', true)
}

function handleBlur() {
  hoveredValue.value = ''
  emit('update:open', false)
}

function setHoveredValue(value: string) {
  hoveredValue.value = value
}

function clearHoveredValue() {
  hoveredValue.value = ''
}

function updateTooltipPosition(event: MouseEvent) {
  const offset = 10
  tooltipPos.x = event.clientX + offset
  tooltipPos.y = event.clientY + offset
}
</script>

<template>
  <div class="dropdown dropdown-open w-full">
    <input
      :value="props.searchKeyword"
      type="text"
      :placeholder="placeholder"
      :disabled="disabled"
      class="input input-bordered input-sm w-full"
      @input="handleSearchInput(($event.target as HTMLInputElement).value)"
      @focus="handleFocus"
      @blur="handleBlur"
    />
    <ul
      v-if="props.open"
      class="dropdown-content menu bg-base-100 rounded-box z-9999 w-full p-2 shadow border border-base-300 max-h-164 overflow-y-auto overflow-x-hidden grid grid-cols-1"
    >
      <template v-for="(options, baseClass) in filteredOptions" :key="baseClass">
        <li v-if="options.length > 0" class="menu-title sticky top-0 z-10 bg-base-100">
          <span class="text-xs font-semibold">{{ baseClass }}</span>
        </li>
        <li
          v-for="option in options"
          :key="option.value"
          class="w-full"
          @mouseenter="(e) => {
            setHoveredValue(option.value)
            updateTooltipPosition(e as MouseEvent)
          }"
          @mousemove="updateTooltipPosition"
          @mouseleave="clearHoveredValue"
        >
          <a class="w-full" @mousedown.prevent="handleSelect(option.value, option)" @click.prevent>
            {{ option.label }}
          </a>
        </li>
      </template>

      <li v-if="!hasResults">
        <a class="text-base-content/50">无匹配结果</a>
      </li>
    </ul>

    <Transition name="fade">
      <div
        v-if="hoveredDescription"
        ref="tooltipRef"
        class="fixed z-[10000] max-w-xs rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-[12px] leading-relaxed text-base-content shadow-lg pointer-events-none"
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

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
