<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import DynamicObjectForm, { type ClassRegistry, type FieldMeta, type FieldOption } from './components/DynamicObjectForm.vue'

type RowRecord = Record<string, string>

type WorkbookMeta = {
  sheetName: string
  rowCount: number
}

const rowNameToRecord = reactive<Record<string, RowRecord>>({})
const rowNames = ref<string[]>([])
const columnNames = ref<string[]>([])
const rowNameColumnLabel = ref<string>('RowName')
const selectedRowName = ref<string | null>(null)
const editableRecord = reactive<RowRecord>({})
const workbookMeta = ref<WorkbookMeta | null>(null)
const errorMessage = ref<string | null>(null)
const isLoading = ref(false)
const searchKeyword = ref('')
const openedFilePath = ref<string | null>(null)
const sheetName = ref<string>('Sheet1')
const searchInputRef = ref<HTMLInputElement | null>(null)
const columnSearchKeyword = ref('')
const columnSearchInputRef = ref<HTMLInputElement | null>(null)
const columnInputRefs = reactive<Record<string, HTMLDivElement>>({})
const matchingColumnNames = ref<string[]>([])
const activeColumnMatchIndex = ref(0)
const highlightColumnName = ref<string | null>(null)
const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'dracula_custom', label: 'Dracula' },
  { value: 'retro', label: 'Retro' },
  { value: 'black', label: 'Black' },
]
const currentTheme = ref<string>('dracula_custom')
const rowButtonRefs = reactive<Record<string, HTMLButtonElement>>({})

type ClassType = 'Condition' | 'Action'

type ParsedClassObject = {
  _ClassName: string
  [key: string]: unknown
}

type PrimitiveFieldDefinition = {
  key: string
  label?: string
  type: 'string' | 'number' | 'boolean'
}

type SelectFieldDefinition = {
  key: string
  label?: string
  type: 'select'
  options: FieldOption[]
}

type ObjectFieldDefinition = {
  key: string
  label?: string
  type: 'object'
  baseClass: string
}

type ArrayFieldDefinition = {
  key: string
  label?: string
  type: 'array'
  baseClass: string
}

type ClassFieldDefinition =
  | PrimitiveFieldDefinition
  | SelectFieldDefinition
  | ObjectFieldDefinition
  | ArrayFieldDefinition

type ClassMetadata = {
  className: string
  baseClass: string
  displayName?: string
  fields: ClassFieldDefinition[]
}

const metadata: ClassMetadata[] = [
  {
    className: 'ConditionActionClassTypeA',
    baseClass: 'ActionBase',
    fields: [
      { key: 'TagName', type: 'string' },
      { key: 'SkillSlotName', type: 'string' },
      { key: 'Attr1', type: 'object', baseClass: 'ConditionBase' },
      { key: 'Attr2', type: 'object', baseClass: 'ActionBase' },
      {
        key: 'Tags',
        type: 'array',
        baseClass: 'ConditionBase'
      },
      {
        key: 'Priority',
        type: 'select',
        options: [
          { label: '高', value: 'high' },
          { label: '中', value: 'medium' },
          { label: '低', value: 'low' }
        ]
      }
    ]
  },
  {
    className: 'ConditionClassTypeB',
    baseClass: 'ConditionBase',
    fields: [
      { key: 'key1', type: 'number' },
      {
        key: 'Comparison',
        type: 'select',
        options: [
          { label: '大于', value: 'gt' },
          { label: '等于', value: 'eq' },
          { label: '小于', value: 'lt' }
        ]
      }
    ]
  },
  {
    className: 'ConditionClassTypeC',
    baseClass: 'ConditionBase',
    fields: [{ key: 'id', type: 'string' }]
  },
  {
    className: 'ActionClassTypeC',
    baseClass: 'ActionBase',
    fields: [
      { key: 'key2', type: 'string' },
      {
        key: 'Mode',
        type: 'select',
        options: [
          { label: '普通', value: 'normal' },
          { label: '强化', value: 'enhanced' }
        ]
      }
    ]
  },
  {
    className: 'ActionClassTypeD',
    baseClass: 'ActionBase',
    fields: [
      { key: 'IsDone', type: 'boolean' },
      {
        key: 'SubActions',
        type: 'array',
        baseClass: 'ActionBase'
      }
    ]
  }
]

