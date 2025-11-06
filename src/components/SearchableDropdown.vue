<script setup lang="ts" generic="T extends { label: string; value: any }">
import { computed, defineEmits, defineProps, ref, watch, withDefaults } from 'vue'

interface Props {
  modelValue?: string
  placeholder?: string
  options: Record<string, T[]>
  searchKeyword?: string
  open?: boolean
  disabled?: boolean
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

// 使用 props 中的值作为真实来源，不维护本地状态
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

function handleSelect(value: string, option: T) {
  emit('update:modelValue', value)
  emit('select', value, option)
  emit('update:searchKeyword', '')
  emit('update:open', false)
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
  // 延迟关闭，保证点击事件有机会先触发
  blurTimeoutId = setTimeout(() => {
    emit('update:open', false)
    blurTimeoutId = null
  }, 200)
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
        <li v-for="option in options" :key="option.value" class="w-full">
          <a class="w-full" @mousedown.prevent="handleSelect(option.value, option)" @click.prevent>
            {{ option.label }}
          </a>
        </li>
      </template>
      <li v-if="!hasResults">
        <a class="text-base-content/50">无匹配结果</a>
      </li>
    </ul>
  </div>
</template>
