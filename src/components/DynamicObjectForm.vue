<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'

export type FieldType = 'string' | 'number' | 'boolean' | 'select' | 'object' | 'array'

export type FieldOption = {
  label: string
  value: string
}

export type FieldMeta =
  | {
      label: string
      type: Exclude<FieldType, 'object' | 'array'>
      options?: FieldOption[]
    }
  | {
      label: string
      type: 'object'
      baseClass: string
    }
  | {
      label: string
      type: 'array'
      baseClass: string
    }

export type ClassInfo = {
  displayName: string
  baseClass: string
  fields: Record<string, FieldMeta>
}

export type ClassRegistry = Record<string, ClassInfo>

const props = defineProps<{
  className: string
  registry: ClassRegistry
  modelValue: Record<string, unknown>
  subclassOptions: Record<string, FieldOption[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const localValue = reactive<Record<string, unknown>>({})
const isHydrating = ref(false)

const classInfo = computed(() => props.registry[props.className])
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

function getArrayItems(fieldKey: string): Record<string, unknown>[] {
  const value = localValue[fieldKey]
  if (!Array.isArray(value)) {
    return []
  }
  return value as Record<string, unknown>[]
}

const isRootCollapsed = ref(false)

function toggleRootSection() {
  isRootCollapsed.value = !isRootCollapsed.value
}

const expandedSections = reactive<Record<string, boolean>>({})

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

function getSubclassOptions(baseClass: string): FieldOption[] {
  return props.subclassOptions[baseClass] ?? []
}

function normalizeClassInstance(className: string, raw: Record<string, unknown>): Record<string, unknown> {
  const info = props.registry[className]
  if (!info) {
    return { _ClassName: className }
  }

  const normalized: Record<string, unknown> = { _ClassName: className }

  Object.entries(info.fields).forEach(([fieldKey, fieldMeta]) => {
    const rawValue = raw[fieldKey]

    if (fieldMeta.type === 'object') {
      const options = getSubclassOptions(fieldMeta.baseClass)
      const defaultClass = options[0]?.value ?? fieldMeta.baseClass
      const rawObject = typeof rawValue === 'object' && rawValue !== null ? (rawValue as Record<string, unknown>) : {}
      const requestedClass = typeof rawObject._ClassName === 'string' ? rawObject._ClassName : defaultClass
      const selectedClass = options.some((option) => option.value === requestedClass)
        ? requestedClass
        : defaultClass
      normalized[fieldKey] = normalizeClassInstance(selectedClass, rawObject)
      return
    }

    if (fieldMeta.type === 'array') {
      const options = getSubclassOptions(fieldMeta.baseClass)
      const defaultClass = options[0]?.value ?? fieldMeta.baseClass
      const items = Array.isArray(rawValue) ? rawValue : []
      normalized[fieldKey] = items.map((item) => {
        const rawObject = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
        const requestedClass = typeof rawObject._ClassName === 'string' ? rawObject._ClassName : defaultClass
        const selectedClass = options.some((option) => option.value === requestedClass)
          ? requestedClass
          : defaultClass
        return normalizeClassInstance(selectedClass, rawObject)
      })
      return
    }

    if (fieldMeta.type === 'number') {
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        normalized[fieldKey] = 0
        return
      }
      const numericValue = Number(rawValue)
      normalized[fieldKey] = Number.isNaN(numericValue) ? 0 : numericValue
      return
    }

    if (fieldMeta.type === 'boolean') {
      normalized[fieldKey] = Boolean(rawValue)
      return
    }

    normalized[fieldKey] = rawValue ?? ''
  })

  return normalized
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
  localValue,
  () => {
    if (isHydrating.value) {
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

function addArrayItem(fieldKey: string, fieldMeta: Extract<FieldMeta, { type: 'array' }>) {
  const options = getSubclassOptions(fieldMeta.baseClass)
  const defaultClassName = options[0]?.value ?? fieldMeta.baseClass
  const list = Array.isArray(localValue[fieldKey]) ? (localValue[fieldKey] as Record<string, unknown>[]) : []
  const newItem = normalizeClassInstance(defaultClassName, {})
  localValue[fieldKey] = [...list, newItem]
}

async function updateArrayItemClass(
  fieldKey: string,
  fieldMeta: Extract<FieldMeta, { type: 'array' }>,
  index: number,
  newClassName: string
) {
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


</script>

<template>
  <div v-if="classInfo" class="space-y-4">
    <div class="rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <div class="flex items-center justify-between gap-4 border-b border-base-200 px-4 py-3">
        <div>
          <div class="text-sm font-semibold text-base-content">{{ classInfo.displayName }}</div>
          <div class="text-[11px] uppercase tracking-[0.2em] text-base-content/40">{{ classInfo.baseClass }}</div>
        </div>
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
            v-if="rootSubclassOptions.length"
            class="flex items-center gap-2 rounded-lg border border-base-200 bg-base-200/40 px-3 py-1 text-xs text-base-content/70"
          >
            <span class="text-[11px] uppercase tracking-wide text-base-content/60">原子</span>
            <select
              :value="rootClassName"
              class="select select-bordered select-xs w-48"
              @change="(event) => updateRootClass((event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in rootSubclassOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
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
                <button
                  v-if="fieldMeta.type === 'object' || fieldMeta.type === 'array'"
                  type="button"
                  class="btn btn-circle btn-ghost btn-xs"
                  :aria-expanded="isSectionExpanded(fieldKey)"
                  @click="toggleSection(fieldKey)"
                >
                  <span class="transition-transform" :class="{ 'rotate-90': isSectionExpanded(fieldKey) }">▶</span>
                </button>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <h3 class="text-sm font-semibold text-base-content">{{ fieldMeta.label }}</h3>
                    <button
                      v-if="fieldMeta.type === 'array'"
                      type="button"
                      class="btn btn-outline btn-ghost btn-2xs"
                      @click="addArrayItem(fieldKey, fieldMeta as Extract<FieldMeta, { type: 'array' }>)"
                    >
                      新增项+
                    </button>
                  </div>
                  <p class="mt-1 text-xs text-base-content/50" v-if="fieldMeta.type === 'array'">
                    列表类型，可新增多个子实例。
                  </p>
                  <p class="mt-1 text-xs text-base-content/50" v-else-if="fieldMeta.type === 'object'">
                    嵌套对象，展开以编辑详细字段。
                  </p>
                </div>
              </header>

              <div class="mt-3">
                <template v-if="fieldMeta.type === 'string'">
                  <input v-model="localValue[fieldKey]" type="text" class="input input-bordered w-full" />
                </template>

                <template v-else-if="fieldMeta.type === 'number'">
                  <input v-model.number="localValue[fieldKey]" type="number" class="input input-bordered w-full" />
                </template>

                <template v-else-if="fieldMeta.type === 'boolean'">
                  <label class="flex items-center gap-3">
                    <input v-model="localValue[fieldKey]" type="checkbox" class="toggle toggle-primary" />
                    <span class="text-xs text-base-content/70">启用开关</span>
                  </label>
                </template>

                <template v-else-if="fieldMeta.type === 'select'">
                  <select v-model="localValue[fieldKey]" class="select select-bordered w-full">
                    <option v-for="option in fieldMeta.options" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </template>

                <template v-else-if="fieldMeta.type === 'object'">
                  <Transition name="fade" mode="out-in">
                    <div
                      v-show="isSectionExpanded(fieldKey)"
                      class="mt-3 rounded-lg border border-base-300 bg-base-200/70 px-4 py-3 shadow-inner"
                    >
                      <DynamicObjectForm
                        v-if="(localValue[fieldKey] as Record<string, unknown> | undefined)?._ClassName"
                        :key="`${fieldKey}-${(localValue[fieldKey] as Record<string, unknown>)._ClassName as string}`"
                        :class-name="(localValue[fieldKey] as Record<string, unknown>)._ClassName as string"
                        :registry="registry"
                        :subclass-options="subclassOptions"
                        :model-value="localValue[fieldKey] as Record<string, unknown>"
                        @update:model-value="(value) => {
                          console.log('Old:', (localValue[fieldKey] as Record<string, unknown>)._ClassName, 'New:', value._ClassName);
                          localValue[fieldKey] = value;
                        }"
                      />
                    </div>
                  </Transition>
                </template>

                <template v-else-if="fieldMeta.type === 'array'">
                  <Transition name="fade" mode="out-in">
                    <div v-show="isSectionExpanded(fieldKey)" class="mt-3 space-y-3">
                      <div
                        v-for="(item, index) in getArrayItems(fieldKey)"
                        :key="`${fieldKey}-${index}`"
                        class="rounded-lg border border-base-300 bg-base-100 shadow-sm"
                      >
                        <header class="flex items-center gap-2 border-b border-base-200 px-3 py-2 text-xs font-semibold">
                          <button
                            type="button"
                            class="btn btn-circle btn-ghost btn-2xs"
                            :aria-expanded="isSectionExpanded(`${fieldKey}-array-${index}`)"
                            @click="toggleSection(`${fieldKey}-array-${index}`)"
                          >
                            <span class="transition-transform" :class="{ 'rotate-90': isSectionExpanded(`${fieldKey}-array-${index}`) }">▶</span>
                          </button>
                          <span class="badge badge-outline badge-sm">{{ (item as Record<string, unknown>)._ClassName }}</span>
                          <select
                            :value="(item as Record<string, unknown>)._ClassName as string"
                            class="select select-bordered select-xs w-44"
                            @mousedown.stop
                            @click.stop
                            @change="(event) =>
                              updateArrayItemClass(
                                fieldKey,
                                fieldMeta as Extract<FieldMeta, { type: 'array' }>,
                                index,
                                (event.target as HTMLSelectElement).value
                              )
                            "
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
                            class="btn btn-ghost btn-2xs text-error"
                            @click="removeArrayItem(fieldKey, index)"
                          >
                            删除
                          </button>
                        </header>

                        <div v-show="isSectionExpanded(`${fieldKey}-array-${index}`)" class="px-3 pb-2 pt-3">
                          <DynamicObjectForm
                            v-if="(item as Record<string, unknown>)._ClassName"
                            :key="`${fieldKey}-array-${index}-${(item as Record<string, unknown>)._ClassName as string}`"
                            :class-name="(item as Record<string, unknown>)._ClassName as string"
                            :registry="registry"
                            :subclass-options="subclassOptions"
                            :model-value="item as Record<string, unknown>"
                            @update:model-value="(value) => updateArrayItemValue(fieldKey, index, value)"
                          />
                        </div>
                      </div>

                      <p v-if="getArrayItems(fieldKey).length === 0" class="rounded-lg border border-dashed border-base-200 bg-base-100/50 px-4 py-6 text-center text-xs text-base-content/60">
                        暂无子项，点击“新增项+”创建新的对象。
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

  <div v-else class="alert alert-warning">
    <span>未找到类 {{ className }} 的结构定义，请检查元信息。</span>
  </div>
</template>