const classRegistry = reactive<ClassRegistry>({})

function rebuildClassRegistry() {
  Object.keys(classRegistry).forEach((key) => delete classRegistry[key])
  metadata.forEach((classMeta) => {
    classRegistry[classMeta.className] = {
      displayName: classMeta.className,
      baseClass: classMeta.baseClass,
      fields: classMeta.fields.reduce<Record<string, FieldMeta>>((fieldsAccumulator, fieldMeta) => {
        const label = fieldMeta.label ?? fieldMeta.key
        if (fieldMeta.type === 'object' || fieldMeta.type === 'array') {
          fieldsAccumulator[fieldMeta.key] = {
            label,
            type: fieldMeta.type,
            baseClass: fieldMeta.baseClass
          }
          return fieldsAccumulator
        }

        if (fieldMeta.type === 'select') {
          fieldsAccumulator[fieldMeta.key] = {
            label,
            type: fieldMeta.type,
            options: fieldMeta.options ?? []
          }
          return fieldsAccumulator
        }

        fieldsAccumulator[fieldMeta.key] = {
          label,
          type: fieldMeta.type
        }
        return fieldsAccumulator
      }, {})
    }
  })
}

rebuildClassRegistry()

const subclassOptions = reactive<Record<string, FieldOption[]>>({})

function rebuildSubclassOptions() {
  Object.keys(subclassOptions).forEach((key) => delete subclassOptions[key])
  Object.values(classRegistry).forEach((info) => {
    const bucket = (subclassOptions[info.baseClass] ??= [])
    bucket.push({ value: info.displayName, label: info.displayName })
  })
  Object.values(subclassOptions).forEach((options) => {
    options.sort((a, b) => a.label.localeCompare(b.label))
  })
}

rebuildSubclassOptions()

const mockJsonObject = reactive<ParsedClassObject>({
  _ClassName: 'ConditionActionClassTypeA',
  TagName: 'MLan01_atksk_JumpAtk_DashBack',
  SkillSlotName: '',
  Attr1: {
    _ClassName: 'ConditionClassTypeB',
    key1: 42,
    Comparison: 'gt'
  },
  Attr2: {
    _ClassName: 'ActionClassTypeC',
    key2: 'value2',
    Mode: 'normal'
  },
  Tags: [
    {
      _ClassName: 'ConditionClassTypeC',
      id: 'Tag_Hero'
    },
    {
      _ClassName: 'ConditionClassTypeB',
      key1: 7,
      Comparison: 'lt'
    }
  ],
  Priority: 'high'
})

const mockObjectValue = reactive<Record<string, unknown>>({})
const mockClassName = ref<string>(mockJsonObject._ClassName)
const rawConfigText = ref(
  JSON.stringify(mockJsonObject, null, 2)
)
const parseErrorMessage = ref<string | null>(null)

const mockClassOptions = computed<FieldOption[]>(() => {
  const targetBaseClass = classRegistry[mockClassName.value]?.baseClass
  if (!targetBaseClass) {
    return []
  }
  return subclassOptions[targetBaseClass] ?? []
})

