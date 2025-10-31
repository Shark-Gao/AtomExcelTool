export {};

declare global {
  type ExcelRowRecord = Record<string, string>;

  type ExcelOpenResult =
    | { canceled: true }
    | {
        canceled: false;
        filePath?: string;
        sheetName?: string;
        rowCount?: number;
        columnNames?: string[];
        rows?: ExcelRowRecord[];
        rowNames?: string[];
        rowNameColumnName?: string;
        error?: string;
      };

  type ExcelReadRowResult =
    | { ok: false; error: string }
    | { ok: true; rowName: string; row: ExcelRowRecord; columnNames: string[] };

  type ExcelSaveResult = { ok: boolean; error?: string };

  type ExcelSaveAsResult =
    | { canceled: true }
    | { canceled: false; ok: boolean; filePath?: string; error?: string };

  interface ExcelBridge {
    openWorkbook(): Promise<ExcelOpenResult>;
    readRow(payload: { filePath: string; sheetName: string; rowName: string }): Promise<ExcelReadRowResult>;
    saveWorkbook(payload: {
      filePath: string;
      sheetName: string;
      rows: ExcelRowRecord[];
    }): Promise<ExcelSaveResult>;
    saveWorkbookAs(payload: {
      defaultPath?: string;
      sheetName: string;
      rows: ExcelRowRecord[];
    }): Promise<ExcelSaveAsResult>;
  }

  interface Window {
    excelBridge?: ExcelBridge;
  }
}
