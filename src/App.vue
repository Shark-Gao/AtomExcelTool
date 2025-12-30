<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import DynamicObjectForm, { type FieldOption } from './components/DynamicObjectForm.vue'
import SearchableAtomSelect from './components/SearchableAtomSelect.vue'
import SettingsModal from './components/SettingsModal.vue'
import Toast from './components/Toast.vue'
import ProgressModal from './components/ProgressModal.vue'
import SkeletonLoader from './components/SkeletonLoader.vue'
import CheckValidationModal, { type ValidationErrorItem, type ValidationResult } from './components/CheckValidationModal.vue'
import CodeEditor from './components/CodeEditor.vue'
import AtomFieldsConfigEditor from './components/AtomFieldsConfigEditor.vue'
import { loadSettingsFromStorage, saveSettingsToStorage } from './utils/settingsStorage'
import type { ClassRegistry, ClassMetadata as DelegateClassMetadata } from './types/MetaDefine'
import { normalizeClassInstance } from './utils/ClassNormalizer'

import { initializeAtomicFields, isAtomicFieldAsync, getAllowedBaseClassesForField as getRemoteAllowedBaseClasses } from './utils/AtomicFieldsHelper'

// 原子字段配置类型定义
interface AtomFieldsConfig {
  description: string
  fileLocation: string
  configRulePriority: string[]
  deploymentNote: string
  headerRowConfig: {
    description: string
    files: Array<{
      xlsxFile: string
      sheetName: string
      headerRowNumber: number
      dataStartRow?: number
      descriptionRow?: number
    }>
  }
  defaultRules: {
    suffixRules: Array<{
      value: string
      baseClass: string
      allowCombination: boolean
    }>
    prefixRules: Array<{
      value: string
      baseClass: string
      allowCombination: boolean
    }>
    exactFieldNames: Array<{
      value: string
      baseClass: string
      allowCombination: boolean
    }>
  }
  SpecificFieldNames: Array<{
    description: string
    sheetName: string
    xlsxFile: string | null
    suffixRules: Array<{
      value: string
      baseClass: string
      allowCombination: boolean
    }>
    prefixRules: Array<{
      value: string
      baseClass: string
      allowCombination: boolean
    }>
    exactFieldNames: Array<{
      value: string
      baseClass: string
      allowCombination: boolean
    }>
  }>
}

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

// 原子字段配置编辑器相关
const isAtomFieldsConfigEditorOpen = ref(false)
const atomFieldsConfig = ref<AtomFieldsConfig | null>(null)

// 虚拟滚动相关
const rowListContainerRef = ref<HTMLDivElement | null>(null)
const virtualScrollTop = ref(0)
const ROW_ITEM_HEIGHT = 44 // 每个行项目的估计高度（包含 space-y-2 的间距）
const VIRTUAL_BUFFER = 5 // 上下缓冲区的额外渲染数量
const showOnlyAtomicFields = ref(initialSettings.showOnlyAtomicFields)
const isDebugMode = ref(initialSettings.isDebugMode)
const fieldLayoutDirection = ref<'horizontal' | 'vertical'>(initialSettings.fieldLayoutDirection)
const activeMainTab = ref<'config' | 'playground'>('config')

// 全局搜索相关
const globalSearchVisible = ref(false)
const globalSearchKeyword = ref('')
const globalSearchInputRef = ref<HTMLInputElement | null>(null)
const globalSearchMatches = ref<Range[]>([])
const globalSearchInputMatches = ref<HTMLElement[]>([]) // 输入框匹配
const globalSearchCurrentIndex = ref(0)
const globalSearchTotalCount = computed(() => globalSearchMatches.value.length + globalSearchInputMatches.value.length)

// Remark 字段相关
const remarkFieldName = ref<string | null>(null)

// RowName 右键菜单相关
const rowContextMenu = reactive<{
  visible: boolean
  x: number
  y: number
  targetRowName: string | null
}>({
  visible: false,
  x: 0,
  y: 0,
  targetRowName: null
})
const copiedRowRecord = ref<Record<string, string> | null>(null)

// RowName 重命名相关
const renamingRowName = ref<string | null>(null)
const renameInputValue = ref<string>('')
const renameInputRef = ref<HTMLInputElement | null>(null)

// 进度控件相关
const isProgressVisible = ref(false)
const progressMessage = ref('处理中...')
const progressValue = ref(0)
const progressType = ref<'saving' | 'loading' | 'processing'>('processing')

// Skeleton 加载界面相关
const isSkeletonVisible = ref(true)

// 自动保存相关
let autoSaveTimer: ReturnType<typeof setInterval> | null = null
const lastAutoSaveTime = ref<Date | null>(null)
const autoSaveEnabled = ref(initialSettings.autoSaveEnabled)
const autoSaveInterval = ref(initialSettings.autoSaveInterval)

// 字段宽度控制
const columnWidths = reactive<Record<string, number>>({})
const draggedColumnName = ref<string | null>(null)
const dragStartX = ref(0)
const dragStartWidth = ref(0)
const MIN_COLUMN_WIDTH = 200
const MAX_COLUMN_WIDTH = 800
const DEFAULT_COLUMN_WIDTH = 300

// 计算文本宽度的辅助函数
function measureTextWidth(text: string, fontSize: number = 12, fontFamily: string = 'monospace'): number {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return 0
  context.font = `${fontSize}px ${fontFamily}`
  return context.measureText(text).width
}

// 计算单个字段的初始宽度
function calculateColumnWidth(columnName: string, value: string | undefined): number {
  // 基础宽度：字段名宽度 + padding
  const columnNameWidth = measureTextWidth(columnName, 14, 'sans-serif') + 100 // 加上清除按钮等空间
  
  // 内容宽度：表达式文本宽度
  const contentWidth = value ? measureTextWidth(value, 12, 'monospace') + 40 : 0 // padding
  
  // 描述宽度
  const descWidth = columnDescriptions[columnName] ? measureTextWidth(columnDescriptions[columnName], 12, 'sans-serif') + 40 : 0
  
  // 取最大值，并限制在范围内
  const calculatedWidth = Math.max(columnNameWidth, contentWidth, descWidth, MIN_COLUMN_WIDTH)
  return Math.min(calculatedWidth, MAX_COLUMN_WIDTH)
}

