/// <reference types="vite/client" />

import type { ClassMetadata, ClassRegistry } from './types/MetaDefine'

// ============ 通用类型 ============
type RowRecord = Record<string, string>

type ConditionFieldInfo = {
  raw: string
  parsed: any
  json: string
}

type DeParseExpressonType = {
  expression: string
  expressionDesc: string
}

// ============ Excel 相关类型 ============
type ExcelOpenResult =
  | { canceled: true }
  | {
      canceled: false
      filePath?: string
      sheetName?: string
      rowCount?: number
      columnNames?: string[]
      rowNames?: string[]
      rowNameColumnName?: string
      columnDescriptions?: Record<string, string>
      rows?: RowRecord[]
      sheetList?: string[]
      error?: string
    }

type ExcelLoadSheetResult =
  | { ok: false; error: string }
  | {
      ok: true
      sheetName?: string
      rowCount?: number
      columnNames?: string[]
      rowNames?: string[]
      rowNameColumnName?: string
      columnDescriptions?: Record<string, string>
      rows?: RowRecord[]
      error?: string
    }

type ExcelReadRowResult =
  | { ok: false; error: string }
  | { ok: true; rowName: string; row: RowRecord; columnNames: string[]; conditionFields: Record<string, ConditionFieldInfo> }

type ExcelSaveResult = { ok: boolean; error?: string }

type ExcelSaveAsResult =
  | { canceled: true }
  | { canceled: false; ok: boolean; filePath?: string; error?: string }

type ExcelSheetScanResult = {
  sheetName: string
  rowCount: number
  columnNames: string[]
  rowNameColumnName: string
  columnDescriptions: Record<string, string>
  rows: RowRecord[]
}

type ExcelSheetScanError = {
  sheetName: string
  error: string
}

type ExcelWorkbookScanResult = {
  filePath: string
  sheets: ExcelSheetScanResult[]
  sheetErrors?: ExcelSheetScanError[]
}

type ExcelMultiOpenResult =
  | { canceled: true }
  | {
      canceled: false
      workbooks: ExcelWorkbookScanResult[]
      errors?: { filePath: string; error: string }[]
    }

// ============ Delegate 相关类型 ============
type DelegateMetadataSuccess = {
  ok: true
  metadata: ClassMetadata[]
  registry: ClassRegistry
  grouped: Record<string, ClassMetadata[]>
  count: number
  error: string
  defaultJson: string
}

type DelegateMetadataFailure = {
  ok: false
  error: string
  metadata?: undefined
  registry?: undefined
  grouped?: undefined
  count?: undefined
  defaultJson?: undefined
}

export {}

declare global {
  interface ImportMetaEnv {
    readonly VITE_SOME_KEY?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface ExcelBridge {
    openWorkbook: () => Promise<ExcelOpenResult>
    openWorkbookByPath: (payload: { filePath: string }) => Promise<ExcelOpenResult>
    openMultipleWorkbooks: () => Promise<ExcelMultiOpenResult>
    loadSheet: (payload: { filePath: string; sheetName: string }) => Promise<ExcelLoadSheetResult>
    readRow: (payload: { filePath: string; sheetName: string; rowName: string }) => Promise<ExcelReadRowResult>
    loadConditionFields: (payload: { record: RowRecord; columnNames: string[] }) => Promise<{ ok: boolean; conditionFields?: Record<string, ConditionFieldInfo>; error?: string }>
    saveWorkbook: (payload: { filePath: string; sheetName: string; rows: RowRecord[] }) => Promise<ExcelSaveResult>
    saveWorkbookAs: (payload: { defaultPath?: string; sheetName: string; rows: RowRecord[] }) => Promise<ExcelSaveAsResult>
  }

  interface DelegateBridge {
    getMetadata: () => Promise<DelegateMetadataSuccess | DelegateMetadataFailure>
    parseExpression: (payload: { expression: string }) => Promise<{ ok: boolean; parsed?: any; json?: string; error?: string }>
    parseConditionField: (payload: { fieldName: string; rawValue: string; sheetName?: string; fileName?: string }) => Promise<{ ok: boolean; parsed?: any; error?: string }>
    deParseJsonToExpression: (payload: { json: any }) => Promise<{ ok: boolean; expression?: DeParseExpressonType; error?: string }>
  }

  interface ElectronAPI {
    invoke: (channel: string, payload?: any) => Promise<any>
    registerExcelContextMenu: () => Promise<{ ok: boolean; error?: string }>
    onOpenExternalExcel: (callback: (filePath: string) => void) => () => void
    openExternal: (url: string) => Promise<void>
    openPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>
    getLogInfo: () => Promise<{ ok: boolean; logDir?: string; logFilePath?: string; error?: string }>
    // 快捷键监听
    onOpen: (callback: () => void) => () => void
    onSave: (callback: () => void) => () => void
    onSaveAs: (callback: () => void) => () => void
  }

  // ============ AI 助手相关类型 ============
  interface AIStreamChunk {
    type: 'content' | 'done' | 'error'
    content?: string
    error?: string
  }

  interface AIStreamHandle {
    requestId: string
    onChunk: (callback: (chunk: AIStreamChunk) => void) => () => void
  }

  interface AIBridge {
    /** 获取 AI 服务状态 */
    getStatus: () => Promise<{ configured: boolean; config?: { model: string } }>
    /** 获取内置配置状态 */
    getBuiltinConfig: () => Promise<{ hasBuiltinConfig: boolean; currentModel?: string; availableModels?: string[] }>
    /** 初始化原子知识库 */
    initKnowledge: (metadata: ClassMetadata[]) => Promise<{ success: boolean; error?: string }>
    /** 发送聊天消息 */
    chat: (payload: { message: string; currentAtom?: ClassMetadata; stream?: boolean }) => Promise<{
      success: boolean
      content?: string
      error?: string
    }>
    /** 流式聊天 */
    chatStream: (payload: { message: string; currentAtom?: ClassMetadata }) => AIStreamHandle
    /** 清空对话历史 */
    clearHistory: () => Promise<{ success: boolean }>
    /** 获取 Token 使用统计 */
    getUsage: () => Promise<{
      success: boolean
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
        estimatedCost?: number
      }
      estimate?: {
        systemTokens: number
        historyTokens: number
        totalInputTokens: number
      }
      modelType?: string
      error?: string
    }>
    /** 重置 Token 统计 */
    resetUsage: () => Promise<{ success: boolean }>
  }

  // ============ 使用统计上报相关类型 ============
  interface UsageBridge {
    /** 上报打开代码编辑器 */
    reportOpenCodeEditor: (extraInfo?: Record<string, unknown>) => Promise<void>
    /** 上报自定义操作 */
    reportAction: (actionName: string, extraInfo?: Record<string, unknown>) => Promise<void>
    /** 上报自定义事件 */
    reportEvent: (eventType: string, extraInfo?: Record<string, unknown>) => Promise<void>
  }

  interface Window {
    excelBridge?: ExcelBridge
    delegateBridge?: DelegateBridge
    electronAPI?: ElectronAPI
    aiBridge?: AIBridge
    usageBridge?: UsageBridge
  }
}

