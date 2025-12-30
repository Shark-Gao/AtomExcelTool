<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

interface SuffixRule {
  value: string
  baseClass: string
  allowCombination: boolean
}

interface PrefixRule {
  value: string
  baseClass: string
  allowCombination: boolean
}

interface ExactFieldName {
  value: string
  baseClass: string
  allowCombination: boolean
}

interface DefaultRules {
  suffixRules: SuffixRule[]
  prefixRules: PrefixRule[]
  exactFieldNames: ExactFieldName[]
}

interface HeaderRowConfig {
  xlsxFile: string
  sheetName: string
  headerRowNumber: number
  dataStartRow?: number
  descriptionRow?: number
}

interface SpecificFieldName {
  description: string
  sheetName: string
  xlsxFile: string | null
  suffixRules: SuffixRule[]
  prefixRules: PrefixRule[]
  exactFieldNames: ExactFieldName[]
}

interface AtomFieldsConfig {
  description: string
  fileLocation: string
  configRulePriority: string[]
  deploymentNote: string
  headerRowConfig: {
    description: string
    files: HeaderRowConfig[]
  }
  defaultRules: DefaultRules
  SpecificFieldNames: SpecificFieldName[]
}

const props = defineProps<{
  isOpen: boolean
  config: AtomFieldsConfig | null
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  'save': [config: AtomFieldsConfig]
}>()

const editConfig = ref<AtomFieldsConfig | null>(null)
const activeTab = ref<'header' | 'default' | 'specific'>('header')
const selectedSpecificIndex = ref<number>(0)

// 初始化编辑配置
onMounted(() => {
  if (props.config) {
    editConfig.value = JSON.parse(JSON.stringify(props.config))
  }
})

// 监听 props.config 变化
watch(() => props.config, (newConfig) => {
  if (newConfig) {
    editConfig.value = JSON.parse(JSON.stringify(newConfig))
  }
})

function closeModal() {
  emit('update:isOpen', false)
}

// 防止误触：记录鼠标按下位置
const mouseDownOnOverlay = ref(false)

function handleOverlayMouseDown(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    mouseDownOnOverlay.value = true
  }
}

function handleOverlayMouseUp(e: MouseEvent) {
  if (mouseDownOnOverlay.value && e.target === e.currentTarget) {
    closeModal()
  }
  mouseDownOnOverlay.value = false
}

function saveConfig() {
  if (editConfig.value) {
    emit('save', editConfig.value)
    closeModal()
  }
}

// 添加后缀规则
function addDefaultSuffixRule() {
  if (editConfig.value) {
    editConfig.value.defaultRules.suffixRules.push({
      value: '',
      baseClass: '',
      allowCombination: false
    })
  }
}

// 移除后缀规则
function removeDefaultSuffixRule(index: number) {
  if (editConfig.value) {
    editConfig.value.defaultRules.suffixRules.splice(index, 1)
  }
}

// 添加前缀规则
function addDefaultPrefixRule() {
  if (editConfig.value) {
    editConfig.value.defaultRules.prefixRules.push({
      value: '',
      baseClass: '',
      allowCombination: false
    })
  }
}

// 移除前缀规则
function removeDefaultPrefixRule(index: number) {
  if (editConfig.value) {
    editConfig.value.defaultRules.prefixRules.splice(index, 1)
  }
}

// 添加精确字段名
function addDefaultExactFieldName() {
  if (editConfig.value) {
    editConfig.value.defaultRules.exactFieldNames.push({
      value: '',
      baseClass: '',
      allowCombination: false
    })
  }
}

// 移除精确字段名
function removeDefaultExactFieldName(index: number) {
  if (editConfig.value) {
    editConfig.value.defaultRules.exactFieldNames.splice(index, 1)
  }
}

// 添加 Header 配置
function addHeaderRowConfig() {
  if (editConfig.value) {
    editConfig.value.headerRowConfig.files.push({
      xlsxFile: '',
      sheetName: '',
      headerRowNumber: 1,
      dataStartRow: 2,
      descriptionRow: 1
    })
  }
}

