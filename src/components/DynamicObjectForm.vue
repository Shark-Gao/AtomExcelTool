<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { normalizeClassInstance as normalizeClassInstanceUtil } from '../utils/ClassNormalizer'
import { ClassRegistry, FieldMeta, isBaseClassNative, BaseClassType, resolveFieldMetaTypeByValue, fieldMetaSupportsType, ElementTypeInfo } from '../types/MetaDefine'
import SearchableAtomSelect from './SearchableAtomSelect.vue'
import PrimitiveInput, { type PrimitiveType } from './PrimitiveInput.vue'

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
    isArrayElement?: boolean
  }>(),
  {
    readonly: false,
    isRoot: true,
    isArrayElement: false
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
  
  // 优先使用元数据中的 elementType
  if (fieldMeta.elementType) {
    return resolveElementType(fieldMeta.elementType)
  }
  
  // 回退到 baseClass 判断
  if (!fieldMeta.baseClass) {
    return 'string'
  }

  // 检查 baseClass 是否为基础类型
  if (isBaseClassNative(fieldMeta.baseClass)) {
    return fieldMeta.baseClass
  }
  
  return 'object'
}

function resolveElementType(elementTypeInfo: ElementTypeInfo): 'string' | 'number' | 'boolean' | 'object' {
  const types = Array.isArray(elementTypeInfo.type) ? elementTypeInfo.type : [elementTypeInfo.type]
  
  // 优先检查是否包含 object 或 array 类型
  if (types.includes('object') || types.includes('array')) {
    return 'object'
  }
  
  // 检查基础类型
  if (types.includes('number')) {
    return 'number'
  }
  if (types.includes('boolean')) {
    return 'boolean'
  }
  
  return 'string'
}

function isPrimitiveType(type: string): type is PrimitiveType {
  return type === 'string' || type === 'number' || type === 'boolean'
}

const isRootCollapsed = ref(true)
const isArrayElementCollapsed = ref(true)

function toggleRootSection() {
  if (props.isArrayElement) {
    isArrayElementCollapsed.value = !isArrayElementCollapsed.value
  } else {
    isRootCollapsed.value = !isRootCollapsed.value
  }
}

function isHeaderCollapsed(): boolean {
  if (props.isArrayElement) {
    return isArrayElementCollapsed.value
  }
  return isRootCollapsed.value
}

const expandedSections = reactive<Record<string, boolean>>({})

// 子组件引用，用于递归展开/收起
const childFormRefs = ref<Record<string, InstanceType<typeof DynamicObjectForm> | null>>({})
const arrayItemRefs = ref<Record<string, (InstanceType<typeof DynamicObjectForm> | null)[]>>({})

// 暴露展开/收起方法给父组件
function expandAll() {
  // 展开自身头部
  if (props.isArrayElement) {
    isArrayElementCollapsed.value = false
  } else if (props.isRoot) {
    isRootCollapsed.value = false
  }
  // 展开所有字段
  Object.keys(fields.value).forEach(key => {
    expandedSections[key] = true
  })
  // 递归展开所有子组件
  Object.values(childFormRefs.value).forEach(ref => {
    ref?.expandAll()
  })
  Object.values(arrayItemRefs.value).forEach(refs => {
    refs.forEach(ref => ref?.expandAll())
  })
}

function collapseAll() {
  // 收起自身头部
  if (props.isArrayElement) {
    isArrayElementCollapsed.value = true
  } else if (props.isRoot) {
    isRootCollapsed.value = true
  }
  // 收起所有字段
  Object.keys(expandedSections).forEach(key => {
    expandedSections[key] = false
  })
  // 递归收起所有子组件
  Object.values(childFormRefs.value).forEach(ref => {
    ref?.collapseAll()
  })
  Object.values(arrayItemRefs.value).forEach(refs => {
    refs.forEach(ref => ref?.collapseAll())
  })
}

defineExpose({
  expandAll,
  collapseAll
})