// 初始化所有字段的宽度
function initializeColumnWidths(record: Record<string, string>) {
  for (const [columnName, value] of Object.entries(record)) {
    // 只有未设置过宽度的字段才初始化
    if (!columnWidths[columnName]) {
      columnWidths[columnName] = calculateColumnWidth(columnName, value)
    }
  }
}

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

// 代码编辑空间相关
const codeEditorInput = ref<string>(`// TypeScript 代码编辑空间
// 输入函数式程序代码，点击解析生成原子UI控件

GetCombatTime() > 5 
`)
const codeEditorParseResult = ref<string>('')
const codeEditorParseError = ref<string | null>(null)
const codeEditorRef = ref<InstanceType<typeof CodeEditor> | null>(null)

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
const selectedAtomClassByField = reactive<Record<string, string>>({}) // 每个字段选中的原子类

// 表达式编辑相关
const expressionEditState = reactive<Record<string, { 
  value: string
  error: string | null
  isParsing: boolean
  debounceTimer: ReturnType<typeof setTimeout> | null
}>>({})
const EXPRESSION_PARSE_DEBOUNCE = 800 // 防抖延迟 ms

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
    console.warn('JSON format failed:', error)
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
          label: item.displayName ?? item.className,
          funcName: item.funcName
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    })
  } else {
    const baseToOptions: Record<string, FieldOption[]> = {}
    metadataList.forEach((classMeta) => {
      (baseToOptions[classMeta.baseClass] ??= []).push({
        value: classMeta.className,
        label: classMeta.displayName ?? classMeta.className,
        funcName: classMeta.funcName
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
        console.error('Reverse parse failed:', result.error);
      }
    } catch (error) {
      expressionParseError.value = '调用反向解析接口失败:' + error
      console.error('Reverse parse API call failed:', error);
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
  
  // 清除表达式编辑状态
  if (expressionEditState[columnName]) {
    if (expressionEditState[columnName].debounceTimer) {
      clearTimeout(expressionEditState[columnName].debounceTimer)
    }
    delete expressionEditState[columnName]
  }
}

// 获取表达式编辑状态
function getExpressionEditState(columnName: string) {
  if (!expressionEditState[columnName]) {
    expressionEditState[columnName] = {
      value: (editableRecord[columnName] as string) ?? '',
      error: null,
      isParsing: false,
      debounceTimer: null
    }
  }
  return expressionEditState[columnName]
}

// 处理表达式输入变化（带防抖）
function handleExpressionInput(columnName: string, newValue: string) {
  const state = getExpressionEditState(columnName)
  state.value = newValue
  state.error = null
  
  // 清除之前的定时器
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
  }
  
  // 如果输入为空，直接清除
  if (!newValue.trim()) {
    editableRecord[columnName] = ''
    if (selectedRowName.value && conditionFieldsMap[selectedRowName.value]?.[columnName]) {
      conditionFieldsMap[selectedRowName.value][columnName].parsed = undefined
      conditionFieldsMap[selectedRowName.value][columnName].raw = ''
      conditionFieldsMap[selectedRowName.value][columnName].json = ''
      conditionFieldsMap[selectedRowName.value][columnName].expressionDesc = undefined
    }
    return
  }
  
  // 设置防抖定时器
  state.debounceTimer = setTimeout(() => {
    parseExpressionForField(columnName, newValue)
  }, EXPRESSION_PARSE_DEBOUNCE)
}

// 解析单个字段的表达式
async function parseExpressionForField(columnName: string, expression: string) {
  const state = getExpressionEditState(columnName)
  const delegateBridge = window.delegateBridge
  
  if (!delegateBridge) {
    state.error = 'delegateBridge 不可用'
    return
  }
  
  state.isParsing = true
  state.error = null
  
  try {
    const parseResult = await delegateBridge.parseConditionField({
      fieldName: columnName,
      rawValue: expression,
      sheetName: sheetName.value,
      fileName: openedFilePath.value || undefined
    })
    
    if (parseResult.ok && parseResult.parsed) {
      // 解析成功，更新数据
      const deParseResult = await delegateBridge.deParseJsonToExpression({ json: parseResult.parsed })
      
      if (selectedRowName.value) {
        if (!conditionFieldsMap[selectedRowName.value]) {
          conditionFieldsMap[selectedRowName.value] = {}
        }
        conditionFieldsMap[selectedRowName.value][columnName] = {
          raw: expression,
          parsed: parseResult.parsed,
          json: JSON.stringify(parseResult.parsed),
          expressionDesc: deParseResult.expression?.expressionDesc
        }
      }
      
      // 更新 editableRecord
      editableRecord[columnName] = expression
      state.error = null
    } else {
      state.error = parseResult.error || '解析失败'
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : '解析出错'
    console.error(`Failed to parse expression for ${columnName}:`, error)
  } finally {
    state.isParsing = false
  }
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

// 虚拟滚动计算属性
const virtualScrollInfo = computed(() => {
  const containerHeight = rowListContainerRef.value?.clientHeight ?? 400
  const totalItems = filteredRowNames.value.length
  const totalHeight = totalItems * ROW_ITEM_HEIGHT
  const scrollTop = virtualScrollTop.value
  
  // 计算可见范围
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_ITEM_HEIGHT) - VIRTUAL_BUFFER)
  const visibleCount = Math.ceil(containerHeight / ROW_ITEM_HEIGHT) + VIRTUAL_BUFFER * 2
  const endIndex = Math.min(totalItems, startIndex + visibleCount)
  
  return {
    totalHeight,
    startIndex,
    endIndex,
    offsetY: startIndex * ROW_ITEM_HEIGHT
  }
})

const visibleRowNames = computed(() => {
  const { startIndex, endIndex } = virtualScrollInfo.value
  return filteredRowNames.value.slice(startIndex, endIndex)
})

function onRowListScroll(event: Event) {
  const target = event.target as HTMLDivElement
  virtualScrollTop.value = target.scrollTop
}

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

// 按字段名缓存扁平化的原子类选项
const flatAtomClassOptionsByField = reactive<Record<string, FieldOption[]>>({})

// 获取某字段的扁平化原子类选项
async function getFlatAtomClassOptions(fieldName: string): Promise<FieldOption[]> {
  const allowedBaseClasses = await getFieldAllowedBaseClasses(fieldName)
  const result: FieldOption[] = []
  for (const baseClass of allowedBaseClasses) {
    const options = subclassOptions[baseClass] ?? []
    result.push(...options)
  }
  return result
}

// 当字段变化时更新扁平化选项
watch(
  () => conditionFieldNames.value,
  async (fieldNames) => {
    for (const fieldName of fieldNames) {
      if (!flatAtomClassOptionsByField[fieldName]) {
        flatAtomClassOptionsByField[fieldName] = await getFlatAtomClassOptions(fieldName)
      }
    }
  },
  { immediate: true }
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
  dragStartWidth.value = columnWidths[columnName] || DEFAULT_COLUMN_WIDTH
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', handleResizeMouseMove)
  document.addEventListener('mouseup', handleResizeMouseUp)
}

function handleResizeMouseMove(event: MouseEvent) {
  if (!draggedColumnName.value) return
  const delta = event.clientX - dragStartX.value
  const newWidth = Math.max(100, dragStartWidth.value + delta) // 只保留最小 100px 防止完全消失
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
    fieldLayoutDirection: fieldLayoutDirection.value,
    autoSaveEnabled: autoSaveEnabled.value,
    autoSaveInterval: autoSaveInterval.value
  })
})