// 移除 Header 配置
function removeHeaderRowConfig(index: number) {
  if (editConfig.value) {
    editConfig.value.headerRowConfig.files.splice(index, 1)
  }
}

// 添加特定工作表规则
function addSpecificFieldName() {
  if (editConfig.value) {
    editConfig.value.SpecificFieldNames.push({
      description: '特定工作表的自定义规则',
      sheetName: '',
      xlsxFile: null,
      suffixRules: [],
      prefixRules: [],
      exactFieldNames: []
    })
  }
}

// 移除特定工作表规则
function removeSpecificFieldName(index: number) {
  if (editConfig.value) {
    editConfig.value.SpecificFieldNames.splice(index, 1)
    if (selectedSpecificIndex.value >= editConfig.value.SpecificFieldNames.length) {
      selectedSpecificIndex.value = Math.max(0, editConfig.value.SpecificFieldNames.length - 1)
    }
  }
}

// 在特定规则中添加后缀规则
function addSpecificSuffixRule(specificIndex: number) {
  if (editConfig.value && editConfig.value.SpecificFieldNames[specificIndex]) {
    editConfig.value.SpecificFieldNames[specificIndex].suffixRules.push({
      value: '',
      baseClass: '',
      allowCombination: false
    })
  }
}

// 在特定规则中移除后缀规则
function removeSpecificSuffixRule(specificIndex: number, ruleIndex: number) {
  if (editConfig.value && editConfig.value.SpecificFieldNames[specificIndex]) {
    editConfig.value.SpecificFieldNames[specificIndex].suffixRules.splice(ruleIndex, 1)
  }
}

// 在特定规则中添加前缀规则
function addSpecificPrefixRule(specificIndex: number) {
  if (editConfig.value && editConfig.value.SpecificFieldNames[specificIndex]) {
    editConfig.value.SpecificFieldNames[specificIndex].prefixRules.push({
      value: '',
      baseClass: '',
      allowCombination: false
    })
  }
}

// 在特定规则中移除前缀规则
function removeSpecificPrefixRule(specificIndex: number, ruleIndex: number) {
  if (editConfig.value && editConfig.value.SpecificFieldNames[specificIndex]) {
    editConfig.value.SpecificFieldNames[specificIndex].prefixRules.splice(ruleIndex, 1)
  }
}

// 在特定规则中添加精确字段名
function addSpecificExactFieldName(specificIndex: number) {
  if (editConfig.value && editConfig.value.SpecificFieldNames[specificIndex]) {
    editConfig.value.SpecificFieldNames[specificIndex].exactFieldNames.push({
      value: '',
      baseClass: '',
      allowCombination: false
    })
  }
}

// 在特定规则中移除精确字段名
function removeSpecificExactFieldName(specificIndex: number, fieldIndex: number) {
  if (editConfig.value && editConfig.value.SpecificFieldNames[specificIndex]) {
    editConfig.value.SpecificFieldNames[specificIndex].exactFieldNames.splice(fieldIndex, 1)
  }
}

