<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import DynamicObjectForm, { type FieldOption } from './components/DynamicObjectForm.vue'
import SearchableDropdown from './components/SearchableDropdown.vue'
import SettingsModal from './components/SettingsModal.vue'
import Toast from './components/Toast.vue'
import ProgressModal from './components/ProgressModal.vue'
import SkeletonLoader from './components/SkeletonLoader.vue'
import CheckValidationModal, { type ValidationErrorItem, type ValidationResult } from './components/CheckValidationModal.vue'
import { loadSettingsFromStorage, saveSettingsToStorage } from './utils/settingsStorage'
import type { ClassRegistry, ClassMetadata as DelegateClassMetadata } from './types/MetaDefine'
import { normalizeClassInstance } from './utils/ClassNormalizer'
import DynamicObjectFormInline from './components/DynamicObjectFormInline.vue'
import { initializeAtomicFields, isAtomicFieldAsync, getAllowedBaseClassesForField as getRemoteAllowedBaseClasses } from './utils/AtomicFieldsHelper'

type RowRecord = Record<string, string>

type WorkbookMeta = {
  sheetName: string
  rowCount: number
}

// 原始的配置数据
const rowNameToRecord = reactive<Record<string, Record<string, string>>>({})
const rowNames = ref<string[]>([])
const columnNames = ref<string[]>([])
const columnDescriptions = reactive<Record<string, string>>({})
const rowNameColumnLabel = ref<string>('RowName')
const selectedRowName = ref<string | null>(null)
const editableRecord = reactive<Record<string, unknown>>({})
const workbookMeta = ref<WorkbookMeta | null>(null)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const isLoading = ref(false)
const searchKeyword = ref('')
const openedFilePath = ref<string | null>(null)
const sheetName = ref<string>('Sheet1')
const sheetList = ref<string[]>([])
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

const initialSettings = loadSettingsFromStorage()
const currentTheme = ref<string>(initialSettings.theme)
const rowButtonRefs = reactive<Record<string, HTMLButtonElement>>({})
const isSettingsModalOpen = ref(false)
const showOnlyAtomicFields = ref(initialSettings.showOnlyAtomicFields)
const isDebugMode = ref(initialSettings.isDebugMode)
const fieldLayoutDirection = ref<'horizontal' | 'vertical'>(initialSettings.fieldLayoutDirection)
const activeMainTab = ref<'config' | 'playground'>('config')

// Remark 字段相关
const remarkFieldName = ref<string | null>(null)

// 进度控件相关
const isProgressVisible = ref(false)
const progressMessage = ref('处理中...')
const progressValue = ref(0)
const progressType = ref<'saving' | 'loading' | 'processing'>('processing')

// Skeleton 加载界面相关
const isSkeletonVisible = ref(true)

// 字段宽度控制
const columnWidths = reactive<Record<string, number>>({})
const draggedColumnName = ref<string | null>(null)
const dragStartX = ref(0)
const dragStartWidth = ref(0)

// 左侧panel宽度控制
const leftPanelWidth = ref(288)
const isDraggingLeftSplit = ref(false)
const leftSplitStartX = ref(0)
const leftSplitStartWidth = ref(288)

type ParsedClassObject = {
  _ClassName: string
  [key: string]: unknown
}

const classRegistry = reactive<ClassRegistry>({})
const subclassOptions = reactive<Record<string, FieldOption[]>>({})
const delegateMetadataError = ref<string | null>(null)
const isDelegateMetadataLoading = ref(false)

const mockJsonObject = reactive<ParsedClassObject>({ _ClassName: '' })
const mockObjectValue = reactive<Record<string, unknown>>({})
const mockClassName = ref<string>(mockJsonObject._ClassName)
const rawConfigText = ref(JSON.stringify(mockJsonObject, null, 2))
const parseErrorMessage = ref<string | null>(null)

// 表达式解析相关
const expressionInput = ref<string>('')
const expressionParseResult = ref<string>('')
const expressionParseError = ref<string | null>(null)

// 条件字段相关
type ConditionFieldInfo = {
  raw: string
  parsed: any
  json: string
  expressionDesc?:string
}
const conditionFieldsMap = reactive<Record<string, Record<string, ConditionFieldInfo>>>({})
const selectedConditionField = ref<string | null>(null)
const selectedConditionFieldData = ref<ConditionFieldInfo | null>(null)
const atomClassSearchKeyword = ref<string>('')
const openAtomClassDropdown = ref<string | null>(null) // 记录哪个字段的下拉框是打开的

// 字段名 -> 允许的基类 映射（缓存）
const fieldAllowedBaseClassesCache = reactive<Record<string, string[]>>({})

const validationResult = reactive<ValidationResult>({
  isOpen: false,
  isChecking: false,
  totalRows: 0,
  totalFields: 0,
  errorCount: 0,
  errors: []
})

let externalExcelListenerDisposer: (() => void) | null = null

/**
 * 根据字段名确定其允许的基类集合
 * 异步版本：优先使用远程配置，降级到本地配置
 */
async function getFieldAllowedBaseClasses(fieldName: string): Promise<string[]> {
  // 检查缓存
  if (fieldAllowedBaseClassesCache[fieldName]) {
    return fieldAllowedBaseClassesCache[fieldName]
  }

  // 使用 helper 中的异步方法获取允许的基类
  let allowed = await getRemoteAllowedBaseClasses(fieldName, sheetName.value, openedFilePath.value || undefined)

  // 如果无匹配规则，返回所有基类
  if (allowed.length === 0) {
    allowed = Object.keys(subclassOptions)
  }

  fieldAllowedBaseClassesCache[fieldName] = allowed
  return allowed
}

function clearClassRegistry() {
  Object.keys(classRegistry).forEach((key) => delete classRegistry[key])
}

function clearSubclassOptions() {
  Object.keys(subclassOptions).forEach((key) => delete subclassOptions[key])
}

/**
 * 格式化 JSON 字符串，支持缩进和美化
 */
function formatJson(parsed: any, indent: number = 2): string {
  try {
    return JSON.stringify(parsed, null, indent)
  } catch (error) {
    console.warn('JSON 格式化失败:', error)
    return ""
  }
}

// function convertDelegateFieldMeta(fieldMeta: DelegateClassMetadata['fields'][number]): FieldMeta {
//   const label = fieldMeta.label ?? fieldMeta.key

//   if (fieldMeta.type === 'object' || fieldMeta.type === 'array') {
//     return {
//       label,
//       type: fieldMeta.type,
//       baseClass: fieldMeta.baseClass ?? 'DelegateBase'
//     }
//   }

//   if ('options' in fieldMeta && Array.isArray(fieldMeta.options)) {
//     const options = fieldMeta.options.map((option) => ({
//       label: option.label,
//       value: String(option.value)
//     }))

//     return {
//       label,
//       type: 'select',
//       options
//     }
//   }

//   return {
//     label,
//     type: fieldMeta.type
//   }
// }

