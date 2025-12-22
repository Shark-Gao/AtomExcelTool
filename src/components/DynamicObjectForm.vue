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
  }>(),
  {
    readonly: false
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
  <div v-if="classInfo" class="space-y-4">
    <div class="rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <div class="flex items-center justify-between gap-4 border-b border-base-200 px-4 py-3">
        <!-- <div>
          <div class="text-sm font-semibold text-base-content">{{ classInfo.displayName }}</div>
          <div class="text-[11px] uppercase tracking-[0.2em] text-base-content/40">{{ classInfo.baseClass }}</div>
        </div> -->
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="btn btn-circle btn-ghost btn-xs"
            aria-label="切换属性面板"
            @click="toggleRootSection"
          >
            <span class="transition-transform" :class="{ 'rotate-90': !isRootCollapsed }">▶</span>
          </button>
          <label
            v-if="rootSubclassOptions.length && !readonly"
            class="flex items-center gap-2 rounded-lg border border-base-200 bg-base-200/40 px-3 py-1 text-xs text-base-content/70"
          >
            <!-- <span class="text-[11px] uppercase tracking-wide text-base-content/60">原子</span> -->
            <SearchableAtomSelect
              :model-value="rootClassName ?? ''"
              :options="rootSubclassOptions"
              :registry="registry"
              empty-label="请选择类型"
              allow-empty
              :disabled="readonly"
              @update:model-value="(value) => updateRootClass(value)"
            />
          </label>
        </div>
      </div>

      <Transition name="fade" mode="out-in">
        <section v-show="!isRootCollapsed" key="form">
          <div
            v-for="(fieldMeta, fieldKey, index) in fields"
            :key="fieldKey"
            class="border-t border-base-200"
          >
            <div
              class="px-4 py-4 transition-colors duration-150"
              :class="[
                index % 2 === 0 ? 'bg-base-100' : 'bg-base-200/30',
                'hover:bg-primary/5'
              ]"
            >
              <header class="flex items-start gap-3">
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <button
                      v-if="isFieldTypeActive(fieldKey, fieldMeta, 'array') && !readonly"
                      type="button"
                      class="btn btn-outline btn-ghost btn-2xs"
                      @click="addArrayItem(fieldKey, fieldMeta)"
                    >
                      新增项+
                    </button>
                  </div>
                  <!-- <p class="mt-1 text-xs text-base-content/50" v-if="fieldMeta.type === 'array'">
                    列表类型，可新增多个子实例。
                  </p> -->
                  <!-- <p class="mt-1 text-xs text-base-content/50" v-else-if="fieldMeta.type === 'object'">
                    嵌套对象，展开以编辑详细字段。
                  </p> -->
                </div>
              </header>
              <h3 class="text-sm font-semibold text-base-content">{{ fieldMeta.label }}</h3>
              <div class="mt-3">
                <template v-if="shouldUseOperatorDropdown(fieldKey)">
                  <div class="flex flex-col gap-2">
                    <select v-model.number="localValue[fieldKey]" class="select select-bordered w-full" :disabled="readonly">
                      <option v-for="option in operatorDropdownOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                </template>

                <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'string')">
                  <div class="flex flex-col gap-2">
                    
                    <input v-model="localValue[fieldKey]" type="text" class="input input-bordered w-full" :disabled="readonly" />
                  </div>
                </template>

                <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'number')">
                  <div class="flex flex-col gap-2">
                    <input v-model.number="localValue[fieldKey]" type="number" class="input input-bordered w-full" :disabled="readonly" />
                  </div>
                </template>

                <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'boolean')">
                  <div class="flex flex-col gap-2">
                    <label class="flex items-center gap-3" :class="{ 'opacity-60 cursor-not-allowed': readonly }">
                      <input v-model="localValue[fieldKey]" type="checkbox" class="toggle toggle-primary" :disabled="readonly" />
                      <span class="text-xs text-base-content/70">启用开关</span>
                    </label>
                  </div>
                </template>

                <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'select')">
                  <div class="flex flex-col gap-2">
                    <select v-model="localValue[fieldKey]" class="select select-bordered w-full" :disabled="readonly">
                      <option v-for="option in fieldMeta.options" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                </template>

                <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'object')">
                  <!-- <div class="mt-3 space-y-3">
                    <SearchableAtomSelect
                      v-if="!readonly"
                      :model-value="(localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName ?? ''"
                      :options="getSubclassOptions(fieldMeta.baseClass)"
                      :registry="registry"
                      empty-label="请选择类型"
                      allow-empty
                      @update:model-value="(value) => {
                        if (value) {
                          const normalized = normalizeClassInstance(value, (localValue[fieldKey] as Record<string, unknown>) ?? {})
                          localValue[fieldKey] = normalized
                        } else {
                          localValue[fieldKey] = { _ClassName: '' }
                        }
                      }"
                    />
                  </div> -->
                  
                  <Transition name="fade" mode="out-in">
                    <div
                      v-show="isSectionExpanded(fieldKey) && (localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName"
                      class="mt-3 rounded-lg border border-base-300 bg-base-200/70 px-4 py-3 shadow-inner"
                    >
                      <DynamicObjectForm
                        v-if="(localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName"
                        :key="`${fieldKey}-${(localValue[fieldKey] as Record<string, unknown>)._ClassName as string}`"
                        :class-name="(localValue[fieldKey] as Record<string, unknown>)._ClassName as string"
                        :registry="registry"
                        :subclass-options="subclassOptions"
                        :model-value="localValue[fieldKey] as Record<string, unknown>"
                        :readonly="readonly"
                        @update:model-value="(value) => {
                          console.log('Old:', (localValue[fieldKey] as Record<string, unknown>)._ClassName, 'New:', value._ClassName);
                          localValue[fieldKey] = value;
                        }"
                      />
                    </div>
                  </Transition>
                </template>

                <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'array')">
                  <Transition name="fade" mode="out-in">
                    <div v-show="isSectionExpanded(fieldKey)" class="mt-3 space-y-3">
                      <!-- 对象数组 -->
                      <div
                      v-for="(item, index) in getArrayItems(fieldKey)"
                      :key="`${fieldKey}-${index}`"
                      class="rounded-lg border border-base-300 bg-base-100 shadow-sm"
                      >
                          <template v-if="typeof item === 'object'">
                            <div>
                              <DynamicObjectForm
                                v-if="(item as Record<string, unknown>)._ClassName"
                                :key="`${fieldKey}-array-${index}-${(item as Record<string, unknown>)._ClassName as string}`"
                                :class-name="(item as Record<string, unknown>)._ClassName as string"
                                :registry="registry"
                                :subclass-options="subclassOptions"
                                :model-value="item as Record<string, unknown>"
                                :readonly="readonly"
                                @update:model-value="(value) => updateArrayItemValue(fieldKey, index, value)"
                              />
                            </div>
                          </template>

                        <template v-else>
                          <template v-if="typeof item === 'string'">
                            <input
                              :value="item as string"
                              type="text"
                              class="input input-bordered input-sm flex-1"
                              :disabled="readonly"
                              @input="(event) => {
                                const list = [...getArrayItems(fieldKey)];
                                list[index] = (event.target as HTMLInputElement).value;
                                localValue[fieldKey] = list;
                              }"
                            />
                          </template>

                          <template v-else-if="typeof item === 'number'">
                            <input
                              :value="item as number"
                              type="number"
                              class="input input-bordered input-sm flex-1"
                              :disabled="readonly"
                              @input="(event) => {
                                const list = [...getArrayItems(fieldKey)];
                                list[index] = Number((event.target as HTMLInputElement).value);
                                localValue[fieldKey] = list;
                              }"
                            />
                          </template>

                          <template v-else-if="typeof item === 'boolean'">
                            <label class="flex items-center gap-2">
                          <input
                            :checked="item as boolean"
                            type="checkbox"
                            class="checkbox checkbox-sm"
                            :disabled="readonly"
                            @change="(event) => {
                              const list = [...getArrayItems(fieldKey)];
                              list[index] = (event.target as HTMLInputElement).checked;
                              localValue[fieldKey] = list;
                            }"
                          />
                        </label>
                      </template>
                    </template>
                            
                        <button
                            v-if="!readonly"
                            type="button"
                            class="btn btn-ghost btn-2xs text-error"
                            @click="removeArrayItem(fieldKey, index)"
                          >
                            删除
                        </button>
                      </div>
                      <p v-if="getArrayItems(fieldKey).length === 0" class="rounded-lg border border-dashed border-base-200 bg-base-100/50 px-4 py-6 text-center text-xs text-base-content/60">
                        暂无子项，点击"新增项+"创建新的对象。
                      </p>
                    </div>
                  </Transition>
                </template>
              </div>
            </div>
          </div>
        </section>
      </Transition>
    </div>
  </div>


</template>