watch(showOnlyAtomicFields, (newValue) => {
  saveSettingsToStorage({
    theme: currentTheme.value,
    showOnlyAtomicFields: newValue,
    isDebugMode: isDebugMode.value,
    fieldLayoutDirection: fieldLayoutDirection.value,
    autoSaveEnabled: autoSaveEnabled.value,
    autoSaveInterval: autoSaveInterval.value
  })
})

watch(isDebugMode, (newValue) => {
  saveSettingsToStorage({
    theme: currentTheme.value,
    showOnlyAtomicFields: showOnlyAtomicFields.value,
    isDebugMode: newValue,
    fieldLayoutDirection: fieldLayoutDirection.value,
    autoSaveEnabled: autoSaveEnabled.value,
    autoSaveInterval: autoSaveInterval.value
  })
})

watch(fieldLayoutDirection, (newValue) => {
  saveSettingsToStorage({
    theme: currentTheme.value,
    showOnlyAtomicFields: showOnlyAtomicFields.value,
    isDebugMode: isDebugMode.value,
    fieldLayoutDirection: newValue,
    autoSaveEnabled: autoSaveEnabled.value,
    autoSaveInterval: autoSaveInterval.value
  })
})

watch(autoSaveEnabled, (newValue) => {
  saveSettingsToStorage({
    theme: currentTheme.value,
    showOnlyAtomicFields: showOnlyAtomicFields.value,
    isDebugMode: isDebugMode.value,
    fieldLayoutDirection: fieldLayoutDirection.value,
    autoSaveEnabled: newValue,
    autoSaveInterval: autoSaveInterval.value
  })
  // 根据开关状态启动或停止自动保存
  if (newValue) {
    startAutoSave()
  } else {
    stopAutoSave()
  }
})