// 右键菜单状态
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  targetType: '' as 'root' | 'field',
  fieldKey: '' as string,
  hasExpandButton: false,
  funcName: '' as string
})

function getFuncNameByClassName(className: string | undefined): string {
  if (!className) return ''
  // 遍历所有 subclassOptions 查找对应的 funcName
  for (const options of Object.values(props.subclassOptions)) {
    const found = options.find(opt => opt.value === className)
    if (found?.funcName) {
      return found.funcName
    }
  }
  return className // 回退到 className
}

function showContextMenu(event: MouseEvent, targetType: 'root' | 'field', options: { fieldKey?: string; hasExpandButton?: boolean; className?: string } = {}) {
  event.preventDefault()
  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.targetType = targetType
  contextMenu.fieldKey = options.fieldKey ?? ''
  contextMenu.hasExpandButton = options.hasExpandButton ?? false
  contextMenu.funcName = getFuncNameByClassName(options.className)
}

function hideContextMenu() {
  contextMenu.visible = false
}

function copyAtomName() {
  if (contextMenu.funcName) {
    navigator.clipboard.writeText(contextMenu.funcName)
  }
  hideContextMenu()
}

function expandAllSections() {
  if (contextMenu.targetType === 'root') {
    // 展开根节点和所有嵌套子节点
    expandAll()
  } else if (contextMenu.fieldKey) {
    // 展开指定字段及其所有子节点
    expandedSections[contextMenu.fieldKey] = true
    childFormRefs.value[contextMenu.fieldKey]?.expandAll()
    arrayItemRefs.value[contextMenu.fieldKey]?.forEach(ref => ref?.expandAll())
  }
  hideContextMenu()
}

function collapseAllSections() {
  if (contextMenu.targetType === 'root') {
    // 收起根节点和所有嵌套子节点
    collapseAll()
  } else if (contextMenu.fieldKey) {
    // 收起指定字段及其所有子节点
    expandedSections[contextMenu.fieldKey] = false
    childFormRefs.value[contextMenu.fieldKey]?.collapseAll()
    arrayItemRefs.value[contextMenu.fieldKey]?.forEach(ref => ref?.collapseAll())
  }
  hideContextMenu()
}

// 点击其他地方关闭菜单
function handleGlobalClick(event: MouseEvent) {
  if (contextMenu.visible) {
    hideContextMenu()
  }
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
  console.time(`[DynamicObjectForm] getSubclassOptions(${baseClass})`)
  if (!baseClass) {
    console.timeEnd(`[DynamicObjectForm] getSubclassOptions(${baseClass})`)
    return []
  }
  const result = props.subclassOptions[baseClass] ?? []
  console.timeEnd(`[DynamicObjectForm] getSubclassOptions(${baseClass})`)
  console.log(`[DynamicObjectForm] getSubclassOptions(${baseClass}): ${result.length} options`)
  return result
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

function clearArray(fieldKey: string) {
  localValue[fieldKey] = []
}

function updateArrayItemPrimitive(fieldKey: string, index: number, value: string | number | boolean) {
  if (!Array.isArray(localValue[fieldKey])) {
    return
  }
  const list = [...(localValue[fieldKey] as unknown[])]
  list[index] = value
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

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})

/**
 * 获取字段的默认值
 */
function getFieldDefaultValue(fieldMeta: FieldMeta): unknown {
  const effectiveType = Array.isArray(fieldMeta.type) ? fieldMeta.type[0] : fieldMeta.type
  
  switch (effectiveType) {
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'string':
      return ''
    case 'select':
      // select 类型默认为第一个选项的值，如果没有选项则为空字符串
      return fieldMeta.options?.[0]?.value ?? ''
    case 'object':
      return { _ClassName: '' }
    case 'array':
      return []
    default:
      return ''
  }
}

/**
 * 判断值是否为默认值（空值）
 */