function normalizeInstance(raw: Record<string, unknown>, fallbackClassName?: string): ParsedClassObject {
  const baseFallback = fallbackClassName ?? mockClassName.value
  const candidateClassName = typeof raw._ClassName === 'string' ? raw._ClassName : baseFallback
  const className = classRegistry[candidateClassName] ? candidateClassName : baseFallback
  const info = classRegistry[className]
  if (!info) {
    return { _ClassName: className }
  }

  const normalized: ParsedClassObject = { _ClassName: className }

  Object.entries(info.fields).forEach(([fieldKey, fieldMeta]) => {
    const rawValue = raw[fieldKey]

    if (fieldMeta.type === 'object') {
      const options = subclassOptions[fieldMeta.baseClass] ?? []
      const defaultClass = options[0]?.value ?? fieldMeta.baseClass
      const rawObject = typeof rawValue === 'object' && rawValue !== null ? (rawValue as Record<string, unknown>) : {}
      const requestedClass = typeof rawObject._ClassName === 'string' ? rawObject._ClassName : defaultClass
      const selectedClass = options.some((option) => option.value === requestedClass)
        ? requestedClass
        : defaultClass
      normalized[fieldKey] = normalizeInstance({ ...rawObject, _ClassName: selectedClass }, defaultClass)
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

function applyNormalizedObject(normalized: ParsedClassObject) {
  Object.keys(mockObjectValue).forEach((key) => delete mockObjectValue[key])
  Object.entries(normalized).forEach(([key, value]) => {
    mockObjectValue[key] = value
  })
  rawConfigText.value = JSON.stringify(mockObjectValue, null, 2)
}

function syncMockObjectValueFromJson() {
  const normalized = normalizeInstance(mockJsonObject)
  applyNormalizedObject(normalized)
}

watch(
  () => rawConfigText.value,
  (newText) => {
    try {
      const parsed = JSON.parse(newText) as ParsedClassObject
      parseErrorMessage.value = null
      Object.keys(mockJsonObject).forEach((key) => delete (mockJsonObject as Record<string, unknown>)[key])
      Object.entries(parsed).forEach(([key, value]) => {
        ;(mockJsonObject as Record<string, unknown>)[key] = value
      })
      if (typeof parsed._ClassName === 'string') {
        mockClassName.value = parsed._ClassName
      }
      syncMockObjectValueFromJson()
    } catch (error) {
      parseErrorMessage.value = error instanceof Error ? error.message : '解析 JSON 时失败'
    }
  }
)

watch(
  () => mockClassName.value,
  () => {
    mockJsonObject._ClassName = mockClassName.value
    syncMockObjectValueFromJson()
  }
)

const filteredRowNames = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const allRowNames = rowNames.value
  if (!keyword) {
    return allRowNames
  }
  return allRowNames.filter((rowName) => rowName.toLowerCase().includes(keyword))
})

const currentRecord = computed<RowRecord | null>(() => {
  if (!selectedRowName.value) {
    return null
  }
  return rowNameToRecord[selectedRowName.value] ?? null
})

const statusMessage = computed(() => {
  if (errorMessage.value) {
    return errorMessage.value
  }
  if (!rowNames.value.length) {
    return '尚未加载配置，请使用工具栏打开 Excel 文件。'
  }
  if (!selectedRowName.value) {
    return '数据已加载，请从左侧选择一个 RowName。'
  }
  if (!currentRecord.value) {
    return '未能读取该 RowName 的数据，请重试或选择其他行。'
  }
  return ''
})

const displayColumnNames = computed(() => {
  if (columnNames.value.length) {
    return columnNames.value
  }
  if (currentRecord.value) {
    return Object.keys(currentRecord.value)
  }
  return []
})

watch(currentRecord, (newRecord) => {
  Object.keys(editableRecord).forEach((key) => delete editableRecord[key])
  if (!newRecord) {
    return
  }
  Object.entries(newRecord).forEach(([columnName, value]) => {
    editableRecord[columnName] = value ?? ''
  })
})

function applyTheme(themeName: string) {
  document.documentElement.setAttribute('data-theme', themeName)
}

watch(currentTheme, (newTheme) => {
  applyTheme(newTheme)
})

applyTheme(currentTheme.value)

function focusColumnSearchInput(options: { select?: boolean } = {}) {
  const input = columnSearchInputRef.value
  if (!input) {
    return
  }
  const shouldSelect = options.select ?? true
  if (document.activeElement !== input) {
    input.focus()
    if (shouldSelect) {
      input.select()
    }
    return
  }
  if (shouldSelect) {
    input.select()
  }
}

function scrollToActiveColumn() {
  if (!matchingColumnNames.value.length) {
    highlightColumnName.value = null
    return
  }

  if (activeColumnMatchIndex.value < 0) {
    activeColumnMatchIndex.value = matchingColumnNames.value.length - 1
  }
  if (activeColumnMatchIndex.value >= matchingColumnNames.value.length) {
    activeColumnMatchIndex.value = 0
  }

  const activeColumnName = matchingColumnNames.value[activeColumnMatchIndex.value]
  highlightColumnName.value = activeColumnName
  columnInputRefs[activeColumnName]?.scrollIntoView({ block: 'center', behavior: 'auto' })
}

function setColumnInputRef(columnName: string, el: Element | ComponentPublicInstance | null) {
  if (!(el instanceof HTMLElement) || !el.classList.contains('column-field-container')) {
    delete columnInputRefs[columnName]
    return
  }
  columnInputRefs[columnName] = el as HTMLDivElement
}

function moveToNextColumnMatch() {
  if (!matchingColumnNames.value.length) {
    return
  }
  activeColumnMatchIndex.value = (activeColumnMatchIndex.value + 1) % matchingColumnNames.value.length
  scrollToActiveColumn()
}

function setRowButtonRef(row: string, el: Element | ComponentPublicInstance | null) {
  if (!(el instanceof HTMLButtonElement)) {
    delete rowButtonRefs[row]
    return
  }
  rowButtonRefs[row] = el
}

watch(
  () => columnSearchKeyword.value.trim(),
  async (newKeyword) => {
    if (newKeyword === '') {
      matchingColumnNames.value = []
      activeColumnMatchIndex.value = 0
      highlightColumnName.value = null
      return
    }

    await nextTick()

    const normalizedKeyword = newKeyword.toLowerCase()
    matchingColumnNames.value = Object.keys(columnInputRefs).filter((columnName) =>
      columnName.toLowerCase().includes(normalizedKeyword)
    )

    if (!matchingColumnNames.value.length) {
      activeColumnMatchIndex.value = 0
      highlightColumnName.value = null
      return
    }

    if (activeColumnMatchIndex.value >= matchingColumnNames.value.length) {
      activeColumnMatchIndex.value = 0
    }

    focusColumnSearchInput({ select: false })
    scrollToActiveColumn()
  }
)

watch(selectedRowName, async (newSelection) => {
  if (!newSelection) {
    return
  }
  await nextTick()
  scrollSelectedRowIntoView()
})

watch(filteredRowNames, async (newFilteredRowNames) => {
  if (!selectedRowName.value) {
    return
  }
  if (!newFilteredRowNames.includes(selectedRowName.value)) {
    return
  }
  await nextTick()
  scrollSelectedRowIntoView()
})

watch(
  () => searchKeyword.value.trim(),
  async (newKeyword, oldKeyword) => {
    if (newKeyword !== '' || oldKeyword === '') {
      return
    }
    await nextTick()
    scrollSelectedRowIntoView()
  }
)

function scrollSelectedRowIntoView(options?: ScrollIntoViewOptions) {
  if (!selectedRowName.value) {
    return
  }
  const button = rowButtonRefs[selectedRowName.value]
  button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto', ...options })
}

function clearWorkbookState() {
  Object.keys(rowNameToRecord).forEach((key) => delete rowNameToRecord[key])
  rowNames.value = []
  columnNames.value = []
  selectedRowName.value = null
  workbookMeta.value = null
  openedFilePath.value = null
  sheetName.value = 'Sheet1'
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
    event.preventDefault()
    if (!selectedRowName.value) {
      return
    }
    focusColumnSearchInput({ select: false })
    if (matchingColumnNames.value.length) {
      scrollToActiveColumn()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})

async function openWorkbookFromMainProcess() {
  if (!window.excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }

  isLoading.value = true
  errorMessage.value = null

  try {
    const result = await window.excelBridge.openWorkbook()
    if (result.canceled) {
      return
    }

    if (result.error) {
      throw new Error(result.error)
    }

    if (!result.rows || !result.rows.length) {
      throw new Error('工作表没有有效的 RowName 数据行。')
    }

    openedFilePath.value = result.filePath ?? null
    sheetName.value = result.sheetName ?? 'Sheet1'
    columnNames.value = result.columnNames ?? []
    rowNameColumnLabel.value = result.rowNameColumnName ?? 'RowName'
    workbookMeta.value = {
      sheetName: sheetName.value,
      rowCount: result.rowCount ?? result.rows.length
    }

    Object.keys(rowNameToRecord).forEach((key) => delete rowNameToRecord[key])
    const normalizedRows = result.rows.map((row) => ({ ...row }))
    rowNames.value = normalizedRows
      .map((row) => row[rowNameColumnLabel.value] ?? row.RowName)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    normalizedRows.forEach((row) => {
      const rowName = row[rowNameColumnLabel.value] ?? row.RowName
      if (typeof rowName === 'string' && rowName.trim().length > 0) {
        rowNameToRecord[rowName.trim()] = row
      }
    })
    selectedRowName.value = rowNames.value[0] ?? null
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '打开 Excel 文件失败。'
    clearWorkbookState()
  } finally {
    isLoading.value = false
  }
}

function resetEditableRecord() {
  if (!currentRecord.value) {
    return
  }
  Object.keys(editableRecord).forEach((key) => delete editableRecord[key])
  Object.entries(currentRecord.value).forEach(([columnName, value]) => {
    editableRecord[columnName] = value ?? ''
  })
}

function saveEditableRecord() {
  if (!currentRecord.value || !selectedRowName.value) {
    return
  }

  rowNameToRecord[selectedRowName.value] = { ...editableRecord }
}

function buildRowsForSaving(): RowRecord[] {
  return Object.keys(rowNameToRecord).map((rowName) => ({
    RowName: rowName,
    ...rowNameToRecord[rowName]
  }))
}

async function saveWorkbookToDisk() {
  if (!window.excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }
  if (!openedFilePath.value) {
    await saveWorkbookAs()
    return
  }

  try {
    const rows = buildRowsForSaving()
    const result = await window.excelBridge.saveWorkbook({
      filePath: openedFilePath.value,
      sheetName: sheetName.value,
      rows
    })
    if (!result.ok) {
      throw new Error(result.error ?? '保存失败')
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存 Excel 时失败。'
  }
}

async function saveWorkbookAs() {
  if (!window.excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }

  try {
    const rows = buildRowsForSaving()
    const result = await window.excelBridge.saveWorkbookAs({
      defaultPath: openedFilePath.value ?? undefined,
      sheetName: sheetName.value,
      rows
    })

    if (result.canceled) {
      return
    }

    if (!result.ok) {
      throw new Error(result.error ?? '保存失败')
    }

    openedFilePath.value = result.filePath ?? openedFilePath.value
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存 Excel 时失败。'
  }
}
</script>

<template>
  <div class="flex h-full flex-col bg-base-200 text-base-content">
    <header class="sticky top-0 z-10 border-b border-base-300 bg-base-100 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div class="join">
          <button class="btn join-item btn-primary" @click="openWorkbookFromMainProcess">打开 Excel 配置</button>
          <button class="btn join-item" :disabled="!Object.keys(rowNameToRecord).length" @click="saveWorkbookToDisk">保存</button>
          <button class="btn join-item" :disabled="!Object.keys(rowNameToRecord).length" @click="saveWorkbookAs">另存为</button>
        </div>
        <span v-if="workbookMeta" class="badge badge-outline">{{ sheetName }} · {{ workbookMeta.rowCount }} 行</span>
        <span v-if="openedFilePath" class="badge badge-ghost">{{ openedFilePath }}</span>
        <span v-if="statusMessage" class="text-sm" :class="errorMessage ? 'text-error' : 'text-base-content/60'">
          {{ statusMessage }}
        </span>
        <span v-if="isLoading" class="loading loading-spinner text-primary"></span>
        <div class="dropdown dropdown-end ml-auto">
          <div tabindex="0" role="button" class="btn btn-ghost">
            <span class="hidden sm:inline">主题</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <ul tabindex="0" class="menu dropdown-content z-1 mt-2 w-40 rounded-box bg-base-100 p-2 shadow">
            <li v-for="option in themeOptions" :key="option.value">
              <button class="justify-between" :class="{ active: option.value === currentTheme }" @click="currentTheme = option.value">
                {{ option.label }}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </header>

    <main class="flex flex-1 min-h-0 gap-3 px-3 py-3 overflow-hidden">
      <aside class="card flex w-72 max-w-xs min-h-0 flex-col overflow-hidden bg-base-100 shadow-md">
        <div class="px-4 pt-3 pb-2 space-y-4">
          <div class="form-control">
            <label class="label">
              <span class="label-text">搜索 RowName</span>
            </label>
            <label class="input input-bordered flex items-center gap-2">
              <input ref="searchInputRef" v-model="searchKeyword" type="text" class="grow" placeholder="输入关键字过滤" />
              <kbd class="kbd kbd-sm">Ctrl</kbd>
              <kbd class="kbd kbd-sm">F</kbd>
            </label>
          </div>

          <div class="divider my-0"></div>

          <div class="flex items-center justify-between text-sm text-base-content/70">
            <span>数据条目</span>
            <span>{{ filteredRowNames.length }} / {{ Object.keys(rowNameToRecord).length }}</span>
          </div>
        </div>
        <div class="h-px w-full bg-base-200"></div>
        <div class="scrollbar flex-1 px-4 pb-4 pt-2 min-h-0 overflow-y-auto">
          <div class="flex flex-1 flex-col space-y-2">
            <button
              v-for="row in filteredRowNames"
              :ref="(el) => setRowButtonRef(row, el)"
              class="btn btn-md w-full justify-start items-center text-left normal-case leading-snug"
              :class="{ 'btn-active btn-primary': row === selectedRowName }"
              @click="selectedRowName = row"
            >
              {{ row }}
            </button>
            <p v-if="!filteredRowNames.length" class="text-center text-sm text-base-content/60">
              暂无数据，请先打开 Excel 配置表。
            </p>
          </div>
        </div>
      </aside>

      <section class="card flex flex-1 min-h-0 flex-col overflow-hidden bg-base-100 shadow-md">
        <div class="px-6 pt-6 pb-4 space-y-4">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="card-title text-2xl font-bold">配置详情</h2>
              <p class="text-sm text-base-content/60">
                {{ selectedRowName ? `正在查看 RowName：${selectedRowName}` : '请选择左侧的 RowName 以查看详细配置。' }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <label class="input input-bordered flex items-center gap-2 w-64" :class="{ 'input-disabled opacity-60': !selectedRowName }">
                <input
                  ref="columnSearchInputRef"
                  v-model="columnSearchKeyword"
                  :disabled="!selectedRowName"
                  type="text"
                  class="grow"
                  placeholder="搜索属性"
                  @keydown.enter.prevent="moveToNextColumnMatch"
                />
                <kbd class="kbd kbd-xs">Ctrl</kbd>
                <kbd class="kbd kbd-xs">L</kbd>
              </label>
              <div class="join">
                <button class="btn join-item" :disabled="!selectedRowName" @click="resetEditableRecord">重置</button>
                <button class="btn join-item btn-primary" :disabled="!selectedRowName" @click="saveEditableRecord">保存修改</button>
              </div>
            </div>
          </header>
        </div>

        <div class="scrollbar flex-1 overflow-y-auto px-6 pb-4">
          <div v-if="selectedRowName" class="space-y-4 pt-4">
            <div class="divider my-2"></div>
            <div
              v-for="(value, columnName) in currentRecord"
              :key="columnName"
              :ref="(el) => setColumnInputRef(columnName, el)"
              class="grid grid-cols-[minmax(160px,200px),minmax(0,1fr)] items-center gap-4 column-field-container"
              :class="{ 'bg-primary/10 border border-primary/60 rounded-lg px-3 py-2 -mx-3': columnName === highlightColumnName }"
            >
              <div class="text-sm font-semibold text-base-content/70 truncate" :title="columnName">{{ columnName }}</div>
              <input v-model="editableRecord[columnName]" type="text" class="input input-bordered" />
            </div>
          </div>

          <div v-else class="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-200/60 p-16 text-base-content/60">
            <p>暂无选中条目，请在左侧列表中选择一个 RowName。</p>
          </div>

          <div class="card bg-base-200/60 shadow-inner">
            <div class="card-body space-y-4">
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
                <div class="scrollbar max-h-[420px] overflow-y-auto pr-1">
                  <DynamicObjectForm
                    :class-name="mockClassName"
                    :registry="classRegistry"
                    :subclass-options="subclassOptions"
                    :model-value="mockObjectValue"
                    @update:model-value="(value) => applyNormalizedObject(value as ParsedClassObject)"
                  />
                </div>
                <div class="flex flex-col gap-3">
                  <div class="flex items-center justify-between">
                    <div class="badge badge-outline badge-sm">原始 JSON 文本</div>
                    <button class="btn btn-xs" @click="syncMockObjectValueFromJson">刷新表单</button>
                  </div>
                  <textarea
                    v-model="rawConfigText"
                    class="textarea textarea-bordered h-72 font-mono text-xs"
                    placeholder="粘贴 JSON 配置"
                  ></textarea>
                  <p v-if="parseErrorMessage" class="text-sm text-error">{{ parseErrorMessage }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