watch(autoSaveInterval, (newValue) => {
  saveSettingsToStorage({
    theme: currentTheme.value,
    showOnlyAtomicFields: showOnlyAtomicFields.value,
    isDebugMode: isDebugMode.value,
    fieldLayoutDirection: fieldLayoutDirection.value,
    autoSaveEnabled: autoSaveEnabled.value,
    autoSaveInterval: newValue
  })
  // 如果自动保存已启用，重启定时器以应用新间隔
  if (autoSaveEnabled.value) {
    startAutoSave()
  }
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
 * 解析代码编辑器中的 TypeScript 代码
 * 从代码中提取表达式并解析生成原子UI控件
 */
async function parseCodeEditorContent() {
  const code = codeEditorInput.value.trim()
  if (!code) {
    codeEditorParseError.value = '请输入代码'
    return
  }

  if (!window.delegateBridge) {
    codeEditorParseError.value = '当前环境未暴露 Delegate 接口，请检查配置。'
    return
  }

  try {
    codeEditorParseError.value = null
    codeEditorParseResult.value = '解析中...'

    // 从代码中提取 return 语句后的表达式
    // 支持多种格式：
    // 1. return expression
    // 2. 直接的表达式（如果没有 return）
    let expression = code

    // 尝试提取 return 语句中的表达式
    const returnMatch = code.match(/return\s+(.+?)(?:;|\n|$)/s)
    if (returnMatch) {
      expression = returnMatch[1].trim()
    } else {
      // 如果没有 return，尝试提取最后一个非注释行作为表达式
      const lines = code.split('\n').filter(line => {
        const trimmed = line.trim()
        return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')
      })
      if (lines.length > 0) {
        expression = lines[lines.length - 1].trim().replace(/;$/, '')
      }
    }

    // 移除可能的分号
    expression = expression.replace(/;$/, '').trim()

    if (!expression) {
      codeEditorParseError.value = '未能从代码中提取有效表达式'
      codeEditorParseResult.value = ''
      return
    }

    const result = await window.delegateBridge.parseExpression({
      expression
    })

    if (result.ok && result.json) {
      codeEditorParseResult.value = result.json
      codeEditorParseError.value = null

      // 解析成功，同时更新 DynamicObjectForm 测试界面
      try {
        const parsedJson = JSON.parse(result.json) as ParsedClassObject
        applyNormalizedObject(parsedJson)
      } catch (parseError) {
        console.warn('Failed to parse JSON result:', parseError)
      }
    } else {
      codeEditorParseResult.value = ''
      codeEditorParseError.value = result.error || '代码解析失败'
    }
  } catch (error) {
    codeEditorParseResult.value = ''
    codeEditorParseError.value = error instanceof Error ? error.message : '未知错误'
    console.error('[parseCodeEditorContent]', error)
  }
}

/**
 * 清空代码编辑器
 */
function clearCodeEditor() {
  codeEditorInput.value = ''
  codeEditorParseResult.value = ''
  codeEditorParseError.value = null
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
        // 初始化字段宽度
        initializeColumnWidths(record)
        
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
  // 搜索结果变化时重置虚拟滚动位置
  virtualScrollTop.value = 0
  if (rowListContainerRef.value) {
    rowListContainerRef.value.scrollTop = 0
  }
  
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
  if (!selectedRowName.value || !rowListContainerRef.value) {
    return
  }
  
  // 虚拟滚动：先计算目标位置并滚动容器
  const index = filteredRowNames.value.indexOf(selectedRowName.value)
  if (index === -1) {
    return
  }
  
  const targetScrollTop = index * ROW_ITEM_HEIGHT
  const containerHeight = rowListContainerRef.value.clientHeight
  const currentScrollTop = rowListContainerRef.value.scrollTop
  
  // 检查目标是否在可视区域内
  if (targetScrollTop < currentScrollTop || targetScrollTop > currentScrollTop + containerHeight - ROW_ITEM_HEIGHT) {
    // 滚动到目标位置（居中显示）
    rowListContainerRef.value.scrollTop = Math.max(0, targetScrollTop - containerHeight / 2 + ROW_ITEM_HEIGHT / 2)
  }
  
  // 等待虚拟滚动更新后，再尝试使用原生 scrollIntoView 微调
  nextTick(() => {
    const button = rowButtonRefs[selectedRowName.value!]
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto', ...options })
  })
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
    openGlobalSearch()
  }
  // ESC 关闭全局搜索
  if (event.key === 'Escape' && globalSearchVisible.value) {
    closeGlobalSearch()
  }
  // ESC 关闭右键菜单
  if (event.key === 'Escape' && rowContextMenu.visible) {
    closeRowContextMenu()
  }
}

// RowName 右键菜单功能
function openRowContextMenu(event: MouseEvent, rowName: string) {
  event.preventDefault()
  
  // 菜单尺寸估算（与 CSS 中的 min-w-[180px] 对应）
  const menuWidth = 200
  const menuHeight = 220 // 估算菜单高度
  
  let x = event.clientX
  let y = event.clientY
  
  // 检查是否超出右边界
  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 8
  }
  
  // 检查是否超出下边界，超出则显示在上面
  if (y + menuHeight > window.innerHeight) {
    y = Math.max(8, event.clientY - menuHeight)
  }
  
  rowContextMenu.visible = true
  rowContextMenu.x = x
  rowContextMenu.y = y
  rowContextMenu.targetRowName = rowName
}

function closeRowContextMenu() {
  rowContextMenu.visible = false
  rowContextMenu.targetRowName = null
}

function handleClickOutsideContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.row-context-menu')) {
    closeRowContextMenu()
  }
}

/**
 * 复制整条配置内容
 */
function copyRowRecord() {
  if (!rowContextMenu.targetRowName) return
  
  const record = rowNameToRecord[rowContextMenu.targetRowName]
  if (record) {
    // 深拷贝记录
    copiedRowRecord.value = JSON.parse(JSON.stringify(record))
    showSuccessMessage(`已复制配置: ${rowContextMenu.targetRowName}`)
  }
  closeRowContextMenu()
}

/**
 * 复制并创建一条新配置（直接基于当前右键的行）
 */
function duplicateRow() {
  if (!rowContextMenu.targetRowName) return
  
  const sourceRecord = rowNameToRecord[rowContextMenu.targetRowName]
  if (!sourceRecord) return
  
  // 生成新的 RowName
  const baseRowName = rowContextMenu.targetRowName
  let newRowName = `${baseRowName}_Copy`
  let counter = 1
  
  // 确保 RowName 唯一
  while (rowNames.value.includes(newRowName)) {
    newRowName = `${baseRowName}_Copy${counter}`
    counter++
  }
  
  // 创建新记录
  const newRecord = JSON.parse(JSON.stringify(sourceRecord))
  newRecord[rowNameColumnLabel.value] = newRowName
  if (newRecord.RowName !== undefined) {
    newRecord.RowName = newRowName
  }
  
  // 找到源行的位置，在其后面插入新行
  const sourceIndex = rowNames.value.indexOf(rowContextMenu.targetRowName)
  if (sourceIndex !== -1) {
    rowNames.value.splice(sourceIndex + 1, 0, newRowName)
  } else {
    rowNames.value.push(newRowName)
  }
  
  // 添加到数据中
  rowNameToRecord[newRowName] = newRecord
  
  // 选中新创建的行
  selectedRowName.value = newRowName
  
  showSuccessMessage(`已创建新配置: ${newRowName}`)
  closeRowContextMenu()
  
  // 滚动到新行
  nextTick(() => {
    scrollSelectedRowIntoView()
  })
}

/**
 * 黏贴内容到当前行（覆盖除 RowName 外的所有字段）
 */
function pasteToCurrentRow() {
  if (!copiedRowRecord.value || !rowContextMenu.targetRowName) return
  
  const targetRowName = rowContextMenu.targetRowName
  const currentRecord = rowNameToRecord[targetRowName]
  
  if (!currentRecord) return
  
  // 复制所有字段，但保留原有的 RowName
  const originalRowName = currentRecord[rowNameColumnLabel.value] || currentRecord.RowName
  
  Object.keys(copiedRowRecord.value).forEach((key) => {
    // 跳过 RowName 相关字段
    if (key === rowNameColumnLabel.value || key === 'RowName') return
    currentRecord[key] = copiedRowRecord.value![key]
  })
  
  // 确保 RowName 不变
  currentRecord[rowNameColumnLabel.value] = originalRowName
  if (currentRecord.RowName !== undefined) {
    currentRecord.RowName = originalRowName
  }
  
  // 如果当前选中的就是目标行，刷新编辑区域
  if (selectedRowName.value === targetRowName) {
    // 重新解析条件字段
    resetEditableRecord()
  }
  
  showSuccessMessage(`已黏贴内容到: ${targetRowName}`)
  closeRowContextMenu()
}

