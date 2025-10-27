// src/electron/preload/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

type RowRecord = Record<string, string>;

contextBridge.exposeInMainWorld('excelBridge', {
    openWorkbook: () => ipcRenderer.invoke('excel:open') as Promise<
        | { canceled: true }
        | {
              canceled: false;
              filePath?: string;
              sheetName?: string;
              rowCount?: number;
              rows?: RowRecord[];
              error?: string;
          }
    >,
    saveWorkbook: (payload: { filePath: string; sheetName: string; rows: RowRecord[] }) =>
        ipcRenderer.invoke('excel:save', payload) as Promise<{ ok: boolean; error?: string }>,
    saveWorkbookAs: (payload: { defaultPath?: string; sheetName: string; rows: RowRecord[] }) =>
        ipcRenderer.invoke('excel:save-as', payload) as Promise<
            | { canceled: true }
            | { canceled: false; ok: boolean; filePath?: string; error?: string }
        >
});