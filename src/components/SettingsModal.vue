<script setup lang="ts">
import { ref } from 'vue'
import changelogData from '../../config/changelog.json'

export type FieldOption = {
  label: string
  value: string
}

interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

const props = defineProps<{
  isOpen: boolean
  currentTheme: string
  showOnlyAtomicFields: boolean
  isDebugMode: boolean
  themeOptions: FieldOption[]
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  'update:currentTheme': [value: string]
  'update:showOnlyAtomicFields': [value: boolean]
  'update:isDebugMode': [value: boolean]
}>()

const activeTab = ref<'settings' | 'changelog'>('settings')
const changelog = ref<ChangelogEntry[]>(changelogData.changelog || [])
const changelogError = ref<string | null>(null)

function closeModal() {
  emit('update:isOpen', false)
}

function handleThemeChange(newTheme: string) {
  emit('update:currentTheme', newTheme)
}

function handleAtomicFieldsToggle(value: boolean) {
  emit('update:showOnlyAtomicFields', value)
}

function handleDebugModeToggle(value: boolean) {
  emit('update:isDebugMode', value)
}
</script>

<template>
  <div v-if="isOpen" class="modal modal-open">
    <div class="modal-box w-full max-w-2xl max-h-[80vh] flex flex-col">
      <h3 class="font-bold text-lg mb-4">设置</h3>
      
      <!-- 页签切换 -->
      <div class="tabs tabs-bordered mb-4">
        <button
          class="tab"
          :class="{ 'tab-active': activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          基本设置
        </button>
        <button
          class="tab"
          :class="{ 'tab-active': activeTab === 'changelog' }"
          @click="activeTab = 'changelog'"
        >
          更新日志
        </button>
      </div>

      <!-- 内容区域 -->
      <div class="flex-1 overflow-y-auto">
      <div v-if="activeTab === 'settings'" class="space-y-6">
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

        <!-- 调试模式开关 -->
        <div class="form-control">
          <label class="label cursor-pointer">
            <span class="label-text font-semibold">调试模式</span>
            <input
              type="checkbox"
              class="toggle toggle-secondary"
              :checked="isDebugMode"
              @change="(event) => handleDebugModeToggle((event.target as HTMLInputElement).checked)"
            />
          </label>
          <p class="text-xs text-base-content/60 mt-2">启用后，显示解析后的 JSON 结构</p>
        </div>
      </div>
      </div>

      <!-- 更新日志标签页 -->
      <div v-if="activeTab === 'changelog'" class="space-y-4">
        <div v-if="changelogError" class="alert alert-error">
          <span>{{ changelogError }}</span>
        </div>
        <div v-else class="space-y-4">
          <div v-for="(entry, index) in changelog" :key="index" class="card bg-base-200">
            <div class="card-body p-4">
              <div class="flex items-center gap-3 mb-2">
                <!-- <h4 class="card-title text-base">v{{ entry.version }}</h4> -->
                <h4 class="card-title text-base">{{ entry.date }}</h4>
                
              </div>
              <ul class="text-sm space-y-1">
                <li v-for="(change, changeIndex) in entry.changes" :key="changeIndex" class="text-base-content/80">
                  {{ change }}
                </li>
              </ul>
            </div>
          </div>
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
