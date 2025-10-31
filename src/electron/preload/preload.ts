// src/electron/preload/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

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
              error?: string;
          }
    >,
    readRow: (payload: { filePath: string; sheetName: string; rowName: string }) =>
        ipcRenderer.invoke('excel:read-row', payload) as Promise<
            | { ok: false; error: string }
            | { ok: true; rowName: string; row: Record<string, string>; columnNames: string[] }
        >,
    saveWorkbook: (payload: { filePath: string; sheetName: string; rows: Record<string, string>[] }) =>
        ipcRenderer.invoke('excel:save', payload) as Promise<{ ok: boolean; error?: string }>,
    saveWorkbookAs: (payload: { defaultPath?: string; sheetName: string; rows: Record<string, string>[] }) =>
        ipcRenderer.invoke('excel:save-as', payload) as Promise<
            | { canceled: true }
            | { canceled: false; ok: boolean; filePath?: string; error?: string }
        >
});