/**
 * 开始重命名 RowName（右键菜单或双击触发）
 */
function startRenameRow(rowName: string) {
  renamingRowName.value = rowName
  renameInputValue.value = rowName
  closeRowContextMenu()
  
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

/**
 * 确认重命名
 */
function confirmRenameRow() {
  if (!renamingRowName.value) return
  
  const oldName = renamingRowName.value
  const newName = renameInputValue.value.trim()
  
  // 验证新名称
  if (!newName) {
    showSuccessMessage('RowName 不能为空')
    cancelRenameRow()
    return
  }
  
  if (newName === oldName) {
    cancelRenameRow()
    return
  }
  
  // 检查是否重复
  if (rowNames.value.includes(newName)) {
    showSuccessMessage(`RowName "${newName}" 已存在`)
    cancelRenameRow()
    return
  }
  
  // 执行重命名
  const record = rowNameToRecord[oldName]
  if (record) {
    // 更新记录中的 RowName 字段
    record[rowNameColumnLabel.value] = newName
    if (record.RowName !== undefined) {
      record.RowName = newName
    }
    
    // 更新 rowNameToRecord 映射
    delete rowNameToRecord[oldName]
    rowNameToRecord[newName] = record
    
    // 更新 rowNames 列表
    const index = rowNames.value.indexOf(oldName)
    if (index !== -1) {
      rowNames.value[index] = newName
    }
    
    // 更新 conditionFieldsMap
    if (conditionFieldsMap[oldName]) {
      conditionFieldsMap[newName] = conditionFieldsMap[oldName]
      delete conditionFieldsMap[oldName]
    }
    
    // 如果当前选中的是被重命名的行，更新选中状态和编辑记录
    if (selectedRowName.value === oldName) {
      selectedRowName.value = newName
      // 同步更新 editableRecord 中的 RowName 字段
      editableRecord[rowNameColumnLabel.value] = newName
      if (editableRecord.RowName !== undefined) {
        editableRecord.RowName = newName
      }
    }
    
    showSuccessMessage(`已重命名: ${oldName} → ${newName}`)
  }
  
  cancelRenameRow()
}

/**
 * 取消重命名
 */
function cancelRenameRow() {
  renamingRowName.value = null
  renameInputValue.value = ''
}

/**
 * 处理重命名输入框的键盘事件
 */
function handleRenameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    confirmRenameRow()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRenameRow()
  }
}

/**
 * 处理双击 RowName 开始重命名
 */
function handleRowDoubleClick(rowName: string) {
  startRenameRow(rowName)
}

// 全局搜索功能
function openGlobalSearch() {
  globalSearchVisible.value = true
  nextTick(() => {
    globalSearchInputRef.value?.focus()
    globalSearchInputRef.value?.select()
  })
}

function closeGlobalSearch() {
  globalSearchVisible.value = false
  clearGlobalSearchHighlights()
  globalSearchKeyword.value = ''
  globalSearchMatches.value = []
  globalSearchInputMatches.value = []
  globalSearchCurrentIndex.value = 0
}

function clearGlobalSearchHighlights() {
  // 清除 CSS Highlight API 高亮
  if (typeof CSS !== 'undefined' && CSS.highlights) {
    CSS.highlights.delete('global-search-highlight')
    CSS.highlights.delete('global-search-current')
  }
  // 清除输入框高亮样式
  document.querySelectorAll('.global-search-input-match').forEach(el => {
    el.classList.remove('global-search-input-match', 'global-search-input-current')
  })
}

function performGlobalSearch() {
  clearGlobalSearchHighlights()
  globalSearchMatches.value = []
  globalSearchInputMatches.value = []
  globalSearchCurrentIndex.value = 0

  const keyword = globalSearchKeyword.value.trim()
  if (!keyword) {
    return
  }

  // 只搜索右侧主内容区域（排除左侧 RowName 列表）
  const mainContent = document.querySelector('main > section')
  if (!mainContent) return

  const ranges: Range[] = []
  const inputMatches: HTMLElement[] = []
  const lowerKeyword = keyword.toLowerCase()

  // 1. 搜索文本节点（仅右侧主内容区）
  const treeWalker = document.createTreeWalker(mainContent, NodeFilter.SHOW_TEXT, null)
  
  while (treeWalker.nextNode()) {
    const textNode = treeWalker.currentNode as Text
    const text = textNode.textContent?.toLowerCase() ?? ''
    let startIndex = 0
    let index: number

    while ((index = text.indexOf(lowerKeyword, startIndex)) !== -1) {
      const range = document.createRange()
      range.setStart(textNode, index)
      range.setEnd(textNode, index + keyword.length)
      ranges.push(range)
      startIndex = index + 1
    }
  }

  // 2. 搜索 input 和 textarea 的值
  const inputs = mainContent.querySelectorAll('input[type="text"], input:not([type]), textarea')
  inputs.forEach((input) => {
    const el = input as HTMLInputElement | HTMLTextAreaElement
    // 排除全局搜索框自身
    if (el === globalSearchInputRef.value) return
    
    const value = el.value?.toLowerCase() ?? ''
    if (value.includes(lowerKeyword)) {
      inputMatches.push(el)
      el.classList.add('global-search-input-match')
    }
  })

  // 3. 搜索 select 的选中文本
  const selects = mainContent.querySelectorAll('select')
  selects.forEach((select) => {
    const selectedOption = select.options[select.selectedIndex]
    const text = selectedOption?.text?.toLowerCase() ?? ''
    if (text.includes(lowerKeyword)) {
      inputMatches.push(select)
      select.classList.add('global-search-input-match')
    }
  })

  globalSearchMatches.value = ranges
  globalSearchInputMatches.value = inputMatches

  // 应用文本节点高亮
  if (ranges.length > 0 && typeof CSS !== 'undefined' && CSS.highlights) {
    const highlight = new Highlight(...ranges)
    CSS.highlights.set('global-search-highlight', highlight)
  }

  // 跳转到第一个匹配
  if (ranges.length > 0 || inputMatches.length > 0) {
    scrollToGlobalSearchMatch(0)
  }
}

