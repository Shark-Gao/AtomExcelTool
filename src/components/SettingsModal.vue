<script setup lang="ts">
import { ref } from 'vue'
import LogViewer from './LogViewer.vue'
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
  fieldLayoutDirection: 'horizontal' | 'vertical'
  themeOptions: FieldOption[]
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  'update:currentTheme': [value: string]
  'update:showOnlyAtomicFields': [value: boolean]
  'update:isDebugMode': [value: boolean]
  'update:fieldLayoutDirection': [value: 'horizontal' | 'vertical']
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

function handleFieldLayoutDirectionChange(direction: 'horizontal' | 'vertical') {
  emit('update:fieldLayoutDirection', direction)
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
      <div v-if="activeTab === 'settings'" class="space-y-4">
        <!-- 外观设置分组 -->
        <div class="card bg-base-200">
          <div class="card-body p-4 space-y-4">
            <h3 class="card-title text-sm">外观设置</h3>
            
            <!-- 主题设置 -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold text-sm">主题</span>
              </label>
              <select
                :value="currentTheme"
                class="select select-bordered select-sm w-full"
                @change="(event) => handleThemeChange((event.target as HTMLSelectElement).value)"
              >
                <option v-for="option in themeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- 显示设置分组 -->
        <div class="card bg-base-200">
          <div class="card-body p-4 space-y-4">
            <h3 class="card-title text-sm">显示设置</h3>
            
            <!-- 只显示原子端开关 -->
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text font-semibold text-sm">只显示原子字段</span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-sm"
                  :checked="showOnlyAtomicFields"
                  @change="(event) => handleAtomicFieldsToggle((event.target as HTMLInputElement).checked)"
                />
              </label>
              <p class="text-xs text-base-content/60 mt-1">启用后，只显示原子类型字段</p>
            </div>

            <!-- 字段排列方向 -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold text-sm">Excel 字段排列</span>
              </label>
              <div class="flex gap-4">
                <label class="label cursor-pointer gap-2 px-3 py-1 rounded" :class="fieldLayoutDirection === 'horizontal' ? 'bg-primary/10' : ''">
                  <input
                    type="radio"
                    name="field-layout"
                    class="radio radio-sm radio-primary"
                    :checked="fieldLayoutDirection === 'horizontal'"
                    @change="handleFieldLayoutDirectionChange('horizontal')"
                  />
                  <span class="label-text text-sm">横向</span>
                </label>
                <label class="label cursor-pointer gap-2 px-3 py-1 rounded" :class="fieldLayoutDirection === 'vertical' ? 'bg-primary/10' : ''">
                  <input
                    type="radio"
                    name="field-layout"
                    class="radio radio-sm radio-primary"
                    :checked="fieldLayoutDirection === 'vertical'"
                    @change="handleFieldLayoutDirectionChange('vertical')"
                  />
                  <span class="label-text text-sm">竖向</span>
                </label>
              </div>
              <p class="text-xs text-base-content/60 mt-1">选择字段排列方向</p>
            </div>
          </div>
        </div>

        <!-- 开发者工具分组 -->
        <div class="card bg-base-200">
          <div class="card-body p-4 space-y-4">
            <h3 class="card-title text-sm">开发者工具</h3>
            
            <!-- 调试模式开关 -->
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text font-semibold text-sm">调试模式</span>
                <input
                  type="checkbox"
                  class="toggle toggle-secondary toggle-sm"
                  :checked="isDebugMode"
                  @change="(event) => handleDebugModeToggle((event.target as HTMLInputElement).checked)"
                />
              </label>
              <p class="text-xs text-base-content/60 mt-1">启用后，显示解析后的 JSON 结构</p>
            </div>

            <!-- 日志查看 -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold text-sm">应用日志</span>
              </label>
              <p class="text-xs text-base-content/60 mb-2">查看和管理应用日志文件</p>
              <div class="flex gap-2">
                <LogViewer />
              </div>
            </div>
          </div>
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
