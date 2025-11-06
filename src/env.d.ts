/// <reference types="vite/client" />

import type { ClassMetadata, ClassRegistry } from './types/DynamicObjectForm'

// ============ 通用类型 ============
type RowRecord = Record<string, string>

type ConditionFieldInfo = {
  raw: string
  parsed: any
  json: string
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
      error?: string
    }

type ExcelReadRowResult =
  | { ok: false; error: string }
  | { ok: true; rowName: string; row: RowRecord; columnNames: string[]; conditionFields: Record<string, ConditionFieldInfo> }

type ExcelSaveResult = { ok: boolean; error?: string }

type ExcelSaveAsResult =
  | { canceled: true }
  | { canceled: false; ok: boolean; filePath?: string; error?: string }

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
    readRow: (payload: { filePath: string; sheetName: string; rowName: string }) => Promise<ExcelReadRowResult>
    loadConditionFields: (payload: { record: RowRecord; columnNames: string[] }) => Promise<{ ok: boolean; conditionFields?: Record<string, ConditionFieldInfo>; error?: string }>
    saveWorkbook: (payload: { filePath: string; sheetName: string; rows: RowRecord[] }) => Promise<ExcelSaveResult>
    saveWorkbookAs: (payload: { defaultPath?: string; sheetName: string; rows: RowRecord[] }) => Promise<ExcelSaveAsResult>
  }

  interface DelegateBridge {
    getMetadata: () => Promise<DelegateMetadataSuccess | DelegateMetadataFailure>
    parseExpression: (payload: { expression: string }) => Promise<{ ok: boolean; parsed?: any; json?: string; error?: string }>
    parseConditionField: (payload: { fieldName: string; rawValue: string }) => Promise<{ ok: boolean; parsed?: any; error?: string }>
    deParseJsonToExpression: (payload: { json: any }) => Promise<{ ok: boolean; expression?: string; error?: string }>
  }

  interface Window {
    excelBridge?: ExcelBridge
    delegateBridge?: DelegateBridge
  }
}

