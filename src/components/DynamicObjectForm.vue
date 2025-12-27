<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, watchEffect } from 'vue'
import { normalizeClassInstance as normalizeClassInstanceUtil } from '../utils/ClassNormalizer'
import { ClassRegistry, FieldMeta, BaseClassNativeType, isBaseClassNative, BaseClassType, resolveFieldMetaTypeByValue, fieldMetaSupportsType, getFieldMetaTypeList } from '../types/MetaDefine'
import SearchableAtomSelect from './SearchableAtomSelect.vue'
import { ue } from '../electron/main/UETypes'

export type FieldType = 'string' | 'number' | 'boolean' | 'select' | 'object' | 'array'

export type FieldOption = {
  label: string
  value: string
  funcName?: string
}

// export type FieldMeta =
//   | {
//       label: string
//       type: Exclude<FieldType, 'object' | 'array'>
//       options?: FieldOption[]
//     }
//   | {
//       label: string
//       type: 'object'
//       baseClass: string
//     }
//   | {
//       label: string
//       type: 'array'
//       baseClass?: string
//       elementType?: 'string' | 'number' | 'boolean' | 'object'
//     }

// export type ClassInfo = {
//   displayName: string
//   baseClass: string
//   fields: Record<string, FieldMeta>
// }

const props = withDefaults(
  defineProps<{
    className: string
    registry: ClassRegistry
    modelValue: Record<string, unknown>
    subclassOptions: Record<string, FieldOption[]>
    readonly?: boolean
    isRoot?: boolean
  }>(),
  {
    readonly: false,
    isRoot: true
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const localValue = reactive<Record<string, unknown>>({})
const isHydrating = ref(false)
const isUpdatingFromParent = ref(false)

const classInfo = computed(() => {
  // 如果 className 为空，直接返回 undefined
  if (!props.className || typeof props.className !== 'string') {
    return undefined
  }
  
  const info = props.registry[props.className]
  if (!info) {
    console.warn(`[DynamicObjectForm] classInfo not found for className: "${props.className}"`, {
      className: props.className,
      registryKeys: Object.keys(props.registry),
      registrySize: Object.keys(props.registry).length
    })
  }
  return info
})
const fields = computed(() => classInfo.value?.fields ?? {})
const rootSubclassOptions = computed<FieldOption[]>(() => {
  const info = classInfo.value
  if (!info) {
    return []
  }
  return getSubclassOptions(info.baseClass)
})
const rootClassName = computed(() => {
  const classNameCandidate = localValue._ClassName
  if (typeof classNameCandidate === 'string' && classNameCandidate.trim().length > 0) {
    return classNameCandidate
  }
  return props.className
})

async function updateRootClass(newClassName: string) {
  if (!newClassName) {
    return
  }
  const normalized = normalizeClassInstance(newClassName, localValue)

  isHydrating.value = true
  setLocalValue(normalized)
  
  emit(
    'update:modelValue',
    JSON.parse(JSON.stringify(localValue)) as Record<string, unknown>
  )

  await nextTick()
  isHydrating.value = false
}

function getArrayItems(fieldKey: string): any[] {
  const value = localValue[fieldKey]
  if (!Array.isArray(value)) {
    return []
  }
  return value as any[]
}

function getArrayElementType(fieldMeta: FieldMeta): 'string' | 'number' | 'boolean' | 'object' | BaseClassType {
  if (!supportsFieldType(fieldMeta, 'array')) {
    return 'string'
  }
  if (!fieldMeta.baseClass) {
    return 'string'
  }

  // 检查 baseClass 是否为基础类型
  if (isBaseClassNative(fieldMeta.baseClass)) {
    return fieldMeta.baseClass
  }
  
  return 'object'
}

const isRootCollapsed = ref(true)

function toggleRootSection() {
  isRootCollapsed.value = !isRootCollapsed.value
}

const expandedSections = reactive<Record<string, boolean>>({})

function getActiveFieldType(fieldKey: string, fieldMeta: FieldMeta): FieldType {
  return resolveFieldMetaTypeByValue(fieldMeta, localValue[fieldKey])
}

function isFieldTypeActive(fieldKey: string, fieldMeta: FieldMeta, targetType: FieldType): boolean {
  return getActiveFieldType(fieldKey, fieldMeta) === targetType
}

function supportsFieldType(fieldMeta: FieldMeta, targetType: FieldType): boolean {
  return fieldMetaSupportsType(fieldMeta, targetType)
}

function ensureSectionState(fieldKey: string, defaultExpanded = true) {
  if (!(fieldKey in expandedSections)) {
    expandedSections[fieldKey] = defaultExpanded
  }
}

function isSectionExpanded(fieldKey: string): boolean {
  ensureSectionState(fieldKey)
  return expandedSections[fieldKey]
}

function toggleSection(fieldKey: string) {
  ensureSectionState(fieldKey)
  expandedSections[fieldKey] = !expandedSections[fieldKey]
}

function getSubclassOptions(baseClass: string | undefined): FieldOption[] {
  if (!baseClass) {
    return []
  }
  return props.subclassOptions[baseClass] ?? []
}

function hasFieldsForClass(className: string | undefined): boolean {
  if (!className) {
    return false
  }
  const info = props.registry[className]
  if (!info) {
    return false
  }
  return Object.keys(info.fields).length > 0
}

// 内部便捷函数，直接使用当前组件的 props
function normalizeClassInstance(className: string, raw: Record<string, unknown>): Record<string, unknown> {
  return normalizeClassInstanceUtil(className, raw, props.registry, props.subclassOptions)
}

function setLocalValue(value: Record<string, unknown>) {
  Object.keys(localValue).forEach((key) => delete localValue[key])
  Object.entries(value).forEach(([key, val]) => {
    localValue[key] = val
  })
}

function ensureLocalValue() {
  isHydrating.value = true
  const source = (props.modelValue ?? {}) as Record<string, unknown>
  const normalized = normalizeClassInstance(props.className, source)
  setLocalValue(normalized)
  isHydrating.value = false
}

ensureLocalValue()

// 监听 modelValue 变化，重新执行规范化
watch(
  () => props.modelValue,
  async () => {
    if (!isHydrating.value) {
      isUpdatingFromParent.value = true
      ensureLocalValue()
      await nextTick()
      isUpdatingFromParent.value = false
    }
  },
  { deep: true }
)

watch(
  localValue,
  () => {
    if (isHydrating.value || isUpdatingFromParent.value) {
      return
    }
    emit(
      'update:modelValue',
      JSON.parse(JSON.stringify(localValue)) as Record<string, unknown>
    )
  },
  { deep: true }
)

function updateArrayItemValue(fieldKey: string, index: number, value: Record<string, unknown>) {
  if (!Array.isArray(localValue[fieldKey])) {
    return
  }
  const list = [...(localValue[fieldKey] as Record<string, unknown>[])]
  list[index] = value
  localValue[fieldKey] = list
}

function removeArrayItem(fieldKey: string, index: number) {
  if (!Array.isArray(localValue[fieldKey])) {
    return
  }
  const list = [...(localValue[fieldKey] as unknown[])]
  list.splice(index, 1)
  localValue[fieldKey] = list
}

function addArrayItem(fieldKey: string, fieldMeta: FieldMeta) {
  if (!supportsFieldType(fieldMeta, 'array')) {
    return
  }
  const list = Array.isArray(localValue[fieldKey]) ? (localValue[fieldKey] as any[]) : []
  
  // 判断是否为对象数组
  const elementType = getArrayElementType(fieldMeta)
  if (elementType == 'object') {
    const options = getSubclassOptions(fieldMeta.baseClass)
    const defaultClassName = options[0]?.value ?? fieldMeta.baseClass
    const newItem = normalizeClassInstance(defaultClassName, {})
    localValue[fieldKey] = [...list, newItem]
  } else {
    // 基础类型数组，添加默认值
    let defaultValue: any
    switch (elementType) {
      case 'number':
        defaultValue = 0
        break
      case 'boolean':
        defaultValue = false
        break
      case 'string':
      default:
        defaultValue = ''
    }
    localValue[fieldKey] = [...list, defaultValue]
  }
}

async function updateArrayItemClass(
  fieldKey: string,
  fieldMeta: FieldMeta,
  index: number,
  newClassName: string
) {
  if (!supportsFieldType(fieldMeta, 'array')) {
    return
  }
  if (!Array.isArray(localValue[fieldKey])) {
    return
  }

  const options = getSubclassOptions(fieldMeta.baseClass)
  const fallbackClassName = options[0]?.value ?? fieldMeta.baseClass
  const resolvedClassName = options.some((option) => option.value === newClassName)
    ? newClassName
    : fallbackClassName

  const list = [...(localValue[fieldKey] as Record<string, unknown>[])]
  const rawItem = list[index]
  const normalizedItem = normalizeClassInstance(
    resolvedClassName,
    typeof rawItem === 'object' && rawItem !== null ? (rawItem as Record<string, unknown>) : {}
  )

  isHydrating.value = true
  list[index] = normalizedItem
  localValue[fieldKey] = list
  emit(
    'update:modelValue',
    JSON.parse(JSON.stringify(localValue)) as Record<string, unknown>
  )

  await nextTick()
  isHydrating.value = false
}

const operatorFieldKey = 'operator' as const

const operatorFieldOptionsMap: Record<string, Array<{ label: string; value: number }>> = {
  BoolValueBinaryOperatorOnBoolDelegate: [
    { label: '逻辑与（AND）', value: ue.EMHBoolTriggerValueBinaryOperatorOnBool.LogicalAnd },
    { label: '逻辑或（OR）', value: ue.EMHBoolTriggerValueBinaryOperatorOnBool.LogicalOr },
  ],
  BoolValueBinaryOperatorOnNumberDelegate: [
    { label: '等于（=）', value: ue.EMHBoolTriggerValueBinaryOperatorOnNumber.EqualTo },
    { label: '大于（>）', value: ue.EMHBoolTriggerValueBinaryOperatorOnNumber.Greater },
    { label: '大于等于（≥）', value: ue.EMHBoolTriggerValueBinaryOperatorOnNumber.GreaterEqual },
    { label: '小于（<）', value: ue.EMHBoolTriggerValueBinaryOperatorOnNumber.Less },
    { label: '小于等于（≤）', value: ue.EMHBoolTriggerValueBinaryOperatorOnNumber.LessEqual },
    { label: '不等于（≠）', value: ue.EMHBoolTriggerValueBinaryOperatorOnNumber.NotEqualTo },
  ],
  NumberValueBinaryOperatorDelegate: [
    { label: '加法（+）', value: ue.EMHNumberTriggerValueBinaryOperator.Plus },
    { label: '减法（-）', value: ue.EMHNumberTriggerValueBinaryOperator.Minus },
    { label: '乘法（×）', value: ue.EMHNumberTriggerValueBinaryOperator.Multiplies },
    { label: '除法（÷）', value: ue.EMHNumberTriggerValueBinaryOperator.Divides },
    { label: '取模（%）', value: ue.EMHNumberTriggerValueBinaryOperator.Modulus },
    { label: '最小值（Min）', value: ue.EMHNumberTriggerValueBinaryOperator.Min },
    { label: '最大值（Max）', value: ue.EMHNumberTriggerValueBinaryOperator.Max },
  ],
}

const operatorDropdownOptions = computed(() => {
  const activeClassName = rootClassName.value ?? props.className
  if (typeof activeClassName !== 'string') {
    return []
  }
  return operatorFieldOptionsMap[activeClassName] ?? []
})

function shouldUseOperatorDropdown(fieldKey: string): boolean {
  return fieldKey === operatorFieldKey && operatorDropdownOptions.value.length > 0
}

watchEffect(() => {
  if (!shouldUseOperatorDropdown(operatorFieldKey)) {
    return
  }
  const rawValue = localValue[operatorFieldKey]
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    const numericValue = Number(rawValue)
    if (!Number.isNaN(numericValue)) {
      localValue[operatorFieldKey] = numericValue
    }
  }
})

</script>

<template>
  <div v-if="classInfo" class="detail-panel">
    <div class="rounded border border-base-300 bg-base-100">
      <!-- 头部：类型选择器（仅根节点显示） -->
      <div v-if="props.isRoot" class="flex items-center gap-2 border-b border-base-200 px-2 py-1.5 bg-base-200/50">
        <button
          type="button"
          class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5"
          aria-label="切换属性面板"
          @click="toggleRootSection"
        >
          <span class="text-[10px] transition-transform" :class="{ 'rotate-90': !isRootCollapsed }">▶</span>
        </button>
        <SearchableAtomSelect
          v-if="rootSubclassOptions.length && !readonly"
          :model-value="rootClassName ?? ''"
          :options="rootSubclassOptions"
          :registry="registry"
          empty-label="请选择类型"
          allow-empty
          :disabled="readonly"
          class="flex-1 text-xs"
          @update:model-value="(value) => updateRootClass(value)"
        />
        <span v-else class="text-xs font-medium text-base-content/80">{{ classInfo.displayName }}</span>
      </div>

      <!-- 属性列表 -->
      <Transition name="fade" mode="out-in">
        <div v-show="!props.isRoot || !isRootCollapsed" class="divide-y divide-base-200">
          <div
            v-for="(fieldMeta, fieldKey, index) in fields"
            :key="fieldKey"
            class="property-row"
            :class="index % 2 === 0 ? 'bg-base-100' : 'bg-base-200/20'"
          >
            <!-- 简单类型：单行布局 -->
            <template v-if="isFieldTypeActive(fieldKey, fieldMeta, 'string') || 
                          isFieldTypeActive(fieldKey, fieldMeta, 'number') || 
                          isFieldTypeActive(fieldKey, fieldMeta, 'boolean') || 
                          isFieldTypeActive(fieldKey, fieldMeta, 'select') ||
                          shouldUseOperatorDropdown(fieldKey)">
              <div class="flex items-center gap-2 px-2 py-1 min-h-[28px]">
                <label class="property-label w-[120px] shrink-0 text-xs text-base-content/70 truncate" :title="fieldMeta.label">
                  {{ fieldMeta.label }}
                </label>
                <div class="flex-1 min-w-0">
                  <!-- 操作符下拉 -->
                  <select 
                    v-if="shouldUseOperatorDropdown(fieldKey)"
                    v-model.number="localValue[fieldKey]" 
                    class="select select-bordered select-xs w-full h-6 min-h-0" 
                    :disabled="readonly"
                  >
                    <option v-for="option in operatorDropdownOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                  <!-- 字符串 -->
                  <input 
                    v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'string')"
                    v-model="localValue[fieldKey]" 
                    type="text" 
                    class="input input-bordered input-xs w-full h-6" 
                    :disabled="readonly" 
                  />
                  <!-- 数字 -->
                  <input 
                    v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'number')"
                    v-model.number="localValue[fieldKey]" 
                    type="number" 
                    class="input input-bordered input-xs w-full h-6" 
                    :disabled="readonly" 
                  />
                  <!-- 布尔 -->
                  <input 
                    v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'boolean')"
                    v-model="localValue[fieldKey]" 
                    type="checkbox" 
                    class="toggle toggle-primary toggle-xs" 
                    :disabled="readonly" 
                  />
                  <!-- 选择 -->
                  <select 
                    v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'select')"
                    v-model="localValue[fieldKey]" 
                    class="select select-bordered select-xs w-full h-6 min-h-0" 
                    :disabled="readonly"
                  >
                    <option v-for="option in fieldMeta.options" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
              </div>
            </template>

            <!-- 对象类型 -->
            <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'object')">
              <div class="flex items-center gap-2 px-2 py-1 min-h-[28px]">
                <div class="w-[120px] shrink-0 flex items-center gap-1">
                  <button
                    v-if="hasFieldsForClass((localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName as string)"
                    type="button"
                    class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5"
                    @click="toggleSection(fieldKey)"
                  >
                    <span class="text-[10px] transition-transform" :class="{ 'rotate-90': isSectionExpanded(fieldKey) }">▶</span>
                  </button>
                  <span v-else class="w-5 shrink-0"></span>
                  <span class="text-xs text-base-content/70 truncate" :title="fieldMeta.label">{{ fieldMeta.label }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <SearchableAtomSelect
                    v-if="getSubclassOptions(fieldMeta.baseClass).length && !readonly"
                    :model-value="(localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName ?? ''"
                    :options="getSubclassOptions(fieldMeta.baseClass)"
                    :registry="registry"
                    empty-label="请选择类型"
                    allow-empty
                    :disabled="readonly"
                    class="w-full text-xs"
                    @update:model-value="(value) => {
                      if (value) {
                        const normalized = normalizeClassInstance(value, (localValue[fieldKey] as Record<string, unknown>) ?? {})
                        localValue[fieldKey] = normalized
                      } else {
                        localValue[fieldKey] = { _ClassName: '' }
                      }
                    }"
                  />
                  <span v-else class="text-xs text-base-content/50">
                    {{ (localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName || '—' }}
                  </span>
                </div>
              </div>
              <Transition name="fade" mode="out-in">
                <div
                  v-show="isSectionExpanded(fieldKey) && hasFieldsForClass((localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName as string)"
                  class="ml-6 border-l-2 border-base-300 pl-2"
                >
                  <DynamicObjectForm
                    v-if="(localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName"
                    :key="`${fieldKey}-${(localValue[fieldKey] as Record<string, unknown>)._ClassName as string}`"
                    :class-name="(localValue[fieldKey] as Record<string, unknown>)._ClassName as string"
                    :registry="registry"
                    :subclass-options="subclassOptions"
                    :model-value="localValue[fieldKey] as Record<string, unknown>"
                    :readonly="readonly"
                    :is-root="false"
                    @update:model-value="(value) => { localValue[fieldKey] = value; }"
                  />
                </div>
              </Transition>
            </template>

            <!-- 数组类型 -->
            <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'array')">
              <div class="flex items-center gap-2 px-2 py-1 min-h-[28px]">
                <div class="w-[120px] shrink-0 flex items-center gap-1">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5"
                    @click="toggleSection(fieldKey)"
                  >
                    <span class="text-[10px] transition-transform" :class="{ 'rotate-90': isSectionExpanded(fieldKey) }">▶</span>
                  </button>
                  <span class="text-xs text-base-content/70 truncate" :title="fieldMeta.label">{{ fieldMeta.label }}</span>
                </div>
                <div class="flex-1 min-w-0 flex items-center gap-2">
                  <span class="text-xs text-base-content/50">[{{ getArrayItems(fieldKey).length }}]</span>
                  <button
                    v-if="!readonly"
                    type="button"
                    class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-primary"
                    @click="addArrayItem(fieldKey, fieldMeta)"
                    title="新增项"
                  >
                    +
                  </button>
                </div>
              </div>
              <Transition name="fade" mode="out-in">
                <div v-show="isSectionExpanded(fieldKey)" class="ml-6 space-y-0 border-l-2 border-base-300 pl-2">
                  <div
                    v-for="(item, index) in getArrayItems(fieldKey)"
                    :key="`${fieldKey}-${index}`"
                    class="relative group"
                  >
                    <!-- 对象元素 -->
                    <template v-if="typeof item === 'object'">
                      <div class="flex items-start">
                        <DynamicObjectForm
                          v-if="(item as Record<string, unknown>)._ClassName"
                          :key="`${fieldKey}-array-${index}-${(item as Record<string, unknown>)._ClassName as string}`"
                          :class-name="(item as Record<string, unknown>)._ClassName as string"
                          :registry="registry"
                          :subclass-options="subclassOptions"
                          :model-value="item as Record<string, unknown>"
                          :readonly="readonly"
                          :is-root="false"
                          class="flex-1"
                          @update:model-value="(value) => updateArrayItemValue(fieldKey, index, value)"
                        />
                        <button
                          v-if="!readonly"
                          type="button"
                          class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-error opacity-0 group-hover:opacity-100 shrink-0 mt-1"
                          @click="removeArrayItem(fieldKey, index)"
                          title="删除"
                        >
                          ×
                        </button>
                      </div>
                    </template>
                    <!-- 基础类型元素 -->
                    <template v-else>
                      <div class="flex items-center gap-1 py-1 min-h-[28px]">
                        <span class="text-[10px] text-base-content/40 w-6 shrink-0">[{{ index }}]</span>
                        <input
                          v-if="typeof item === 'string'"
                          :value="item as string"
                          type="text"
                          class="input input-bordered input-xs flex-1 h-6"
                          :disabled="readonly"
                          @input="(event) => {
                            const list = [...getArrayItems(fieldKey)];
                            list[index] = (event.target as HTMLInputElement).value;
                            localValue[fieldKey] = list;
                          }"
                        />
                        <input
                          v-else-if="typeof item === 'number'"
                          :value="item as number"
                          type="number"
                          class="input input-bordered input-xs flex-1 h-6"
                          :disabled="readonly"
                          @input="(event) => {
                            const list = [...getArrayItems(fieldKey)];
                            list[index] = Number((event.target as HTMLInputElement).value);
                            localValue[fieldKey] = list;
                          }"
                        />
                        <input
                          v-else-if="typeof item === 'boolean'"
                          :checked="item as boolean"
                          type="checkbox"
                          class="checkbox checkbox-xs"
                          :disabled="readonly"
                          @change="(event) => {
                            const list = [...getArrayItems(fieldKey)];
                            list[index] = (event.target as HTMLInputElement).checked;
                            localValue[fieldKey] = list;
                          }"
                        />
                        <button
                          v-if="!readonly"
                          type="button"
                          class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-error opacity-0 group-hover:opacity-100 shrink-0"
                          @click="removeArrayItem(fieldKey, index)"
                          title="删除"
                        >
                          ×
                        </button>
                      </div>
                    </template>
                  </div>
                  <p v-if="getArrayItems(fieldKey).length === 0" class="text-[10px] text-base-content/40 py-1 pl-6">
                    空列表
                  </p>
                </div>
              </Transition>
            </template>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
