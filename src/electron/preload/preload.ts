// src/electron/preload/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
type RowRecord = Record<string, string>
contextBridge.exposeInMainWorld('excelBridge', {
    openWorkbook: () => ipcRenderer.invoke('excel:open') as Promise<
        | { canceled: true }
        | {
              canceled: false;
              filePath?: string;
              sheetName?: string;
              rowCount?: number;
              columnNames?: string[];
              rowNames?: string[];
              rowNameColumnName?: string;
              columnDescriptions?: Record<string, string>;
              error?: string;
          }
    >,
    saveWorkbook: (payload: { filePath: string; sheetName: string; rows: Record<string, string>[] }) =>
        ipcRenderer.invoke('excel:save', payload) as Promise<{ ok: boolean; error?: string }>,
    saveWorkbookAs: (payload: { defaultPath?: string; sheetName: string; rows: Record<string, string>[] }) =>
        ipcRenderer.invoke('excel:save-as', payload) as Promise<
            | { canceled: true }
            | { canceled: false; ok: boolean; filePath?: string; error?: string }
        >
});

contextBridge.exposeInMainWorld('delegateBridge', {
    getMetadata: () => ipcRenderer.invoke('delegate:get-metadata') as Promise<{
        ok: boolean;
        metadata?: any[];
        registry?: Record<string, any>;
        grouped?: Record<string, any[]>;
        count?: number;
        defaultJson?:string;
        error?: string;
    }>,
    parseExpression: (payload: { expression: string }) => ipcRenderer.invoke('condition:parse-expression', payload) as Promise<{
        ok: boolean;
        parsed?: any;
        json?: string;
        error?: string;
    }>,
    parseConditionField: (payload: { fieldName: string; rawValue: string }) => ipcRenderer.invoke('delegate:parse-condition-field', payload) as Promise<{
        ok: boolean;
        parsed?: any;
        error?: string;
    }>,
    deParseJsonToExpression: (payload: { json: any }) => ipcRenderer.invoke('delegate:deparse-json-to-expression', payload) as Promise<{
        ok: boolean;
        expression?: string;
        error?: string;
    }>
});