function applyDelegateMetadata(
metadataList: DelegateClassMetadata[], grouped: Record<string, DelegateClassMetadata[]> | undefined, registry: ClassRegistry) {
  clearClassRegistry()
  // metadataList.forEach((classMeta) => {
  //   const fieldsRecord = classMeta.fields.reduce<Record<string, FieldMeta>>((accumulator, fieldMeta) => {
  //     accumulator[fieldMeta.key] = convertDelegateFieldMeta(fieldMeta)
  //     return accumulator
  //   }, {})

    
  //   // classRegistry[classMeta.className] = {
  //   //   displayName: classMeta.displayName ?? classMeta.className,
  //   //   baseClass: classMeta.baseClass,
  //   //   fields: fieldsRecord
  //   // }
  // })

  // 遍历registry
  Object.keys(registry).forEach((key) => {
    classRegistry[key] = registry[key]
  })

  clearSubclassOptions()
  if (grouped && Object.keys(grouped).length > 0) {
    Object.entries(grouped).forEach(([baseClassName, items]) => {
      subclassOptions[baseClassName] = items
        .map((item) => ({
          value: item.className,
          label: item.displayName ?? item.className
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    })
  } else {
    const baseToOptions: Record<string, FieldOption[]> = {}
    metadataList.forEach((classMeta) => {
      (baseToOptions[classMeta.baseClass] ??= []).push({
        value: classMeta.className,
        label: classMeta.displayName ?? classMeta.className
      })
    })
    Object.entries(baseToOptions).forEach(([baseClassName, options]) => {
      subclassOptions[baseClassName] = options.sort((a, b) => a.label.localeCompare(b.label))
    })
  }
}

function resetMockFormStateToClass(className: string) {
  mockJsonObject._ClassName = className
  Object.keys(mockJsonObject).forEach((key) => {
    if (key !== '_ClassName') {
      delete mockJsonObject[key]
    }
  })
  mockClassName.value = className
  syncMockObjectValueFromJson()
}

function resetMockFormStateToEmpty() {
  Object.keys(mockJsonObject).forEach((key) => delete mockJsonObject[key])
  mockJsonObject._ClassName = ''
  mockClassName.value = ''
  syncMockObjectValueFromJson()
}

async function loadDelegateMetadata() {
  const bridge = window.delegateBridge
  if (!bridge) {
    delegateMetadataError.value = '当前环境未暴露 Delegate 元数据接口，请检查 Preload 配置。'
    clearClassRegistry()
    clearSubclassOptions()
    resetMockFormStateToEmpty()
    return
  }

  isDelegateMetadataLoading.value = true
  delegateMetadataError.value = null
  showProgress('正在加载元数据...', 'loading', 10)

  try {
    updateProgress(30)
    const result = await bridge.getMetadata()
    
    updateProgress(50)
    if (!result?.ok || !Array.isArray(result.metadata) || result.metadata.length === 0) {
      throw new Error(result?.error ?? '未获取到有效的 Delegate 元数据。')
    }

    updateProgress(70)
    applyDelegateMetadata(result.metadata, result.grouped ?? {}, result.registry)

    // updateProgress(85)
    // rawConfigText.value = result.defaultJson;

    updateProgress(95)
    syncMockObjectValueFromJson()

    updateProgress(100)
    hideProgress()
    // 加载完成后隐藏 skeleton 界面
    isSkeletonVisible.value = false

  } catch (error) {
    console.error('[delegate metadata]', error)
    delegateMetadataError.value = error instanceof Error ? error.message : '加载 Delegate 元数据失败。'
    clearClassRegistry()
    clearSubclassOptions()
    resetMockFormStateToEmpty()
    hideProgress()
    // 加载失败也要隐藏 skeleton 界面
    isSkeletonVisible.value = false
  } finally {
    isDelegateMetadataLoading.value = false
  }
}

const mockClassOptions = computed<FieldOption[]>(() => {
  const targetBaseClass = classRegistry[mockClassName.value]?.baseClass
  if (!targetBaseClass) {
    return []
  }
  return subclassOptions[targetBaseClass] ?? []
})

function applyNormalizedObject(normalized: ParsedClassObject) {
  rawConfigText.value = JSON.stringify(normalized, null, 2)
  syncMockObjectValueFromJson()
}

async function applyNormalizedObjectByColumnName(normalized: ParsedClassObject, updateColumnName: string) {
  if (selectedRowName.value && window.delegateBridge) {
    try {
      const result = await window.delegateBridge.deParseJsonToExpression({ json: normalized });
      if (result.ok && result.expression) {
        if (!conditionFieldsMap[selectedRowName.value]) {
          conditionFieldsMap[selectedRowName.value] = {}
        }
        conditionFieldsMap[selectedRowName.value][updateColumnName] = {
          raw: result.expression.expression,
          parsed: normalized,
          json: JSON.stringify(normalized, null, 2),
          expressionDesc: result.expression.expressionDesc
        }
        editableRecord[updateColumnName] = result.expression.expression
        
      } else {
        expressionParseError.value = '反向解析失败:' + result.error
        console.error('反向解析失败:', result.error);
      }
    } catch (error) {
      expressionParseError.value = '调用反向解析接口失败:' + error
      console.error('调用反向解析接口失败:', error);
    }
  }
}

/**
 * 处理原子类型选择
 * 当用户从下拉框选择一个原子类型时，创建该类型的默认实例
 * 同时验证选中的类是否属于该字段允许的基类
 */
function handleSelectAtomClass(columnName: string, className: string) {
  if (!className || !selectedRowName.value) {
    return
  }

  // 获取选中的类的元数据
  const classInfo = classRegistry[className]
  if (!classInfo) {
    console.warn(`Class ${className} not found in registry`)
    return
  }

  const json = normalizeClassInstance(className, {}, classRegistry, subclassOptions)
  const jsonObj = JSON.parse(JSON.stringify(json))
  applyNormalizedObjectByColumnName(jsonObj, columnName);
}

function clearAtomicFieldConfig(columnName: string) {
  if (!selectedRowName || !selectedRowName.value) {
    return
  }
  // 清除原子字段配置
  const rowData = conditionFieldsMap[selectedRowName.value]
  if (rowData && rowData[columnName]) {
    rowData[columnName].parsed = undefined
  }
  
  // 清除编辑记录
  editableRecord[columnName] = ''
}

function syncMockObjectValueFromJson() {
  const parsed = JSON.parse(rawConfigText.value) as ParsedClassObject
  parseErrorMessage.value = null
  Object.keys(mockJsonObject).forEach((key) => delete (mockJsonObject as Record<string, unknown>)[key])
  Object.entries(parsed).forEach(([key, value]) => {
    ;(mockJsonObject as Record<string, unknown>)[key] = value
  })
  if (typeof parsed._ClassName === 'string') {
    mockClassName.value = parsed._ClassName
  }

  Object.keys(mockObjectValue).forEach((key) => delete mockObjectValue[key])
  Object.entries(mockJsonObject).forEach(([key, value]) => {
    mockObjectValue[key] = value
  })
  rawConfigText.value = JSON.stringify(mockObjectValue, null, 2)
}

const filteredRowNames = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const allRowNames = rowNames.value
  if (!keyword) {
    return allRowNames
  }
  return allRowNames.filter((rowName) => rowName.toLowerCase().includes(keyword))
})

// 原始的当前选择的记录值
const currentRecord = computed<RowRecord | null>(() => {
  if (!selectedRowName.value) {
    return null
  }
  return rowNameToRecord[selectedRowName.value] ?? null
})

const statusMessage = computed(() => {
  if (delegateMetadataError.value) {
    return `Delegate 元数据加载失败：${delegateMetadataError.value}`
  }
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

const currentRecordColumnCount = computed(() => {
  return currentRecord.value ? Object.keys(currentRecord.value).length : 0
})

/**
 * 获取当前可见的字段列表
 * 考虑 showOnlyAtomicFields 过滤条件
 */
const visibleColumnNames = computed(() => {
  if (!currentRecord.value) {
    return []
  }
  
  const allColumns = Object.keys(currentRecord.value)
  
  if (showOnlyAtomicFields.value) {
    return allColumns.filter((columnName) => conditionFieldSet.value.has(columnName))
  }
  
  return allColumns
})

const currentConditionFields = computed(() => {
  if (!selectedRowName.value) {
    return {}
  }
  return conditionFieldsMap[selectedRowName.value] ?? {}
})

const conditionFieldNames = computed(() => {
  return Object.keys(currentConditionFields.value)
})

const conditionFieldSet = computed(() => new Set(conditionFieldNames.value))

/**
 * 过滤原子类选项（支持搜索）
 * 根据当前打开的字段限制可用的基类
 */
const filteredAtomClassOptions = ref<Record<string, typeof subclassOptions[string]>>({})

// 监听 atomClassSearchKeyword 和 openAtomClassDropdown，更新过滤结果
watch(
  [() => atomClassSearchKeyword.value, () => openAtomClassDropdown.value],
  async () => {
    const keyword = atomClassSearchKeyword.value.trim().toLowerCase()
    const result: Record<string, typeof subclassOptions[string]> = {}

    // 获取当前打开的字段允许的基类
    const currentFieldName = openAtomClassDropdown.value
    const allowedBaseClasses = currentFieldName ? await getFieldAllowedBaseClasses(currentFieldName) : Object.keys(subclassOptions)

    for (const [baseClass, options] of Object.entries(subclassOptions)) {
      // 只包括允许的基类
      if (!allowedBaseClasses.includes(baseClass)) {
        continue
      }

      if (!keyword) {
        result[baseClass] = options
        continue
      }

      const filtered = options.filter(
        (option) =>
          option.label.toLowerCase().includes(keyword) ||
          option.value.toLowerCase().includes(keyword)
      )

      if (filtered.length > 0) {
        result[baseClass] = filtered
      }
    }

    filteredAtomClassOptions.value = result
  }
)

watch(currentRecord, (newRecord) => {
  Object.keys(editableRecord).forEach((key) => delete editableRecord[key])
  if (!newRecord) {
    return
  }
  Object.entries(newRecord).forEach(([columnName, value]) => {
    editableRecord[columnName] = value ?? null
  })
})

function applyTheme(themeName: string) {
  document.documentElement.setAttribute('data-theme', themeName)
}

function startResizeColumn(columnName: string, event: MouseEvent) {
  event.preventDefault()
  draggedColumnName.value = columnName
  dragStartX.value = event.clientX
  dragStartWidth.value = columnWidths[columnName] || 300
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', handleResizeMouseMove)
  document.addEventListener('mouseup', handleResizeMouseUp)
}

function handleResizeMouseMove(event: MouseEvent) {
  if (!draggedColumnName.value) return
  const delta = event.clientX - dragStartX.value
  const newWidth = Math.max(200, dragStartWidth.value + delta)
  columnWidths[draggedColumnName.value] = newWidth
}

function handleResizeMouseUp() {
  draggedColumnName.value = null
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', handleResizeMouseMove)
  document.removeEventListener('mouseup', handleResizeMouseUp)
}

function startResizeLeftPanel(event: MouseEvent) {
  event.preventDefault()
  isDraggingLeftSplit.value = true
  leftSplitStartX.value = event.clientX
  leftSplitStartWidth.value = leftPanelWidth.value
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', handleLeftPanelMouseMove)
  document.addEventListener('mouseup', handleLeftPanelMouseUp)
}

function handleLeftPanelMouseMove(event: MouseEvent) {
  if (!isDraggingLeftSplit.value) return
  const delta = event.clientX - leftSplitStartX.value
  const newWidth = Math.max(200, Math.min(600, leftSplitStartWidth.value + delta))
  leftPanelWidth.value = newWidth
}

function handleLeftPanelMouseUp() {
  isDraggingLeftSplit.value = false
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', handleLeftPanelMouseMove)
  document.removeEventListener('mouseup', handleLeftPanelMouseUp)
}

watch(currentTheme, (newTheme) => {
  applyTheme(newTheme)
  saveSettingsToStorage({
    theme: newTheme,
    showOnlyAtomicFields: showOnlyAtomicFields.value,
    isDebugMode: isDebugMode.value,
    fieldLayoutDirection: fieldLayoutDirection.value
  })
})

watch(showOnlyAtomicFields, (newValue) => {
  saveSettingsToStorage({
    theme: currentTheme.value,
    showOnlyAtomicFields: newValue,
    isDebugMode: isDebugMode.value,
    fieldLayoutDirection: fieldLayoutDirection.value
  })
})

watch(isDebugMode, (newValue) => {
  saveSettingsToStorage({
    theme: currentTheme.value,
    showOnlyAtomicFields: showOnlyAtomicFields.value,
    isDebugMode: newValue,
    fieldLayoutDirection: fieldLayoutDirection.value
  })
})

watch(fieldLayoutDirection, (newValue) => {
  saveSettingsToStorage({
    theme: currentTheme.value,
    showOnlyAtomicFields: showOnlyAtomicFields.value,
    isDebugMode: isDebugMode.value,
    fieldLayoutDirection: newValue
  })
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
    const columnNameList = Object.keys(columnInputRefs)
    const filteredNames: string[] = []
    
    // 异步过滤：判断是否为原子字段
    for (const columnName of columnNameList) {
      const isAtomicOrMatchesKeyword = !showOnlyAtomicFields.value || await isAtomicFieldAsync(columnName, sheetName.value, openedFilePath.value || undefined)
      if (isAtomicOrMatchesKeyword && columnName.toLowerCase().includes(normalizedKeyword)) {
        filteredNames.push(columnName)
      }
    }
    
    matchingColumnNames.value = filteredNames

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

function isConditionField(columnName: string): boolean {
    return columnName.endsWith('.Condition');
}

/**
 * 查找包含"AERemark"标识的字段名
 */
function findRemarkFieldName(): string | null {
    for (const [columnName, description] of Object.entries(columnDescriptions)) {
        if (description && typeof description === 'string' && description.includes('AERemark')) {
            return columnName
        }
    }
    return null
}

/**
 * 获取当前选中行的Remark值
 */
function getRecordRemark(row: string): string | null {
    if (!remarkFieldName.value || !currentRecord.value) {
        return null
    }
    try {
      const record = rowNameToRecord[row];
      const remarkValue = record[remarkFieldName.value]
      return remarkValue && typeof remarkValue === 'string' ? remarkValue.trim() : null
    } catch (error) {
      console.warn('Failed to get record remark:', error)
      return null
    }
}

/**
 * 解析 Atom 表达式
 */
async function parseAtomExpression() {
  const expression = expressionInput.value.trim()
  if (!expression) {
    expressionParseError.value = '请输入表达式'
    return
  }

  if (!window.delegateBridge) {
    expressionParseError.value = '当前环境未暴露 Delegate 接口，请检查配置。'
    return
  }

  try {
    expressionParseError.value = null
    expressionParseResult.value = '解析中...'

    const result = await window.delegateBridge.parseExpression({
      expression
    })

    if (result.ok && result.json) {
      expressionParseResult.value = result.json
      expressionParseError.value = null

      // 解析成功，同时更新 DynamicObjectForm 测试界面
      try {
        const parsedJson = JSON.parse(result.json) as ParsedClassObject
        applyNormalizedObject(parsedJson)
      } catch (parseError) {
        console.warn('Failed to parse JSON result:', parseError)
      }
    } else {
      expressionParseResult.value = ''
      expressionParseError.value = result.error || '表达式解析失败'
    }
  } catch (error) {
    expressionParseResult.value = ''
    expressionParseError.value = error instanceof Error ? error.message : '未知错误'
    console.error('[parseAtomExpression]', error)
  }
}

/**
 * 解析条件字段字符串
 * 遍历记录中的所有字段，识别原子字段（Condition、Action、Task类型）
 * 调用主线程接口逐个解析，返回解析后的JSON字符串
 */
async function parseConditionFieldsFromRecord(record: Record<string, string>): Promise<Record<string, ConditionFieldInfo>> {
  const result: Record<string, ConditionFieldInfo> = {}
  const delegateBridge = window.delegateBridge
  
  if (!delegateBridge) {
    console.warn('delegateBridge not available for parsing condition fields')
    return result
  }

  // 识别原子字段（根据 AtomicFieldsHelper 中的规则判断，优先使用远程配置）
  const fieldNames = Object.keys(record)
  const atomicFieldNames: string[] = []
  for (const fieldName of fieldNames) {
    if (await isAtomicFieldAsync(fieldName, sheetName.value, openedFilePath.value || undefined)) {
      atomicFieldNames.push(fieldName)
    }
  }

  // 逐个字段调用主线程解析接口
  for (const fieldName of atomicFieldNames) {
    const rawValue = record[fieldName]
    if (!rawValue || typeof rawValue !== 'string') {
      result[fieldName] = {
          raw: "",
          parsed: null,
          json: ""
        }
      continue
    }

    try {

      const parseResult = await delegateBridge.parseConditionField({ 
        fieldName, 
        rawValue,
        sheetName: sheetName.value,
        fileName: openedFilePath.value || undefined
      })

      if (parseResult.ok && parseResult.parsed) {
        const deParseResult = await delegateBridge.deParseJsonToExpression({ json: parseResult.parsed });
        result[fieldName] = {
          raw: rawValue,
          parsed: parseResult.parsed,
          json: JSON.stringify(parseResult.parsed),
          expressionDesc: deParseResult.expression?.expressionDesc
        }
      }
      else
      {
        expressionParseError.value = `Failed to parse field ${fieldName}:` + parseResult.error
      }
    } catch (error) {
      expressionParseError.value = error instanceof Error ? `Failed to parse field ${fieldName}:` + error.message : '未知错误'
      console.error(`Failed to parse field ${fieldName}:`, error)
    }
  }

  return result
}

watch(selectedRowName, async (newSelection) => {
  if (!newSelection) {
    selectedConditionField.value = null
    selectedConditionFieldData.value = null
    return
  }
  
  expressionParseError.value = null
  // 延迟加载条件字段
  // if (!conditionFieldsMap[newSelection]) {
    try {
      const record = currentRecord.value
      if (record) {
        const parsedFields = await parseConditionFieldsFromRecord(record)
        if (Object.keys(parsedFields).length > 0) {
          conditionFieldsMap[newSelection] = parsedFields
        }
      }
    } catch (error) {
      console.error('Failed to load condition fields:', error)
    }
  // }

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
  sheetList.value = []
}

async function switchSheet(newSheetName: string) {
  if (!openedFilePath.value) {
    errorMessage.value = '未打开Excel文件'
    return
  }

  if (newSheetName === sheetName.value) {
    return
  }

  errorMessage.value = null
  showProgress('正在加载工作表...', 'loading', 10)

  try {
    updateProgress(30)
    const excelBridge = window.excelBridge
    if (!excelBridge) {
      throw new Error('当前环境未暴露 Excel 能力，请检查 Preload 配置。')
    }

    const result = await excelBridge.loadSheet({
      filePath: openedFilePath.value,
      sheetName: newSheetName
    })

    if (!result.ok) {
      throw new Error(result.error ?? '加载工作表失败')
    }

    updateProgress(50)
    sheetName.value = result.sheetName ?? newSheetName
    columnNames.value = result.columnNames ?? []
    Object.keys(columnDescriptions).forEach((k)=> delete columnDescriptions[k])
    Object.entries(result.columnDescriptions ?? {}).forEach(([k,v])=> columnDescriptions[k]= v || '')
    rowNameColumnLabel.value = result.rowNameColumnName ?? 'RowName'
    
    // 初始化 Remark 字段名
    remarkFieldName.value = findRemarkFieldName()
    
    workbookMeta.value = {
      sheetName: sheetName.value,
      rowCount: result.rowCount ?? (result.rows?.length || 0)
    }

    updateProgress(70)
    Object.keys(rowNameToRecord).forEach((key) => delete rowNameToRecord[key])
    Object.keys(conditionFieldsMap).forEach((key) => delete conditionFieldsMap[key])
    
    updateProgress(80)
    const normalizedRows = (result.rows ?? []).map((row) => ({ ...row }))
    rowNames.value = normalizedRows
      .map((row) => row[rowNameColumnLabel.value] ?? row.RowName)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    
    updateProgress(90)
    normalizedRows.forEach((row) => {
      const rowName = row[rowNameColumnLabel.value] ?? row.RowName
      if (typeof rowName === 'string' && rowName.trim().length > 0) {
        rowNameToRecord[rowName.trim()] = row
      }
    })
    
    updateProgress(95)
    selectedRowName.value = rowNames.value[0] ?? null
    
    updateProgress(100)
    hideProgress()
    showSuccessMessage(`已切换到工作表: ${newSheetName}`)
  } catch (error) {
    hideProgress()
    errorMessage.value = error instanceof Error ? error.message : '加载工作表失败。'
  }
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
  externalExcelListenerDisposer = window.electronAPI?.onOpenExternalExcel?.((filePath) => {
    if (filePath) {
      openWorkbookFromMainProcess({ filePath })
    }
  }) ?? null

  window.addEventListener('keydown', handleKeydown)
  setTimeout(async () => {
    // 初始化原子字段配置系统
    await initializeAtomicFields()
    loadDelegateMetadata()
  }, 0)
  // loadDelegateMetadata()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  externalExcelListenerDisposer?.()
  externalExcelListenerDisposer = null
})

async function openWorkbookFromMainProcess(options?: { filePath?: string }) {
  const excelBridge = window.excelBridge
  if (!excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }

  const targetFilePath = options?.filePath
  const isExternalOpen = typeof targetFilePath === 'string' && targetFilePath.length > 0

  errorMessage.value = null
  showProgress(isExternalOpen ? '正在打开指定的 Excel 文件...' : '正在打开 Excel 文件...', 'loading', 10)

  try {
    updateProgress(20)
    const result = isExternalOpen
      ? await excelBridge.openWorkbookByPath({ filePath: targetFilePath })
      : await excelBridge.openWorkbook()
    
    if (result.canceled) {
      hideProgress()
      return
    }

    updateProgress(30)
    if (result.error) {
      throw new Error(result.error)
    }

    if (!result.rows || !result.rows.length) {
      throw new Error('工作表没有有效的 RowName 数据行。')
    }

    updateProgress(40)
    openedFilePath.value = result.filePath ?? null
    sheetName.value = result.sheetName ?? 'Sheet1'
    sheetList.value = result.sheetList ?? [sheetName.value]
    columnNames.value = result.columnNames ?? []
    Object.keys(columnDescriptions).forEach((k)=> delete columnDescriptions[k])
    Object.entries(result.columnDescriptions ?? {}).forEach(([k,v])=> columnDescriptions[k]= v || '')
    rowNameColumnLabel.value = result.rowNameColumnName ?? 'RowName'
    
    // 初始化 Remark 字段名
    remarkFieldName.value = findRemarkFieldName()
    
    workbookMeta.value = {
      sheetName: sheetName.value,
      rowCount: result.rowCount ?? result.rows.length
    }

    updateProgress(60)
    Object.keys(rowNameToRecord).forEach((key) => delete rowNameToRecord[key])
    Object.keys(conditionFieldsMap).forEach((key) => delete conditionFieldsMap[key])
    
    updateProgress(75)
    const normalizedRows = result.rows.map((row) => ({ ...row }))
    rowNames.value = normalizedRows
      .map((row) => row[rowNameColumnLabel.value] ?? row.RowName)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    
    updateProgress(85)
    normalizedRows.forEach((row) => {
      const rowName = row[rowNameColumnLabel.value] ?? row.RowName
      if (typeof rowName === 'string' && rowName.trim().length > 0) {
        rowNameToRecord[rowName.trim()] = row
      }
    })
    
    updateProgress(95)
    selectedRowName.value = rowNames.value[0] ?? null
    
    updateProgress(100)
    hideProgress()
    const successText = isExternalOpen && result.filePath ? `已打开：${result.filePath}` : 'Excel 文件已成功加载！'
    showSuccessMessage(successText)
  } catch (error) {
    hideProgress()
    errorMessage.value = error instanceof Error ? error.message : '打开 Excel 文件失败。'
    if (!isExternalOpen) {
      clearWorkbookState()
    }
  }
}

async function resetEditableRecord() {
  if (!currentRecord.value) {
    return
  }
  Object.keys(editableRecord).forEach((key) => delete editableRecord[key])
  Object.entries(currentRecord.value).forEach(([columnName, value]) => {
    editableRecord[columnName] = value ?? null
  })
  const parsedFields = await parseConditionFieldsFromRecord(currentRecord.value)
  if (Object.keys(parsedFields).length > 0 && selectedRowName.value) {
    conditionFieldsMap[selectedRowName.value] = parsedFields
  }
}

function mutateRecordValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (error) {
      console.warn('无法序列化条件对象，将使用空字符串', error)
      return ''
    }
  }
  return String(value)
}

function saveEditableRecord() {
  if (!currentRecord.value || !selectedRowName.value) {
    return
  }

  const serializedRecord = Object.entries(editableRecord).reduce<Record<string, string>>((accumulator, [key, value]) => {
    accumulator[key] = mutateRecordValue(value)
    return accumulator
  }, {})

  rowNameToRecord[selectedRowName.value] = serializedRecord
}

function buildRowsForSaving(): RowRecord[] {
  return Object.keys(rowNameToRecord).map((rowName) => ({
    RowName: rowName,
    ...rowNameToRecord[rowName]
  }))
}

/**
 * 显示进度模态框
 */
function showProgress(message: string = '处理中...', type: 'saving' | 'loading' | 'processing' = 'processing', progress: number = 0) {
  isProgressVisible.value = true
  progressMessage.value = message
  progressType.value = type
  progressValue.value = progress
}

/**
 * 更新进度值
 */
function updateProgress(progress: number) {
  progressValue.value = Math.min(100, Math.max(0, progress))
}

/**
 * 隐藏进度模态框
 */
function hideProgress() {
  isProgressVisible.value = false
  progressValue.value = 0
}

/**
 * 显示成功提示信息，3秒后自动消失
 */
function showSuccessMessage(message: string) {
  successMessage.value = message
  setTimeout(() => {
    successMessage.value = null
  }, 3000)
}

async function registerExcelContextMenu() {
  const electronAPI = window.electronAPI
  if (!electronAPI?.registerExcelContextMenu) {
    errorMessage.value = '当前环境不支持注册右键菜单，请检查预加载配置。'
    return
  }

  errorMessage.value = null
  showProgress('正在注册 Excel 右键菜单...', 'processing', 15)

  try {
    updateProgress(40)
    const result = await electronAPI.registerExcelContextMenu()
    if (!result.ok) {
      throw new Error(result.error ?? '注册右键菜单失败')
    }

    updateProgress(100)
    showSuccessMessage('已添加“用此编辑器打开”右键菜单')
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册右键菜单失败'
    errorMessage.value = message
  } finally {
    hideProgress()
  }
}

/**
 * 检查所有原子字段的解析是否有错误
 */
async function checkAllAtomicFieldsValidation() {
  const excelBridge = window.excelBridge
  if (!excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }

  const delegateBridge = window.delegateBridge
  if (!delegateBridge) {
    errorMessage.value = '当前环境未暴露 Delegate 接口，请检查配置。'
    return
  }

  let selectionResult: Awaited<ReturnType<typeof excelBridge.openMultipleWorkbooks>> | null = null

  try {
    selectionResult = await excelBridge.openMultipleWorkbooks()
  } catch (selectionError) {
    console.error('[checkAllAtomicFieldsValidation][select]', selectionError)
    errorMessage.value = selectionError instanceof Error ? selectionError.message : '选择 Excel 文件失败'
    return
  }

  if (!selectionResult || selectionResult.canceled) {
    return
  }

  validationResult.isOpen = true
  validationResult.isChecking = true
  validationResult.errors = []
  validationResult.errorCount = 0
  validationResult.totalFields = 0
  validationResult.totalRows = 0

  const buildContentSnippet = (value: string) => value.substring(0, 100) + (value.length > 100 ? '...' : '')

  try {
    const workbooks = selectionResult.workbooks ?? []
    const errors: ValidationErrorItem[] = []
    const atomicFieldCache = new Map<string, boolean>()

    if (!workbooks.length && !(selectionResult.errors?.length)) {
      validationResult.isOpen = false
      validationResult.isChecking = false
      errorMessage.value = '未选择任何可检查的 Excel 文件'
      return
    }

    const getAtomicFlag = async (fieldName: string, targetSheetName?: string, targetFilePath?: string) => {
      const cacheKey = `${targetFilePath ?? ''}::${targetSheetName ?? ''}::${fieldName}`
      if (atomicFieldCache.has(cacheKey)) {
        return atomicFieldCache.get(cacheKey)!
      }
      const flag = await isAtomicFieldAsync(fieldName, targetSheetName, targetFilePath)
      atomicFieldCache.set(cacheKey, flag)
      return flag
    }

    if (selectionResult.errors?.length) {
      selectionResult.errors.forEach(({ filePath, error }) => {
        errors.push({
          filePath,
          sheetName: undefined,
          rowName: '文件读取失败',
          fieldName: '-',
          error: error ?? '未知错误'
        })
      })
    }

    let totalRowsCount = 0
    let totalFieldsCount = 0

    for (const workbook of workbooks) {
      const sheetErrors = workbook.sheetErrors ?? []
      sheetErrors.forEach(({ sheetName, error }) => {
        errors.push({
          filePath: workbook.filePath,
          sheetName,
          rowName: '工作表解析失败',
          fieldName: '-',
          error
        })
      })

      for (const sheet of workbook.sheets ?? []) {
        const currentSheetName = sheet.sheetName ?? '未命名 Sheet'
        const columnNames = sheet.columnNames ?? []
        if (!columnNames.length) {
          continue
        }

        const atomicColumns: string[] = []
        for (const columnName of columnNames) {
          if (await getAtomicFlag(columnName, currentSheetName, workbook.filePath)) {
            atomicColumns.push(columnName)
          }
        }

        if (!atomicColumns.length) {
          continue
        }

        const rows = sheet.rows ?? []
        const rowNameKey = sheet.rowNameColumnName ?? 'RowName'

        for (const row of rows) {
          totalRowsCount += 1
          totalFieldsCount += atomicColumns.length

          const primaryRowName = typeof row[rowNameKey] === 'string' ? row[rowNameKey].trim() : ''
          const fallbackRowName = typeof row.RowName === 'string' ? row.RowName.trim() : ''
          const rowName = primaryRowName || fallbackRowName || '(未命名 RowName)'

          for (const fieldName of atomicColumns) {
            const rawValue = row[fieldName]
            if (!rawValue || typeof rawValue !== 'string') {
              continue
            }

            try {
              const parseResult = await delegateBridge.parseConditionField({
                fieldName,
                rawValue,
                sheetName: currentSheetName,
                fileName: workbook.filePath
              })

              if (!parseResult.ok || !parseResult.parsed) {
                errors.push({
                  filePath: workbook.filePath,
                  sheetName: currentSheetName,
                  rowName,
                  fieldName,
                  error: parseResult.error || '解析失败',
                  content: buildContentSnippet(rawValue)
                })
              }
            } catch (parseError) {
              errors.push({
                filePath: workbook.filePath,
                sheetName: currentSheetName,
                rowName,
                fieldName,
                error: parseError instanceof Error ? parseError.message : '未知错误',
                content: buildContentSnippet(rawValue)
              })
            }
          }
        }
      }
    }

    validationResult.errors = errors
    validationResult.errorCount = errors.length
    validationResult.totalFields = totalFieldsCount
    validationResult.totalRows = totalRowsCount
  } catch (error) {
    console.error('[checkAllAtomicFieldsValidation]', error)
    errorMessage.value = error instanceof Error ? error.message : '检查失败'
  } finally {
    validationResult.isChecking = false
  }
}

async function saveWorkbookToDisk() {
  // 先保存当前编辑数据
  saveEditableRecord();

  if (!window.excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }
  if (!openedFilePath.value) {
    await saveWorkbookAs()
    return
  }
  
  errorMessage.value = "";
  showProgress('正在保存...', 'saving', 10)
  
  try {
    updateProgress(30)
    const rows = buildRowsForSaving()
    
    updateProgress(60)
    const result = await window.excelBridge.saveWorkbook({
      filePath: openedFilePath.value,
      sheetName: sheetName.value,
      rows
    })
    
    updateProgress(90)
    if (!result.ok) {
      throw new Error(result.error ?? '保存失败')
    }
    
    updateProgress(100)
    hideProgress()
    showSuccessMessage('保存成功！')
  } catch (error) {
    hideProgress()
    errorMessage.value = error instanceof Error ? error.message : '保存 Excel 时失败。'
  }
}

async function saveWorkbookAs() {
  if (!window.excelBridge) {
    errorMessage.value = '当前环境未暴露 Excel 能力，请检查 Preload 配置。'
    return
  }
  
  errorMessage.value = "";
  showProgress('正在保存...', 'saving', 10)
  
  try {
    updateProgress(30)
    const rows = buildRowsForSaving()
    
    updateProgress(60)
    const result = await window.excelBridge.saveWorkbookAs({
      defaultPath: openedFilePath.value ?? undefined,
      sheetName: sheetName.value,
      rows
    })

    if (result.canceled) {
      hideProgress()
      return
    }

    updateProgress(90)
    if (!result.ok) {
      throw new Error(result.error ?? '保存失败')
    }

    openedFilePath.value = result.filePath ?? openedFilePath.value
    updateProgress(100)
    hideProgress()
    showSuccessMessage('保存成功！')
  } catch (error) {
    hideProgress()
    errorMessage.value = error instanceof Error ? error.message : '保存 Excel 时失败。'
  }
}
</script>

<template>
  <div class="flex h-full flex-col bg-base-200 text-base-content" style="zoom: 85fr;">
    <header class="sticky top-0 z-10 border-b border-base-300 bg-base-100 shadow-sm">
      <div class="px-6 py-4 space-y-3">
        <!-- 第一行：打开、保存、另存为按钮 -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="join">
            <button class="btn join-item btn-primary" @click="openWorkbookFromMainProcess">打开 Excel 配置</button>
            <button class="btn join-item" :disabled="!Object.keys(rowNameToRecord).length" @click="saveWorkbookToDisk">保存</button>
            <button class="btn join-item" :disabled="!Object.keys(rowNameToRecord).length" @click="saveWorkbookAs">另存为</button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span v-if="isDelegateMetadataLoading" class="loading loading-spinner text-primary"></span>
            <span v-if="workbookMeta" class="badge badge-outline">{{ sheetName }} · {{ workbookMeta.rowCount }} 行</span>
            <span v-if="openedFilePath" class="badge badge-ghost">{{ openedFilePath }}</span>
          </div>
          <button
            class="btn btn-ghost btn-circle"
            @click="isSettingsModalOpen = true"
            title="打开设置"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        <!-- 分割线 -->
        <div class="divider my-1"></div>

        <!-- 第二行：工具按钮 -->
        <div class="flex flex-wrap items-center gap-3">
          <button 
            class="btn btn-sm btn-ghost gap-2 border border-warning/30"
            @click="checkAllAtomicFieldsValidation"
          >
            检查所有原子配置
          </button>
          <button
            class="btn btn-sm btn-outline gap-2 border border-info/40"
            @click="registerExcelContextMenu"
          >
            加入 Excel 右键菜单
          </button>
        </div>

        <!-- 状态信息 -->
        <div v-if="statusMessage || isLoading" class="flex items-center gap-2">
          <span v-if="statusMessage" class="text-sm" :class="[errorMessage || delegateMetadataError ? 'text-error' : 'text-base-content/60']">
            {{ statusMessage }}
          </span>
          <span v-else-if="isLoading" class="loading loading-spinner text-primary"></span>
        </div>
      </div>
    </header>

    <main class="flex flex-1 min-h-0 gap-0 px-3 py-3 overflow-hidden">
      <aside class="card flex min-h-0 flex-col overflow-hidden bg-base-100 shadow-md" :style="{ width: leftPanelWidth + 'px' }">
        <div class="px-4 pt-3 pb-2 space-y-4">
          <div v-if="sheetList.length > 1" class="form-control">
            <label class="label py-1">
              <span class="label-text text-xs">选择 Sheet</span>
            </label>
            <div class="dropdown w-full">
              <button tabindex="0" class="btn btn-sm btn-outline w-full justify-between">
                {{ sheetName }} <span class="badge badge-sm">{{ sheetList.length }}</span>
              </button>
              <ul tabindex="0" class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-52">
                <li v-for="sheet in sheetList" :key="sheet">
                  <a 
                    :class="{ 'active': sheet === sheetName }"
                    @click="switchSheet(sheet)"
                  >
                    {{ sheet }}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div class="form-control">
            <label class="label py-1">
              <span class="label-text text-xs">搜索 RowName</span>
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
              class="btn btn-md w-full justify-start items-center text-left normal-case leading-tight h-auto py-2"
              :class="{ 'btn-active btn-primary': row === selectedRowName }"
              @click="selectedRowName = row"
            >
            <div class="flex flex-col items-start w-full gap-0">
              <span class="font-semibold truncate">{{ row }}</span>
              <span v-if="getRecordRemark(row)" class="remark-text text-xs w-full">{{ getRecordRemark(row) }}</span>
            </div>
            </button>
            <p v-if="!filteredRowNames.length" class="text-center text-sm text-base-content/60">
              暂无数据，请先打开 Excel 配置表。
            </p>
          </div>
        </div>
      </aside>

      <!-- 分割线 -->
      <div 
        class="w-1 bg-base-300 hover:bg-primary cursor-col-resize transition-colors flex-shrink-0"
        @mousedown="startResizeLeftPanel"
      ></div>

      <section class="card flex flex-1 min-h-0 flex-col overflow-hidden bg-base-100 shadow-md" style="gap: 0.75rem;">
        <div class="px-6 pt-6 pb-4 space-y-4">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="card-title text-2xl font-bold">
                {{ activeMainTab === 'config' ? '配置详情' : '原子游乐场' }}
              </h2>
              <p class="text-sm text-base-content/60">
                <template v-if="activeMainTab === 'config'">
                  {{ selectedRowName ? `正在查看 RowName：${selectedRowName}` : '请选择左侧的 RowName 以查看详细配置。' }}
                </template>
                <template v-else>
                  原子游乐场提供表达式直接解析与对象构建能力，无需打开Excel
                </template>
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <label class="input input-bordered flex items-center gap-2 w-64" :class="{ 'input-disabled opacity-60': !selectedRowName || activeMainTab !== 'config' }">
                <input
                  ref="columnSearchInputRef"
                  v-model="columnSearchKeyword"
                  :disabled="!selectedRowName || activeMainTab !== 'config'"
                  type="text"
                  class="grow"
                  placeholder="搜索属性"
                  @keydown.enter.prevent="moveToNextColumnMatch"
                />
                <kbd class="kbd kbd-xs">Ctrl</kbd>
                <kbd class="kbd kbd-xs">L</kbd>
              </label>
              <div class="join">
                <button class="btn join-item" :disabled="!selectedRowName || activeMainTab !== 'config'" @click="resetEditableRecord">重置</button>
                <!-- <button class="btn join-item btn-primary" :disabled="!selectedRowName" @click="saveEditableRecord">保存修改</button> -->
              </div>
            </div>
          </header>
          <div class="flex flex-wrap items-center gap-2">
            <div class="join">
              <button
                type="button"
                class="btn btn-sm join-item"
                :class="activeMainTab === 'config' ? 'btn-primary' : 'btn-outline'"
                @click="activeMainTab = 'config'"
              >
                配置详情
              </button>
              <button
                type="button"
                class="btn btn-sm join-item"
                :class="activeMainTab === 'playground' ? 'btn-primary' : 'btn-outline'"
                @click="activeMainTab = 'playground'"
              >
                原子游乐场
              </button>
            </div>
          </div>
          <p v-if="expressionParseError" class="text-sm text-error">
            {{ expressionParseError }}
          </p>
        </div>

        <div class="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div v-if="activeMainTab === 'playground'" class="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
            <div class="divider my-">表达式解析器</div>
            <div class="form-control gap-2">
              <label class="label">
                <span class="label-text">输入表达式</span>
              </label>
              <div class="flex gap-2">
                <textarea
                  v-model="expressionInput"
                  class="textarea textarea-bordered font-mono text-xs flex-1"
                  placeholder="输入 Atom 表达式，例如: GetCombatTime() > 5"
                  rows="4"
                ></textarea>
                <div class="flex flex-col gap-2">
                  <button
                    class="btn btn-primary btn-sm"
                    @click="parseAtomExpression"
                    :disabled="!expressionInput.trim()"
                  >
                    刷新解析
                  </button>
                  <button
                    class="btn btn-outline btn-sm"
                    @click="expressionInput = ''; expressionParseResult = ''; expressionParseError = null"
                  >
                    清空
                  </button>
                </div>
              </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
              <div class="form-control gap-2">
                <label class="label">
                  <span class="label-text">解析结果 (JSON)</span>
                </label>
                <textarea
                  v-if="isDebugMode"
                  v-model="expressionParseResult"
                  class="textarea textarea-bordered font-mono text-xs resize"
                  placeholder="解析结果将在此显示"
                  readonly
                ></textarea>
                <p v-else class="text-sm text-base-content/60">开启调试模式以查看解析结果的 JSON 结构</p>
                
              </div>
            </div>

            <div class="divider my-2">对象表单与 JSON</div>

            <!-- 对象表单与 JSON 编辑 -->
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
              <div class="scrollbar max-h-[420px] overflow-y-auto pr-1">
                <DynamicObjectFormInline
                  :class-name="mockClassName"
                  :registry="classRegistry"
                  :subclass-options="subclassOptions"
                  :model-value="mockObjectValue"
                  @update:model-value="(value) => applyNormalizedObject(value as ParsedClassObject)"
                />
              </div>
            </div>
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
            </div>
          </div>

          <div v-else :class="fieldLayoutDirection === 'horizontal' ? 'flex-1 overflow-x-auto px-6 pb-4 min-h-0' : 'flex-1 overflow-y-auto px-6 pb-4 min-h-0'">
            <div v-if="selectedRowName" >
              <div class="divider my-0"></div>
              <div :class="fieldLayoutDirection === 'horizontal' ? 'flex gap-0 min-w-min pb-4 min-h-[2000px]' : 'flex flex-col gap-3 pb-4'">
                <template v-for="(value, columnName, index) in currentRecord" :key="columnName">
                  <div
                    v-show="!showOnlyAtomicFields || conditionFieldSet.has(columnName)"
                    :ref="(el) => setColumnInputRef(columnName, el)"
                    :class="[
                      'column-field-container rounded-lg px-3 py-2 transition-all duration-150 cursor-pointer border relative overflow-hidden',
                      fieldLayoutDirection === 'horizontal' ? 'flex-shrink-0' : '',
                      { 'bg-primary/10 border-primary/60': columnName === highlightColumnName, 'border-base-300 hover:border-base-400': columnName !== highlightColumnName }
                    ]"
                    :style="fieldLayoutDirection === 'horizontal' ? { width: (columnWidths[columnName] || 300) + 'px' } : {}"
                    >
                    <div class="text-sm font-semibold text-base-content/70 truncate mb-1" :title="columnName">
                      {{ columnName }}
                      <!-- 如果已有配置，显示清除按钮 -->
                      <button
                        v-if="conditionFieldsMap[selectedRowName]?.[columnName]?.parsed"
                        type="button"
                        class="btn btn-xs btn-outline btn-error ml-2"
                        @click="clearAtomicFieldConfig(columnName)"
                        title="清除原子配置"
                      >
                        清除配置
                      </button>
                    </div>
                    <p class="text-xs text-base-content/50 mb-2 min-h-4" :title="columnDescriptions[columnName] || ''">
                      {{ columnDescriptions[columnName] || '' }}
                    </p>
                    <template v-if="conditionFieldSet.has(columnName)">
                      <div class="space-y-2">
                        <SearchableDropdown
                          v-if="!conditionFieldsMap[selectedRowName]?.[columnName]?.parsed"
                          :options="filteredAtomClassOptions"
                          :search-keyword="atomClassSearchKeyword"
                          :open="openAtomClassDropdown === columnName"
                          :registry="classRegistry"
                          placeholder="搜索原子类型..."
                          @update:search-keyword="atomClassSearchKeyword = $event"
                          @update:open="openAtomClassDropdown = $event ? columnName : null"
                          @select="(value, option) => handleSelectAtomClass(columnName, value)"
                        />
                      </div>
                    
                      <!-- 如果已有配置，显示详细编辑界面 -->
                      <template v-if="conditionFieldsMap[selectedRowName]?.[columnName]?.parsed">
                        <div class="space-y-2">
                          <div>
                            <label class="label">
                              <span class="label-text text-sm font-semibold">表达式</span>
                            </label>
                            <input
                              :value="editableRecord[columnName] as string"
                              readonly
                              type="text"
                              class="input input-bordered input-sm font-mono text-xs w-full"
                            />
                            <p v-if="conditionFieldsMap[selectedRowName]?.[columnName]?.expressionDesc" class="text-xs text-base-content/60 mt-1 leading-relaxed">
                              <span class="font-semibold text-base-content/80">功能描述：</span>{{ conditionFieldsMap[selectedRowName][columnName].expressionDesc }}
                            </p>
                          </div>
                        
                          <div v-if="isDebugMode">
                            <label class="label">
                              <span class="label-text text-sm font-semibold">解析后 JSON</span>
                            </label>
                            <textarea
                              :value="formatJson(conditionFieldsMap[selectedRowName][columnName]?.parsed)"
                              readonly
                              class="textarea textarea-bordered textarea-sm h-32 font-mono text-xs resize"
                            ></textarea>
                          </div>
                        </div> 
                        <DynamicObjectForm
                          :class-name="((conditionFieldsMap[selectedRowName][columnName]?.parsed)?. _ClassName as string) || 'UnknownCondition'"
                          :registry="classRegistry"
                          :subclass-options="subclassOptions"
                          :model-value="(conditionFieldsMap[selectedRowName][columnName]?.parsed) as Record<string, unknown>"
                          @update:model-value="(value) => applyNormalizedObjectByColumnName(value as ParsedClassObject, columnName)"
                        />
                      </template>
                      
                    </template>
                    <template v-else>
                        <input v-model="editableRecord[columnName]" type="text" class="input input-bordered" />
                    </template>
                  </div>
                  <!-- Split 拖动控件 -->
                  <div
                  v-if="visibleColumnNames.indexOf(columnName) < visibleColumnNames.length && (!showOnlyAtomicFields || conditionFieldSet.has(columnName))"
                  class="w-1 bg-base-300 hover:bg-primary cursor-col-resize flex-shrink-0 transition-colors"
                  @mousedown="startResizeColumn(columnName, $event)"
                  :style="{ backgroundColor: draggedColumnName === columnName ? 'var(--fallback-p,oklch(53.95% 0.1624 275.8))' : '' }"
                  ></div>
                </template>
                <!-- 最后一个字段右边的空白区域 -->
                <div class="w-32 flex-shrink-0"></div>
              </div>
            </div>
            <div v-else class="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-200/60 p-16 text-base-content/60">
              <p>暂无选中条目，请在左侧列表中选择一个 RowName。</p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <SettingsModal
      :is-open="isSettingsModalOpen"
      :current-theme="currentTheme"
      :show-only-atomic-fields="showOnlyAtomicFields"
      :is-debug-mode="isDebugMode"
      :field-layout-direction="fieldLayoutDirection"
      :theme-options="themeOptions"
      @update:is-open="isSettingsModalOpen = $event"
      @update:current-theme="currentTheme = $event"
      @update:show-only-atomic-fields="showOnlyAtomicFields = $event"
      @update:is-debug-mode="isDebugMode = $event"
      @update:field-layout-direction="fieldLayoutDirection = $event"
    />

    <CheckValidationModal
      :result="validationResult"
      @update:isOpen="validationResult.isOpen = $event"
    />

    <!-- Skeleton 加载界面 -->
    <SkeletonLoader :is-visible="isSkeletonVisible" />

    <!-- 保存进度控件 -->
    <ProgressModal
      :is-visible="isProgressVisible"
      :message="progressMessage"
      :progress="progressValue"
      :type="progressType"
    />

    <!-- 保存成功提示 -->
    <Toast
      :message="successMessage"
      type="success"
    />
  </div>
</template>

<style scoped>
/* 拖动时禁用文本选择 */
:global(body.resizing) {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 分割条悬停效果 */
.cursor-col-resize {
  cursor: col-resize;
}

/* Remark 文本 - 严格限制两行 */
.remark-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  line-height: 1.4;
  max-height: 2.8em;
}
</style>