function scrollToGlobalSearchMatch(index: number) {
  const textCount = globalSearchMatches.value.length
  const inputCount = globalSearchInputMatches.value.length
  const total = textCount + inputCount
  
  if (total === 0) return

  // 确保 index 在有效范围内
  if (index < 0) index = total - 1
  if (index >= total) index = 0
  globalSearchCurrentIndex.value = index

  // 清除之前的当前高亮
  if (typeof CSS !== 'undefined' && CSS.highlights) {
    CSS.highlights.delete('global-search-current')
  }
  document.querySelectorAll('.global-search-input-current').forEach(el => {
    el.classList.remove('global-search-input-current')
  })

  let targetElement: Element | null = null

  if (index < textCount) {
    // 文本节点匹配
    const range = globalSearchMatches.value[index]
    if (typeof CSS !== 'undefined' && CSS.highlights) {
      const currentHighlight = new Highlight(range)
      CSS.highlights.set('global-search-current', currentHighlight)
    }
    targetElement = range.startContainer.parentElement
  } else {
    // 输入框匹配
    const inputIndex = index - textCount
    const inputEl = globalSearchInputMatches.value[inputIndex]
    inputEl.classList.add('global-search-input-current')
    targetElement = inputEl
  }

  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function nextGlobalSearchMatch() {
  if (globalSearchTotalCount.value === 0) return
  scrollToGlobalSearchMatch(globalSearchCurrentIndex.value + 1)
}

function prevGlobalSearchMatch() {
  if (globalSearchTotalCount.value === 0) return
  scrollToGlobalSearchMatch(globalSearchCurrentIndex.value - 1)
}

function handleGlobalSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) {
      prevGlobalSearchMatch()
    } else {
      if (globalSearchTotalCount.value === 0) {
        performGlobalSearch()
      } else {
        nextGlobalSearchMatch()
      }
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
  document.addEventListener('click', handleClickOutsideContextMenu)
  
  // 启动自动保存
  startAutoSave()
  
  setTimeout(async () => {
    // 初始化原子字段配置系统
    await initializeAtomicFields()
    loadDelegateMetadata()
  }, 0)
  // loadDelegateMetadata()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleClickOutsideContextMenu)
  stopAutoSave()
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
      console.warn('Failed to serialize condition object, using empty string', error)
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

/**
 * 打开原子字段配置编辑器
 */
async function openAtomFieldsConfigEditor() {
  const electronAPI = window.electronAPI
  if (!electronAPI?.getAtomFieldsConfig) {
    errorMessage.value = '当前环境不支持获取配置，请检查预加载配置。'
    return
  }

  try {
    const result = await electronAPI.getAtomFieldsConfig()
    if (result.ok && result.config) {
      atomFieldsConfig.value = result.config
      isAtomFieldsConfigEditorOpen.value = true
    } else {
      errorMessage.value = result.error || '获取配置失败'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '获取配置失败'
    console.error('Failed to get atom fields config:', error)
  }
}

/**
 * 保存原子字段配置
 */
async function saveAtomFieldsConfig(config: AtomFieldsConfig) {
  const electronAPI = window.electronAPI
  if (!electronAPI?.saveAtomFieldsConfig) {
    errorMessage.value = '当前环境不支持保存配置，请检查预加载配置。'
    return
  }

  try {
    // 深度序列化配置对象以确保可以通过 IPC 传输
    const serializedConfig = JSON.parse(JSON.stringify(config))
    const result = await electronAPI.saveAtomFieldsConfig(serializedConfig)
    if (result.ok) {
      showSuccessMessage('配置保存成功')
      isAtomFieldsConfigEditorOpen.value = false
    } else {
      errorMessage.value = result.error || '保存配置失败'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存配置失败'
    console.error('Failed to save atom fields config:', error)
  }
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

/**
 * 自动保存（静默保存，不显示进度条）
 * 如果文件被占用则跳过本次保存
 */
async function autoSave() {
  // 检查是否满足自动保存条件
  if (!autoSaveEnabled.value) return
  if (!openedFilePath.value) return
  if (!Object.keys(rowNameToRecord).length) return
  if (!window.excelBridge) return
  
  // 如果正在显示进度条（用户正在手动操作），跳过自动保存
  if (isProgressVisible.value) return

  try {
    // 先保存当前编辑数据
    saveEditableRecord()
    
    const rows = buildRowsForSaving()
    
    const result = await window.excelBridge.saveWorkbook({
      filePath: openedFilePath.value,
      sheetName: sheetName.value,
      rows
    })
    
    if (result.ok) {
      lastAutoSaveTime.value = new Date()
      console.log(`[AutoSave] Save success: ${lastAutoSaveTime.value.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`)
    } else {
      // File may be locked, skip silently
      console.warn(`[AutoSave] Save skipped: ${result.error}`)
    }
  } catch (error) {
    // Handle error silently
    console.warn('[AutoSave] Save failed:', error instanceof Error ? error.message : error)
  }
}

/**
 * 启动自动保存定时器
 */
function startAutoSave() {
  stopAutoSave()
  if (!autoSaveEnabled.value) return
  const intervalMs = autoSaveInterval.value * 60 * 1000
  autoSaveTimer = setInterval(() => {
    autoSave()
  }, intervalMs)
  console.log(`[AutoSave] Started, interval: ${autoSaveInterval.value} min`)
}

/**
 * 停止自动保存定时器
 */
function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
    console.log('[AutoSave] Stopped')
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
            <span 
              v-if="lastAutoSaveTime && openedFilePath" 
              class="badge badge-success badge-sm gap-1"
              :title="`自动保存已${autoSaveEnabled ? '启用' : '禁用'}，间隔 ${autoSaveInterval} 分钟`"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              {{ lastAutoSaveTime.toLocaleTimeString() }}
            </span>
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
            class="btn btn-sm btn-outline gap-2 border border-success/40"
            @click="openAtomFieldsConfigEditor"
            title="编辑原子字段配置"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            配置编辑器
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
        <div 
          ref="rowListContainerRef"
          class="scrollbar flex-1 px-4 pb-4 pt-2 min-h-0 overflow-y-auto"
          @scroll="onRowListScroll"
        >
          <!-- 虚拟滚动容器 -->
          <div :style="{ height: virtualScrollInfo.totalHeight + 'px', position: 'relative' }">
            <div 
              class="flex flex-col space-y-2"
              :style="{ position: 'absolute', top: virtualScrollInfo.offsetY + 'px', left: 0, right: 0 }"
            >
              <template v-for="row in visibleRowNames" :key="row">
                <!-- 重命名模式 -->
                <div
                  v-if="renamingRowName === row"
                  class="flex items-center gap-2 px-2 py-2 bg-base-200 rounded-lg"
                >
                  <input
                    ref="renameInputRef"
                    v-model="renameInputValue"
                    type="text"
                    class="input input-sm input-bordered flex-1"
                    @keydown="handleRenameKeydown"
                    @blur="confirmRenameRow"
                  />
                  <button
                    type="button"
                    class="btn btn-xs btn-primary"
                    @click="confirmRenameRow"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    class="btn btn-xs btn-ghost"
                    @click="cancelRenameRow"
                  >
                    ✕
                  </button>
                </div>
                <!-- 正常显示模式 -->
                <button
                  v-else
                  :ref="(el) => setRowButtonRef(row, el)"
                  class="btn btn-md w-full justify-start items-center text-left normal-case leading-tight h-auto py-2"
                  :class="{ 'btn-active btn-primary': row === selectedRowName }"
                  @click="selectedRowName = row"
                  @dblclick="handleRowDoubleClick(row)"
                  @contextmenu="openRowContextMenu($event, row)"
                >
                  <div class="flex flex-col items-start w-full gap-0">
                    <span class="font-semibold truncate">{{ row }}</span>
                    <span v-if="getRecordRemark(row)" class="remark-text text-xs w-full">{{ getRecordRemark(row) }}</span>
                  </div>
                </button>
              </template>
            </div>
          </div>
          <p v-if="!filteredRowNames.length" class="text-center text-sm text-base-content/60">
            暂无数据，请先打开 Excel 配置表。
          </p>
        </div>
      </aside>

      <!-- 分割线 -->
      <div 
        class="w-1 bg-base-300 hover:bg-primary cursor-col-resize transition-colors flex-shrink-0"
        @mousedown="startResizeLeftPanel"
      ></div>

      <section class="card flex flex-1 min-h-0 flex-col overflow-hidden bg-base-100 shadow-md" style="gap: 0.75rem;">
        <div class="px-6 pt-6 pb-4 space-y-4">
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
          <!-- <div v-if="activeMainTab === 'config'" class="flex flex-wrap items-center gap-2">
            <button class="btn btn-sm" :disabled="!selectedRowName" @click="resetEditableRecord">重置</button>
          </div> -->
          
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

            <!-- 代码编辑控件 -->
            <div class="divider my-2">代码编辑控件</div>
            <div class="form-control gap-2">
              <label class="label">
                <span class="label-text">TypeScript 代码编辑器</span>
                <span class="label-text-alt text-base-content/60">输入函数式代码，点击解析生成原子UI控件</span>
              </label>
              <div class="flex gap-2">
                <div class="flex-1">
                  <CodeEditor
                    ref="codeEditorRef"
                    v-model="codeEditorInput"
                    language="typescript"
                    theme="vs-dark"
                    height="200px"
                    placeholder="// 在此输入 TypeScript 代码..."
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <button
                    class="btn btn-primary btn-sm"
                    @click="parseCodeEditorContent"
                    :disabled="!codeEditorInput.trim()"
                  >
                    解析代码
                  </button>
                  <button
                    class="btn btn-outline btn-sm"
                    @click="clearCodeEditor"
                  >
                    清空
                  </button>
                </div>
              </div>
              <p v-if="codeEditorParseError" class="text-sm text-error mt-1">
                {{ codeEditorParseError }}
              </p>
            </div>

            <div v-if="isDebugMode && codeEditorParseResult" class="form-control gap-2 mt-2">
              <label class="label">
                <span class="label-text">代码解析结果 (JSON)</span>
              </label>
              <textarea
                v-model="codeEditorParseResult"
                class="textarea textarea-bordered font-mono text-xs resize"
                placeholder="代码解析结果将在此显示"
                readonly
                rows="6"
              ></textarea>
            </div>

            <div class="divider my-2">对象表单与 JSON</div>

            <!-- 对象表单与 JSON 编辑 -->
            

            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
              <div class="scrollbar h-[1600px] overflow-y-auto pr-1">
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
                      'column-field-container rounded-lg px-3 py-2 transition-all duration-150 cursor-pointer border relative',
                      fieldLayoutDirection === 'horizontal' ? 'flex-shrink-0' : '',
                      { 'bg-primary/10 border-primary/60': columnName === highlightColumnName, 'border-base-300 hover:border-base-400': columnName !== highlightColumnName }
                    ]"
                    :style="fieldLayoutDirection === 'horizontal' ? { width: (columnWidths[columnName] || DEFAULT_COLUMN_WIDTH) + 'px' } : {}"
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
                        <SearchableAtomSelect
                          v-if="!conditionFieldsMap[selectedRowName]?.[columnName]?.parsed"
                          :model-value="selectedAtomClassByField[columnName] ?? ''"
                          :options="flatAtomClassOptionsByField[columnName] ?? []"
                          :registry="classRegistry"
                          placeholder="搜索原子类型..."
                          allow-empty
                          empty-label=""
                          @update:model-value="(value) => {
                            selectedAtomClassByField[columnName] = value
                            if (value) handleSelectAtomClass(columnName, value)
                          }"
                        />
                      </div>
                    
                      <!-- 如果已有配置，显示详细编辑界面 -->
                      <template v-if="conditionFieldsMap[selectedRowName]?.[columnName]?.parsed">
                        <div class="space-y-2">
                          <div>
                            <label class="label">
                              <span class="label-text text-sm font-semibold">表达式</span>
                              <span v-if="getExpressionEditState(columnName).isParsing" class="loading loading-spinner loading-xs ml-2"></span>
                            </label>
                            <input
                              :value="getExpressionEditState(columnName).value || (editableRecord[columnName] as string)"
                              type="text"
                              class="input input-bordered input-sm font-mono text-xs w-full"
                              :class="{ 'input-error': getExpressionEditState(columnName).error }"
                              @input="handleExpressionInput(columnName, ($event.target as HTMLInputElement).value)"
                              @focus="getExpressionEditState(columnName).value = (editableRecord[columnName] as string) ?? ''"
                            />
                            <p v-if="getExpressionEditState(columnName).error" class="text-xs text-error mt-1">
                              {{ getExpressionEditState(columnName).error }}
                            </p>
                            <p v-else-if="conditionFieldsMap[selectedRowName]?.[columnName]?.expressionDesc" class="text-xs text-base-content/60 mt-1 leading-relaxed">
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
      :auto-save-enabled="autoSaveEnabled"
      :auto-save-interval="autoSaveInterval"
      :theme-options="themeOptions"
      @update:is-open="isSettingsModalOpen = $event"
      @update:current-theme="currentTheme = $event"
      @update:show-only-atomic-fields="showOnlyAtomicFields = $event"
      @update:is-debug-mode="isDebugMode = $event"
      @update:field-layout-direction="fieldLayoutDirection = $event"
      @update:auto-save-enabled="autoSaveEnabled = $event"
      @update:auto-save-interval="autoSaveInterval = $event"
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

    <!-- 全局搜索框 -->
    <Teleport to="body">
      <Transition name="slide-down">
        <div
          v-if="globalSearchVisible"
          class="fixed top-4 right-4 z-50 flex items-center gap-2 bg-base-100 border border-base-300 rounded-lg shadow-lg px-3 py-2"
        >
          <input
            ref="globalSearchInputRef"
            v-model="globalSearchKeyword"
            type="text"
            class="input input-sm input-bordered w-64"
            placeholder="搜索页面内容..."
            @input="performGlobalSearch"
            @keydown="handleGlobalSearchKeydown"
          />
          <span v-if="globalSearchTotalCount > 0" class="text-xs text-base-content/60 min-w-[60px] text-center">
            {{ globalSearchCurrentIndex + 1 }} / {{ globalSearchTotalCount }}
          </span>
          <span v-else-if="globalSearchKeyword.trim()" class="text-xs text-base-content/40 min-w-[60px] text-center">
            无结果
          </span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              :disabled="globalSearchTotalCount === 0"
              @click="prevGlobalSearchMatch"
              title="上一个 (Shift+Enter)"
            >
              ▲
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              :disabled="globalSearchTotalCount === 0"
              @click="nextGlobalSearchMatch"
              title="下一个 (Enter)"
            >
              ▼
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              @click="closeGlobalSearch"
              title="关闭 (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- RowName 右键菜单 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="rowContextMenu.visible"
          class="row-context-menu fixed z-50 bg-base-100 border border-base-300 rounded-lg shadow-xl py-1 min-w-[180px]"
          :style="{ left: rowContextMenu.x + 'px', top: rowContextMenu.y + 'px' }"
        >
          <div class="px-3 py-1.5 text-xs text-base-content/50 border-b border-base-200 truncate max-w-[200px]">
            {{ rowContextMenu.targetRowName }}
          </div>
          <button
            class="w-full px-3 py-2 text-left text-sm hover:bg-base-200 flex items-center gap-2 transition-colors"
            @click="rowContextMenu.targetRowName && startRenameRow(rowContextMenu.targetRowName)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            重命名
          </button>
          <button
            class="w-full px-3 py-2 text-left text-sm hover:bg-base-200 flex items-center gap-2 transition-colors"
            @click="duplicateRow"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            复制并创建新配置
          </button>
          <div class="h-px bg-base-200 my-1"></div>
          <button
            class="w-full px-3 py-2 text-left text-sm hover:bg-base-200 flex items-center gap-2 transition-colors"
            @click="copyRowRecord"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            复制到剪贴板
          </button>
          <button
            class="w-full px-3 py-2 text-left text-sm hover:bg-base-200 flex items-center gap-2 transition-colors"
            :class="{ 'opacity-40 cursor-not-allowed': !copiedRowRecord }"
            :disabled="!copiedRowRecord"
            @click="pasteToCurrentRow"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m0 9l-3 3m0 0l-3-3m3 3V9" />
            </svg>
            粘贴覆盖内容
            <span v-if="!copiedRowRecord" class="text-xs text-base-content/40">(无)</span>
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- 原子字段配置编辑器 -->
    <AtomFieldsConfigEditor
      :is-open="isAtomFieldsConfigEditorOpen"
      :config="atomFieldsConfig"
      @update:is-open="isAtomFieldsConfigEditorOpen = $event"
      @save="saveAtomFieldsConfig"
    />
  </div>
</template>

<style scoped>
/* 全局搜索高亮样式 */
::highlight(global-search-highlight) {
  background-color: rgba(255, 235, 59, 0.4);
}

::highlight(global-search-current) {
  background-color: rgba(255, 152, 0, 0.6);
}

/* 搜索框滑入动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 输入框/选择框匹配高亮 - 需要全局样式 */
:global(.global-search-input-match) {
  box-shadow: 0 0 0 2px rgba(255, 235, 59, 0.6) !important;
}

:global(.global-search-input-current) {
  box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.8) !important;
}

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

/* 右键菜单淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 右键菜单样式 */
.row-context-menu {
  animation: context-menu-in 0.1s ease-out;
}

@keyframes context-menu-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