const currentSpecificRule = computed(() => {
  return editConfig.value?.SpecificFieldNames[selectedSpecificIndex.value] || null
})
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay">
      <div class="modal-container">
        <!-- 标题栏 -->
        <div class="modal-header">
          <h3 class="modal-title">
            <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
            </svg>
            原子字段配置编辑
          </h3>
          <button class="btn btn-sm btn-ghost" @click="closeModal">✕</button>
        </div>

        <!-- 标签页 -->
        <div class="tabs tabs-bordered px-6 pt-4">
          <input
            type="radio"
            name="config-tabs"
            class="tab"
            aria-label="Header 配置"
            :checked="activeTab === 'header'"
            @change="activeTab = 'header'"
          />
          <input
            type="radio"
            name="config-tabs"
            class="tab"
            aria-label="全局规则"
            :checked="activeTab === 'default'"
            @change="activeTab = 'default'"
          />
          <input
            type="radio"
            name="config-tabs"
            class="tab"
            aria-label="特定规则"
            :checked="activeTab === 'specific'"
            @change="activeTab = 'specific'"
          />
        </div>

        <!-- 内容区域 -->
        <div class="overflow-y-auto flex-1 px-6 py-4">
          <!-- Header 配置标签 -->
          <div v-if="activeTab === 'header'" class="space-y-4">
            <div v-if="editConfig" class="space-y-4">
              <div v-for="(file, index) in editConfig.headerRowConfig.files" :key="index" class="card bg-base-200 p-4">
                <div class="space-y-3">
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text">Excel 文件名</span>
                      </label>
                      <input v-model="file.xlsxFile" type="text" class="input input-bordered input-sm w-full" />
                    </div>
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text">工作表名</span>
                      </label>
                      <input v-model="file.sheetName" type="text" class="input input-bordered input-sm w-full" />
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text">列名行</span>
                      </label>
                      <input v-model.number="file.headerRowNumber" type="number" class="input input-bordered input-sm w-full" />
                    </div>
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text">数据开始行</span>
                      </label>
                      <input v-model.number="file.dataStartRow" type="number" class="input input-bordered input-sm w-full" />
                    </div>
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text">描述行</span>
                      </label>
                      <input v-model.number="file.descriptionRow" type="number" class="input input-bordered input-sm w-full" />
                    </div>
                  </div>
                  <button class="btn btn-sm btn-error btn-outline w-full" @click="removeHeaderRowConfig(index)">
                    移除此配置
                  </button>
                </div>
              </div>
              <button class="btn btn-sm btn-primary" @click="addHeaderRowConfig">+ 添加 Header 配置</button>
            </div>
          </div>

          <!-- 全局规则标签 -->
          <div v-if="activeTab === 'default' && editConfig" class="space-y-6">
            <!-- 后缀规则 -->
            <div class="space-y-3">
              <h4 class="font-semibold">后缀规则</h4>
              <div v-for="(rule, index) in editConfig.defaultRules.suffixRules" :key="`suffix-${index}`" class="card bg-base-200 p-3">
                <div class="space-y-2">
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text text-xs">后缀值</span>
                      </label>
                      <input v-model="rule.value" type="text" placeholder=".Condition" class="input input-bordered input-sm w-full" />
                    </div>
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text text-xs">基类</span>
                      </label>
                      <input v-model="rule.baseClass" type="text" placeholder="BoolValueDelegate" class="input input-bordered input-sm w-full" />
                    </div>
                  </div>
                  <label class="label cursor-pointer justify-start gap-2">
                    <input v-model="rule.allowCombination" type="checkbox" class="checkbox checkbox-sm" />
                    <span class="label-text text-xs">允许组合</span>
                  </label>
                  <button class="btn btn-xs btn-error btn-outline w-full" @click="removeDefaultSuffixRule(index)">移除</button>
                </div>
              </div>
              <button class="btn btn-xs btn-primary" @click="addDefaultSuffixRule">+ 添加后缀规则</button>
            </div>

            <!-- 前缀规则 -->
            <div class="space-y-3">
              <h4 class="font-semibold">前缀规则</h4>
              <div v-for="(rule, index) in editConfig.defaultRules.prefixRules" :key="`prefix-${index}`" class="card bg-base-200 p-3">
                <div class="space-y-2">
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text text-xs">前缀值</span>
                      </label>
                      <input v-model="rule.value" type="text" placeholder="Prefix_" class="input input-bordered input-sm w-full" />
                    </div>
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text text-xs">基类</span>
                      </label>
                      <input v-model="rule.baseClass" type="text" class="input input-bordered input-sm w-full" />
                    </div>
                  </div>
                  <label class="label cursor-pointer justify-start gap-2">
                    <input v-model="rule.allowCombination" type="checkbox" class="checkbox checkbox-sm" />
                    <span class="label-text text-xs">允许组合</span>
                  </label>
                  <button class="btn btn-xs btn-error btn-outline w-full" @click="removeDefaultPrefixRule(index)">移除</button>
                </div>
              </div>
              <button class="btn btn-xs btn-primary" @click="addDefaultPrefixRule">+ 添加前缀规则</button>
            </div>

            <!-- 精确字段名 -->
            <div class="space-y-3">
              <h4 class="font-semibold">精确字段名</h4>
              <div v-for="(field, index) in editConfig.defaultRules.exactFieldNames" :key="`exact-${index}`" class="card bg-base-200 p-3">
                <div class="space-y-2">
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text text-xs">字段名</span>
                      </label>
                      <input v-model="field.value" type="text" placeholder="FieldName" class="input input-bordered input-sm w-full" />
                    </div>
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text text-xs">基类</span>
                      </label>
                      <input v-model="field.baseClass" type="text" class="input input-bordered input-sm w-full" />
                    </div>
                  </div>
                  <label class="label cursor-pointer justify-start gap-2">
                    <input v-model="field.allowCombination" type="checkbox" class="checkbox checkbox-sm" />
                    <span class="label-text text-xs">允许组合</span>
                  </label>
                  <button class="btn btn-xs btn-error btn-outline w-full" @click="removeDefaultExactFieldName(index)">移除</button>
                </div>
              </div>
              <button class="btn btn-xs btn-primary" @click="addDefaultExactFieldName">+ 添加精确字段名</button>
            </div>
          </div>

          <!-- 特定规则标签 -->
          <div v-if="activeTab === 'specific' && editConfig" class="space-y-4">
            <div class="flex gap-2 mb-4">
              <select v-model.number="selectedSpecificIndex" class="select select-bordered select-sm flex-1">
                <option v-for="(rule, index) in editConfig.SpecificFieldNames" :key="index" :value="index">
                  {{ rule.sheetName }} ({{ rule.xlsxFile || '全局' }})
                </option>
              </select>
              <button class="btn btn-sm btn-primary" @click="addSpecificFieldName">+ 新增</button>
            </div>

            <template v-if="currentSpecificRule">
              <div class="card bg-base-200 p-4">
                <div class="space-y-3">
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text">工作表名</span>
                      </label>
                      <input v-model="currentSpecificRule.sheetName" type="text" class="input input-bordered input-sm w-full" />
                    </div>
                    <div class="flex-1">
                      <label class="label">
                        <span class="label-text">Excel 文件名</span>
                      </label>
                      <input v-model="currentSpecificRule.xlsxFile" type="text" class="input input-bordered input-sm w-full" placeholder="留空表示全局" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- 特定规则的后缀规则 -->
              <div class="space-y-2">
                <h5 class="font-semibold text-sm">后缀规则</h5>
                <div v-for="(rule, index) in currentSpecificRule.suffixRules" :key="`spec-suffix-${index}`" class="card bg-base-200 p-3">
                  <div class="space-y-2">
                    <div class="flex gap-2">
                      <div class="flex-1">
                        <label class="label">
                          <span class="label-text text-xs">后缀值</span>
                        </label>
                        <input v-model="rule.value" type="text" placeholder=".Condition" class="input input-bordered input-sm w-full" />
                      </div>
                      <div class="flex-1">
                        <label class="label">
                          <span class="label-text text-xs">基类</span>
                        </label>
                        <input v-model="rule.baseClass" type="text" class="input input-bordered input-sm w-full" />
                      </div>
                    </div>
                    <label class="label cursor-pointer justify-start gap-2">
                      <input v-model="rule.allowCombination" type="checkbox" class="checkbox checkbox-sm" />
                      <span class="label-text text-xs">允许组合</span>
                    </label>
                    <button class="btn btn-xs btn-error btn-outline w-full" @click="removeSpecificSuffixRule(selectedSpecificIndex, index)">移除</button>
                  </div>
                </div>
                <button class="btn btn-xs btn-primary" @click="addSpecificSuffixRule(selectedSpecificIndex)">+ 添加后缀规则</button>
              </div>

              <!-- 特定规则的前缀规则 -->
              <div class="space-y-2">
                <h5 class="font-semibold text-sm">前缀规则</h5>
                <div v-for="(rule, index) in currentSpecificRule.prefixRules" :key="`spec-prefix-${index}`" class="card bg-base-200 p-3">
                  <div class="space-y-2">
                    <div class="flex gap-2">
                      <div class="flex-1">
                        <label class="label">
                          <span class="label-text text-xs">前缀值</span>
                        </label>
                        <input v-model="rule.value" type="text" class="input input-bordered input-sm w-full" />
                      </div>
                      <div class="flex-1">
                        <label class="label">
                          <span class="label-text text-xs">基类</span>
                        </label>
                        <input v-model="rule.baseClass" type="text" class="input input-bordered input-sm w-full" />
                      </div>
                    </div>
                    <label class="label cursor-pointer justify-start gap-2">
                      <input v-model="rule.allowCombination" type="checkbox" class="checkbox checkbox-sm" />
                      <span class="label-text text-xs">允许组合</span>
                    </label>
                    <button class="btn btn-xs btn-error btn-outline w-full" @click="removeSpecificPrefixRule(selectedSpecificIndex, index)">移除</button>
                  </div>
                </div>
                <button class="btn btn-xs btn-primary" @click="addSpecificPrefixRule(selectedSpecificIndex)">+ 添加前缀规则</button>
              </div>

              <!-- 特定规则的精确字段名 -->
              <div class="space-y-2">
                <h5 class="font-semibold text-sm">精确字段名</h5>
                <div v-for="(field, index) in currentSpecificRule.exactFieldNames" :key="`spec-exact-${index}`" class="card bg-base-200 p-3">
                  <div class="space-y-2">
                    <div class="flex gap-2">
                      <div class="flex-1">
                        <label class="label">
                          <span class="label-text text-xs">字段名</span>
                        </label>
                        <input v-model="field.value" type="text" class="input input-bordered input-sm w-full" />
                      </div>
                      <div class="flex-1">
                        <label class="label">
                          <span class="label-text text-xs">基类</span>
                        </label>
                        <input v-model="field.baseClass" type="text" class="input input-bordered input-sm w-full" />
                      </div>
                    </div>
                    <label class="label cursor-pointer justify-start gap-2">
                      <input v-model="field.allowCombination" type="checkbox" class="checkbox checkbox-sm" />
                      <span class="label-text text-xs">允许组合</span>
                    </label>
                    <button class="btn btn-xs btn-error btn-outline w-full" @click="removeSpecificExactFieldName(selectedSpecificIndex, index)">移除</button>
                  </div>
                </div>
                <button class="btn btn-xs btn-primary" @click="addSpecificExactFieldName(selectedSpecificIndex)">+ 添加精确字段名</button>
              </div>

              <button class="btn btn-sm btn-error btn-outline w-full" @click="removeSpecificFieldName(selectedSpecificIndex)">
                删除此工作表规则
              </button>
            </template>
          </div>
        </div>

        <!-- 页脚按钮 -->
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveConfig">保存配置</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  animation: overlay-fade-in 0.2s ease;
}

@keyframes overlay-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-container {
  display: flex;
  flex-direction: column;
  background: var(--fallback-b1, oklch(var(--b1)));
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: modal-scale-in 0.2s ease;
  width: 90vw;
  height: 90vh;
  max-width: 1000px;
}

@keyframes modal-scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--fallback-b2, oklch(var(--b2)));
  border-bottom: 1px solid var(--fallback-bc, oklch(var(--bc) / 0.1));
  flex-shrink: 0;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--fallback-bc, oklch(var(--bc)));
}

.title-icon {
  width: 24px;
  height: 24px;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  background: var(--fallback-b2, oklch(var(--b2)));
  border-top: 1px solid var(--fallback-bc, oklch(var(--bc) / 0.1));
  flex-shrink: 0;
}
</style>
