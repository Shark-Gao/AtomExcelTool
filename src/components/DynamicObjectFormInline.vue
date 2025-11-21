<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, watchEffect } from 'vue'
import { normalizeClassInstance as normalizeClassInstanceUtil } from '../utils/ClassNormalizer'
import { ClassRegistry, FieldMeta, BaseClassType, isBaseClassNative, resolveFieldMetaTypeByValue, fieldMetaSupportsType, getFieldMetaTypeList } from '../types/MetaDefine'
import { ue } from '../electron/main/UETypes'

defineOptions({ name: 'DynamicObjectFormInline' })

export type FieldType = 'string' | 'number' | 'boolean' | 'select' | 'object' | 'array'

export type FieldOption = {
  label: string
  value: string
}

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
  if (!props.className || typeof props.className !== 'string') {
    return undefined
  }
  const info = props.registry[props.className]
  if (!info) {
    console.warn(`[DynamicObjectFormInline] classInfo not found for className: "${props.className}"`, {
      className: props.className,
      registryKeys: Object.keys(props.registry)
    })
  }
  return info
})

const fields = computed(() => classInfo.value?.fields ?? {})
const flattenedFields = computed(() => {
  return Object.entries(fields.value).map(([fieldKey, fieldMeta]) => ({
    fieldKey,
    fieldMeta,
  }))
})
const expandedInlineMap = reactive<Record<string, boolean>>({})

function formatFieldTypeLabel(fieldMeta: FieldMeta): string {
  return getFieldMetaTypeList(fieldMeta).join(' | ')
}

function getActiveFieldType(fieldKey: string, fieldMeta: FieldMeta): FieldType {
  return resolveFieldMetaTypeByValue(fieldMeta, localValue[fieldKey])
}

function isFieldTypeActive(fieldKey: string, fieldMeta: FieldMeta, targetType: FieldType): boolean {
  return getActiveFieldType(fieldKey, fieldMeta) === targetType
}

function supportsFieldType(fieldMeta: FieldMeta, targetType: FieldType): boolean {
  return fieldMetaSupportsType(fieldMeta, targetType)
}

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
  if (isBaseClassNative(fieldMeta.baseClass)) {
    return fieldMeta.baseClass
  }
  return 'object'
}

function getSubclassOptions(baseClass: string | undefined): FieldOption[] {
  if (!baseClass) {
    return []
  }
  return props.subclassOptions[baseClass] ?? []
}

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
  const elementType = getArrayElementType(fieldMeta)
  if (elementType === 'object') {
    const options = getSubclassOptions(fieldMeta.baseClass)
    const defaultClassName = options[0]?.value ?? fieldMeta.baseClass
    const newItem = normalizeClassInstance(defaultClassName, {})
    localValue[fieldKey] = [...list, newItem]
  } else {
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

function updateObjectFieldClass(
  fieldKey: string,
  fieldMeta: FieldMeta,
  newClassName: string
) {
  if (!supportsFieldType(fieldMeta, 'object')) {
    return
  }
  if (!newClassName) {
    return
  }
  const normalized = normalizeClassInstance(
    newClassName,
    (localValue[fieldKey] as Record<string, unknown> | undefined) ?? {}
  )
  localValue[fieldKey] = normalized
}

const operatorOnlyClassNames = new Set([
  'BoolValueBinaryOperatorOnNumberDelegate',
  'BoolValueBinaryOperatorOnBoolDelegate'
])

const constantDelegateClassNames = new Set([
  'NumberValueConstDelegate',
  'BoolValueConstDelegate'
])

const shouldRenderOperatorOnlyFields = computed(() => {
  const activeClassName = rootClassName.value ?? props.className
  if (typeof activeClassName !== 'string') {
    return false
  }
  return operatorOnlyClassNames.has(activeClassName)
})

function getObjectClassName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const classNameCandidate = (value as Record<string, unknown>)._ClassName
  if (typeof classNameCandidate === 'string' && classNameCandidate.trim().length > 0) {
    return classNameCandidate
  }
  return undefined
}