function isDefaultValue(value: unknown, fieldMeta: FieldMeta): boolean {
  const effectiveType = resolveFieldMetaTypeByValue(fieldMeta, value)
  
  switch (effectiveType) {
    case 'number':
      return value === 0 || value === undefined || value === null
    case 'boolean':
      return value === false || value === undefined || value === null
    case 'string':
      return value === '' || value === undefined || value === null
    case 'select':
      // select 类型：如果值等于第一个选项或为空，则视为默认值
      const firstOption = fieldMeta.options?.[0]?.value
      return value === firstOption || value === '' || value === undefined || value === null
    case 'object':
      if (typeof value !== 'object' || value === null) return true
      const obj = value as Record<string, unknown>
      return !obj._ClassName || obj._ClassName === ''
    case 'array':
      return !Array.isArray(value) || value.length === 0
    default:
      return value === '' || value === undefined || value === null
  }
}

/**
 * 判断当前值是否与默认值不同（用于显示 Revert 按钮）
 */
function isFieldModified(fieldKey: string, fieldMeta: FieldMeta): boolean {
  const currentValue = localValue[fieldKey]
  return !isDefaultValue(currentValue, fieldMeta)
}

/**
 * 将字段重置为默认值
 */
function revertFieldToDefault(fieldKey: string, fieldMeta: FieldMeta) {
  localValue[fieldKey] = getFieldDefaultValue(fieldMeta)
}

/**
 * 判断 root 节点是否被修改（有任何非默认值的字段）
 */
function isRootModified(): boolean {
  for (const [fieldKey, fieldMeta] of Object.entries(fields.value)) {
    if (isFieldModified(fieldKey, fieldMeta)) {
      return true
    }
  }
  return false
}

/**
 * 将所有字段重置为默认值
 */
function revertAllFieldsToDefault() {
  for (const [fieldKey, fieldMeta] of Object.entries(fields.value)) {
    localValue[fieldKey] = getFieldDefaultValue(fieldMeta)
  }
}

</script>

