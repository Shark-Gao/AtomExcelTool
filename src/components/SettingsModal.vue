<script setup lang="ts">
import { ref } from 'vue'

export type FieldOption = {
  label: string
  value: string
}

const props = defineProps<{
  isOpen: boolean
  currentTheme: string
  showOnlyAtomicFields: boolean
  themeOptions: FieldOption[]
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  'update:currentTheme': [value: string]
  'update:showOnlyAtomicFields': [value: boolean]
}>()

function closeModal() {
  emit('update:isOpen', false)
}

function handleThemeChange(newTheme: string) {
  emit('update:currentTheme', newTheme)
}

function handleAtomicFieldsToggle(value: boolean) {
  emit('update:showOnlyAtomicFields', value)
}
</script>

<template>
  <div v-if="isOpen" class="modal modal-open">
    <div class="modal-box w-full max-w-md">
      <h3 class="font-bold text-lg mb-4">设置</h3>
      
      <div class="space-y-6">
        <!-- 主题设置 -->
        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">主题</span>
          </label>
          <select
            :value="currentTheme"
            class="select select-bordered w-full"
            @change="(event) => handleThemeChange((event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in themeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <!-- 只显示原子端开关 -->
        <div class="form-control">
          <label class="label cursor-pointer">
            <span class="label-text font-semibold">只显示原子字段</span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              :checked="showOnlyAtomicFields"
              @change="(event) => handleAtomicFieldsToggle((event.target as HTMLInputElement).checked)"
            />
          </label>
          <p class="text-xs text-base-content/60 mt-2">启用后，只显示原子类型字段，隐藏普通文本字段</p>
        </div>
      </div>

      <div class="modal-action mt-6">
        <button class="btn btn-primary" @click="closeModal">关闭</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @submit.prevent="closeModal">
      <button type="button" @click="closeModal">close</button>
    </form>
  </div>
</template>