function shouldShowParenthesesForObject(value: unknown): boolean {
  const className = getObjectClassName(value)
  if (!className) {
    return false
  }
  return !constantDelegateClassNames.has(className)
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
  <div v-if="classInfo" class="flex flex-col gap-3">
    <!-- <div class="flex flex-wrap items-center gap-3"> -->
      <!-- <div class="badge badge-outline badge-lg">
        {{ classInfo.displayName }}
      </div> -->
      <!-- <span class="text-xs uppercase tracking-[0.3em] text-base-content/40">{{ classInfo.baseClass }}</span> -->
      <!-- <label
        v-if="rootSubclassOptions.length && !readonly"
        class="flex items-center gap-2 text-xs text-base-content/70"
      > -->
        <!-- <span class="text-[11px] uppercase">原子</span> -->
        <!-- <select
          :value="rootClassName"
          class="select select-bordered select-sm w-48"
          @change="(event) => updateRootClass((event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in rootSubclassOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select> -->
      <!-- </label> -->
    <!-- </div> -->

    <div class="flex flex-wrap items-start gap-2">
        <select
            :value="rootClassName"
            class="select select-bordered select-sm w-48"
            @change="(event) => updateRootClass((event.target as HTMLSelectElement).value)"
        >
            <option v-for="option in rootSubclassOptions" :key="option.value" :value="option.value">
            {{ option.label }}
            </option>
        </select>
        <template v-if="shouldShowParenthesesForObject(localValue)">
            <span class="text-base font-semibold text-info">(</span>
        </template>
      <div
        v-for="({ fieldKey, fieldMeta }, index) in flattenedFields"
        :key="fieldKey"
        class="inline-flex flex-wrap items-start gap-3 rounded-lg border border-base-200 bg-base-100/70 px-3 py-0"
      >
        <div class="flex items-center gap-2">
          <button
            v-if="isFieldTypeActive(fieldKey, fieldMeta, 'object') || isFieldTypeActive(fieldKey, fieldMeta, 'array')"
            type="button"
            class="btn btn-xs btn-ghost"
            @click="expandedInlineMap[fieldKey] = !expandedInlineMap[fieldKey]"
          >
            <span class="inline-block transition-transform" :class="expandedInlineMap[fieldKey] ? 'rotate-90' : ''">▶</span>
          </button>
          <!-- <div class="flex flex-col min-w-[140px]">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
              {{ fieldMeta.label }}
            </span>
            <span class="text-[10px] text-base-content/40">{{ formatFieldTypeLabel(fieldMeta) }}</span>
          </div> -->
        </div>

        <div class="flex flex-1 flex-wrap items-stretch gap-3">
          <template v-if="shouldUseOperatorDropdown(fieldKey)">
            <select
              v-model.number="localValue[fieldKey]"
              class="select select-sm select-bordered"
              :disabled="readonly"
            >
              <option v-for="option in operatorDropdownOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </template>

          <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'string')">
            <input
              v-model="localValue[fieldKey]"
              type="text"
              class="input input-sm input-bordered"
              :disabled="readonly"
            />
          </template>

          <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'number')">
            <input
              v-model.number="localValue[fieldKey]"
              type="number"
              class="input input-sm input-bordered"
              :disabled="readonly"
            />
          </template>

          <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'boolean')">
            <label class="flex items-center gap-2 text-sm" :class="{ 'opacity-60': readonly }">
              <input
                v-model="localValue[fieldKey]"
                type="checkbox"
                class="toggle toggle-primary toggle-sm"
                :disabled="readonly"
              />
              <span class="text-xs text-base-content/70">启用</span>
            </label>
          </template>

          <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'select')">
            <select
              v-model="localValue[fieldKey]"
              class="select select-sm select-bordered"
              :disabled="readonly"
            >
              <option v-for="option in fieldMeta.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </template>

          <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'object')">
            <div class="flex flex-wrap items-stretch gap-2">
              <div 
                v-if="!expandedInlineMap[fieldKey] || !((localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName)"
                class="flex items-center gap-2">
                <!-- <span class="badge badge-outline badge-sm">
                  {{ (localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName ?? '未选择' }}
                </span> -->
                <select
                  v-if="getSubclassOptions(fieldMeta.baseClass).length && !readonly"
                  :value="(localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName ?? ''"
                  class="select select-xs select-bordered"
                  @change="(event) => updateObjectFieldClass(
                    fieldKey,
                    fieldMeta,
                    (event.target as HTMLSelectElement).value
                  )"
                >
                  <option value="">请选择类型</option>
                  <option
                    v-for="option in getSubclassOptions(fieldMeta.baseClass)"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>
                <!-- border-l-2 border-dashed border-primary/40 pl-3 -->
              <div
                v-if="expandedInlineMap[fieldKey] && (localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName"
                class="flex flex-1 flex-wrap items-start gap-2 "
                
              >
                <DynamicObjectFormInline
                  :key="`${fieldKey}-${(localValue[fieldKey] as Record<string, unknown>)._ClassName as string}`"
                  :class-name="(localValue[fieldKey] as Record<string, unknown>)._ClassName as string"
                  :registry="registry"
                  :subclass-options="subclassOptions"
                  :model-value="localValue[fieldKey] as Record<string, unknown>"
                  :readonly="readonly"
                  @update:model-value="(value) => {
                    localValue[fieldKey] = value
                  }"
                />
              </div>
            </div>
          </template>

          <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'array')">
            <div class="flex flex-1 flex-col gap-2">
              <div class="flex items-center gap-2">
                <span class="text-xs text-base-content/50">共 {{ getArrayItems(fieldKey).length }} 项</span>
                <button
                  v-if="!readonly"
                  type="button"
                  class="btn btn-ghost btn-xs"
                  @click="addArrayItem(fieldKey, fieldMeta)"
                >
                  新增
                </button>
              </div>
              <div
                v-if="expandedInlineMap[fieldKey]"
                class="flex flex-wrap items-start gap-2 border-l-2 border-dashed border-info/40 pl-3"
              >
                <div
                  v-for="(item, itemIndex) in getArrayItems(fieldKey)"
                  :key="`${fieldKey}-${itemIndex}`"
                  class="inline-flex flex-wrap items-start gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2"
                  :class="{ 'bg-secondary/10 border-secondary/50': expandedInlineMap[`${fieldKey}-${itemIndex}`] }"
                >
                  <span class="text-xs text-base-content/50">{{ itemIndex + 1 }}</span>
                  <template v-if="getArrayElementType(fieldMeta) === 'object'">
                    <div class="flex items-center gap-2">
                      <select
                        v-if="!readonly"
                        :value="(item as Record<string, unknown>)._ClassName as string"
                        class="select select-xs select-bordered"
                        @change="(event) => updateArrayItemClass(
                          fieldKey,
                          fieldMeta,
                          itemIndex,
                          (event.target as HTMLSelectElement).value
                        )"
                      >
                        <option
                          v-for="option in getSubclassOptions(fieldMeta.baseClass)"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </option>
                      </select>
                      <button
                        type="button"
                        class="btn btn-ghost btn-2xs"
                        @click="expandedInlineMap[`${fieldKey}-${itemIndex}`] = !expandedInlineMap[`${fieldKey}-${itemIndex}`]"
                      >
                        <span class="inline-block transition-transform" :class="expandedInlineMap[`${fieldKey}-${itemIndex}`] ? 'rotate-90' : ''">▶</span>
                      </button>
                      <button
                        v-if="!readonly"
                        type="button"
                        class="btn btn-ghost btn-2xs text-error"
                        @click="removeArrayItem(fieldKey, itemIndex)"
                      >
                        删除
                      </button>
                    </div>
                    <DynamicObjectFormInline
                      v-if="expandedInlineMap[`${fieldKey}-${itemIndex}`] && (item as Record<string, unknown>)._ClassName"
                      :key="`${fieldKey}-${itemIndex}-${(item as Record<string, unknown>)._ClassName as string}`"
                      class="border-l-2 border-dashed border-secondary/40 pl-3"
                      :class-name="(item as Record<string, unknown>)._ClassName as string"
                      :registry="registry"
                      :subclass-options="subclassOptions"
                      :model-value="item as Record<string, unknown>"
                      :readonly="readonly"
                      @update:model-value="(value) => updateArrayItemValue(fieldKey, itemIndex, value)"
                    />
                  </template>

                  <template v-else-if="getArrayElementType(fieldMeta) === 'string'">
                    <input
                      :value="item as string"
                      type="text"
                      class="input input-sm input-bordered"
                      :disabled="readonly"
                      @input="(event) => {
                        const list = [...getArrayItems(fieldKey)]
                        list[itemIndex] = (event.target as HTMLInputElement).value
                        localValue[fieldKey] = list
                      }"
                    />
                  </template>

                  <template v-else-if="getArrayElementType(fieldMeta) === 'number'">
                    <input
                      :value="item as number"
                      type="number"
                      class="input input-sm input-bordered"
                      :disabled="readonly"
                      @input="(event) => {
                        const list = [...getArrayItems(fieldKey)]
                        list[itemIndex] = Number((event.target as HTMLInputElement).value)
                        localValue[fieldKey] = list
                      }"
                    />
                  </template>

                  <template v-else-if="getArrayElementType(fieldMeta) === 'boolean'">
                    <label class="flex items-center gap-2 text-sm" :class="{ 'opacity-60': readonly }">
                      <input
                        :checked="item as boolean"
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        :disabled="readonly"
                        @change="(event) => {
                          const list = [...getArrayItems(fieldKey)]
                          list[itemIndex] = (event.target as HTMLInputElement).checked
                          localValue[fieldKey] = list
                        }"
                      />
                      <span class="text-xs">启用</span>
                    </label>
                  </template>
                </div>
              </div>

              <p
                v-if="getArrayItems(fieldKey).length === 0"
                class="rounded-lg border border-dashed border-base-200 bg-base-100/60 px-4 py-6 text-center text-xs text-base-content/60"
              >
                暂无子项，点击“新增”创建。
              </p>
            </div>
          </template>

          
        </div>
        <template v-if="shouldShowParenthesesForObject(localValue) && index !== flattenedFields.length - 1" >
            <span class="text-base font-semibold text-info">，</span>
        </template>
      </div>
      <template v-if="shouldShowParenthesesForObject(localValue) ">
            <span class="text-base font-semibold text-info">)</span>
        </template>
    </div>
  </div>

  <div v-else class="alert alert-warning">
    <span>未找到类 {{ className }} 的结构定义，请检查元信息。</span>
  </div>
</template>