<template>
  <div v-if="classInfo" class="detail-panel">
    <div class="rounded border border-base-300 bg-base-100">
      <!-- 头部：类型选择器（根节点或数组元素显示） -->
      <div 
        v-if="props.isRoot || props.isArrayElement" 
        class="flex items-center gap-2 border-b border-base-200 px-2 py-1.5 bg-base-200/50"
        @contextmenu="showContextMenu($event, 'root', { hasExpandButton: true, className: rootClassName ?? props.className })"
      >
        <button
          type="button"
          class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5"
          aria-label="切换属性面板"
          @click="toggleRootSection"
        >
          <span class="text-[10px] transition-transform" :class="{ 'rotate-90': !isHeaderCollapsed() }">▶</span>
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
        <span v-else class="text-xs font-medium text-base-content/80 flex-1">{{ classInfo.displayName }}</span>
        <!-- Root Revert 按钮：当有任何字段被修改时显示 -->
        <button
          v-if="!readonly && isRootModified()"
          type="button"
          class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-warning shrink-0"
          title="还原所有字段为默认值"
          @click="revertAllFieldsToDefault"
        >
          ↩
        </button>
      </div>

      <!-- 属性列表 -->
      <Transition name="fade" mode="out-in">
        <div 
          v-show="!(props.isRoot || props.isArrayElement) || !isHeaderCollapsed()" 
          class="divide-y divide-base-200"
          :class="{ 'ml-4 border-l border-base-300': props.isRoot || props.isArrayElement }"
        >
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
                          isFieldTypeActive(fieldKey, fieldMeta, 'select')">
              <div 
                class="flex items-center gap-2 px-2 py-1 min-h-[28px]"
                @contextmenu="showContextMenu($event, 'field', { fieldKey: fieldKey as string, hasExpandButton: false })"
              >
                <div class="w-[120px] shrink-0 flex items-center gap-1">
                  <span class="w-5 shrink-0"></span>
                  <span class="text-xs text-base-content/70 truncate" :title="fieldMeta.label">{{ fieldMeta.label }}</span>
                </div>
                <div class="flex-1 min-w-0 flex items-center gap-1">
                  <!-- 选择 - 使用 daisyUI dropdown -->
                  <details 
                    v-if="isFieldTypeActive(fieldKey, fieldMeta, 'select')"
                    class="dropdown flex-1"
                    :class="{ 'pointer-events-none opacity-50': readonly }"
                  >
                    <summary class="btn btn-xs btn-ghost w-full justify-between h-6 min-h-0 px-2 border border-base-300 font-normal">
                      <span class="truncate text-left">{{ fieldMeta.options?.find(o => o.value === localValue[fieldKey])?.label ?? '请选择' }}</span>
                      <svg class="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <ul class="dropdown-content menu bg-base-100 rounded-box z-50 w-full p-1 shadow-lg border border-base-300 max-h-60 overflow-y-auto">
                      <li v-for="option in fieldMeta.options" :key="option.value">
                        <a 
                          class="text-xs py-1"
                          :class="{ 'active': localValue[fieldKey] === option.value }"
                          @click="localValue[fieldKey] = option.value; ($event.target as HTMLElement).closest('details')?.removeAttribute('open')"
                        >{{ option.label }}</a>
                      </li>
                    </ul>
                  </details>
                  <!-- 基础类型：string/number/boolean -->
                  <PrimitiveInput
                    v-else
                    :type="getActiveFieldType(fieldKey, fieldMeta) as PrimitiveType"
                    :model-value="localValue[fieldKey] as string | number | boolean"
                    :disabled="readonly"
                    size="xs"
                    class="flex-1"
                    @update:model-value="(value) => { localValue[fieldKey] = value }"
                  />
                  <!-- Revert 按钮：当值非默认时显示 -->
                  <button
                    v-if="!readonly && isFieldModified(fieldKey as string, fieldMeta)"
                    type="button"
                    class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-warning shrink-0"
                    title="还原为默认值"
                    @click="revertFieldToDefault(fieldKey as string, fieldMeta)"
                  >
                    ↩
                  </button>
                </div>
              </div>
            </template>

            <!-- 对象类型 -->
            <template v-else-if="isFieldTypeActive(fieldKey, fieldMeta, 'object')">
              <div 
                class="flex items-center gap-2 px-2 py-1 min-h-[28px]"
                @contextmenu="showContextMenu($event, 'field', { 
                  fieldKey: fieldKey as string, 
                  hasExpandButton: hasFieldsForClass((localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName as string), 
                  className: ((localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName as string) 
                })"
              >
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
                <div class="flex-1 min-w-0 flex items-center gap-1">
                  <SearchableAtomSelect
                    v-if="getSubclassOptions(fieldMeta.baseClass).length && !readonly"
                    :model-value="((localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName as string) ?? ''"
                    :options="getSubclassOptions(fieldMeta.baseClass)"
                    :registry="registry"
                    empty-label="None"
                    allow-empty
                    :disabled="readonly"
                    class="flex-1 text-xs"
                    @update:model-value="(value) => {
                      if (value) {
                        const normalized = normalizeClassInstance(value, (localValue[fieldKey] as Record<string, unknown>) ?? {})
                        localValue[fieldKey] = normalized
                      } else {
                        localValue[fieldKey] = { _ClassName: '' }
                      }
                    }"
                  />
                  <span v-else class="text-xs text-base-content/50 flex-1">
                    {{ (localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName || 'None' }}
                  </span>
                  <!-- Revert 按钮：当值非默认时显示 -->
                  <button
                    v-if="!readonly && isFieldModified(fieldKey as string, fieldMeta)"
                    type="button"
                    class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-warning shrink-0"
                    title="还原为默认值"
                    @click="revertFieldToDefault(fieldKey as string, fieldMeta)"
                  >
                    ↩
                  </button>
                </div>
              </div>
              <Transition name="fade" mode="out-in">
                <div
                  v-show="isSectionExpanded(fieldKey) && hasFieldsForClass((localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName as string)"
                  class="ml-6 border-l-2 border-base-300 pl-2"
                >
                  <DynamicObjectForm
                    v-if="(localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName"
                    :ref="(el) => { childFormRefs[fieldKey as string] = el as InstanceType<typeof DynamicObjectForm> | null }"
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
              <div 
                class="flex items-center gap-2 px-2 py-1 min-h-7"
                @contextmenu="showContextMenu($event, 'field', { fieldKey: fieldKey as string, hasExpandButton: true })"
              >
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
                <div class="flex-1 min-w-0 flex items-center gap-8">
                  <span class="text-xs text-base-content/50">{{ getArrayItems(fieldKey).length }} Array Elements</span>
                  <div v-if="!readonly" class="flex items-center gap-3">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-primary"
                      @click="addArrayItem(fieldKey, fieldMeta)"
                      title="新增项"
                    >
                      ➕
                    </button>
                    <button
                      v-if="getArrayItems(fieldKey).length > 0"
                      type="button"
                      class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-error"
                      @click="clearArray(fieldKey)"
                      title="清空数组"
                    >
                      🗑
                    </button>
                    <!-- Revert 按钮：当数组非空时显示 -->
                    <button
                      v-if="isFieldModified(fieldKey as string, fieldMeta)"
                      type="button"
                      class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 text-warning shrink-0"
                      title="还原为空数组"
                      @click="revertFieldToDefault(fieldKey as string, fieldMeta)"
                    >
                      ↩
                    </button>
                  </div>
                </div>
              </div>
              <Transition name="fade" mode="out-in">
                <div v-show="isSectionExpanded(fieldKey)" class="ml-6 space-y-0 border-l-2 border-base-300 pl-2">
                  <div
                    v-for="(item, index) in getArrayItems(fieldKey)"
                    :key="`${fieldKey}-${index}`"
                    class="relative group"
                  >
                    <!-- 根据 fieldMeta 的 baseClass 判断元素类型 -->
                    <!-- 对象元素 -->
                    <template v-if="getArrayElementType(fieldMeta) === 'object'">
                      <div class="flex items-start">
                        <DynamicObjectForm
                          v-if="(item as Record<string, unknown>)?._ClassName"
                          :ref="(el) => { 
                            if (!arrayItemRefs[fieldKey as string]) arrayItemRefs[fieldKey as string] = [];
                            arrayItemRefs[fieldKey as string][index] = el as InstanceType<typeof DynamicObjectForm> | null;
                          }"
                          :key="`${fieldKey}-array-${index}-${(item as Record<string, unknown>)._ClassName as string}`"
                          :class-name="(item as Record<string, unknown>)._ClassName as string"
                          :registry="registry"
                          :subclass-options="subclassOptions"
                          :model-value="item as Record<string, unknown>"
                          :readonly="readonly"
                          :is-root="false"
                          :is-array-element="true"
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
                    <!-- 基础类型元素：string/number/boolean -->
                    <template v-else-if="isPrimitiveType(getArrayElementType(fieldMeta))">
                      <div class="flex items-center gap-1 py-1 min-h-7">
                        <span class="text-[10px] text-base-content/40 w-6 shrink-0">[{{ index }}]</span>
                        <PrimitiveInput
                          :type="getArrayElementType(fieldMeta) as PrimitiveType"
                          :model-value="item as string | number | boolean"
                          :disabled="readonly"
                          size="xs"
                          class="flex-1"
                          @update:model-value="(value) => updateArrayItemPrimitive(fieldKey, index, value)"
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

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="fixed z-50 min-w-[160px] py-1 bg-base-100 border border-base-300 rounded shadow-lg"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <button
          class="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200 flex items-center gap-2"
          @click="copyAtomName"
        >
          <span>📋</span>
          <span>复制原子名称</span>
        </button>
        <template v-if="contextMenu.hasExpandButton">
          <div class="border-t border-base-200 my-1"></div>
          <button
            class="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200 flex items-center gap-2"
            @click="expandAllSections"
          >
            <span>📂</span>
            <span>展开所有</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200 flex items-center gap-2"
            @click="collapseAllSections"
          >
            <span>📁</span>
            <span>收起所有</span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>
