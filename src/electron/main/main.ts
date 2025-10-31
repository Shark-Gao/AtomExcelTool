// src/electron/main/main.ts
import { join } from 'path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import ExcelJS from 'exceljs';
import { FAtomExpressionParser } from './MHTsAtomSystemUtils';

type RowRecord = Record<string, string>;

const ROW_NAME_IDENTIFIER = 'rowname';

const isDev = !app.isPackaged;

function normalizeHeaderIdentifier(label: string): string {
    return label.replace(/\s+/g, '').toLowerCase();
}

function isRowNameLabel(label: string): boolean {
    return normalizeHeaderIdentifier(label).startsWith(ROW_NAME_IDENTIFIER);
}

function findHeaderRowNumber(worksheet: ExcelJS.Worksheet): number {
    for (let r = 1; r <= worksheet.rowCount; r += 1) {
        const row = worksheet.getRow(r);
        for (let c = 1; c <= worksheet.columnCount; c += 1) {
            const text = row.getCell(c).text || '';
            if (isRowNameLabel(text)) {
                return r;
            }
        }
    }
    throw new Error('未自动识别到包含 RowName 的表头行，请检查 Excel 列标题。');
}

function buildHeaderLabels(headerRow: ExcelJS.Row, totalColumns: number): string[] {
    const headerSet = new Set<string>();
    const labels: string[] = [];
    for (let c = 1; c <= totalColumns; c += 1) {
        const label = (headerRow.getCell(c).text || '').trim();
        const base = label || `Column${c}`;
        let candidate = base;
        let dup = 1;
        while (headerSet.has(candidate)) {
            dup += 1;
            candidate = `${base}_${dup}`;
        }
        headerSet.add(candidate);
        labels.push(candidate);
    }
    return labels;
}

function extractHeaderMetadata(worksheet: ExcelJS.Worksheet): {
    headerRowNumber: number;
    headerLabels: string[];
    rowNameColumnNumber: number;
} {
    const headerRowNumber = findHeaderRowNumber(worksheet);
    const headerRow = worksheet.getRow(headerRowNumber);
    const headerLabels = buildHeaderLabels(headerRow, worksheet.columnCount);
    const rowNameIndex = headerLabels.findIndex((label) => isRowNameLabel(label));
    if (rowNameIndex === -1) {
        throw new Error('未识别到 RowName 列，请确认表头包含 RowName。');
    }
    return {
        headerRowNumber,
        headerLabels,
        rowNameColumnNumber: rowNameIndex + 1
    };
}

function extractRowNames(
    worksheet: ExcelJS.Worksheet,
    headerRowNumber: number,
    rowNameColumnNumber: number
): string[] {
    const names: string[] = [];
    for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r += 1) {
        const row = worksheet.getRow(r);
        const raw = row.getCell(rowNameColumnNumber).text || '';
        const trimmed = raw.trim();
        if (trimmed.length > 0) {
            names.push(trimmed);
        }
    }
    return names;
}

function extractRowRecord(row: ExcelJS.Row, headerLabels: string[]): RowRecord {
    const record: RowRecord = {};
    headerLabels.forEach((columnName, index) => {
        const cell = row.getCell(index + 1);
        const text = cell.text ?? '';
        record[columnName] = text;
    });
    return record;
}

function ensureRowName(record: RowRecord): string {
    const keys = Object.keys(record);
    for (const key of keys) {
        if (isRowNameLabel(key)) {
            const value = record[key];
            if (value && value.trim().length > 0) {
                return value.trim();
            }
        }
    }
    throw new Error('未找到 RowName 列，请确认表头包含 RowName。');
}

async function handleOpenWorkbook() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
    });

    if (canceled || !filePaths || filePaths.length === 0) {
        return { canceled: true };
    }

    const filePath = filePaths[0];
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    if (!workbook.worksheets.length) {
        throw new Error('所选 Excel 文件中没有可读取的工作表。');
    }

    const worksheet = workbook.worksheets[0];
    const { headerRowNumber, headerLabels, rowNameColumnNumber } = extractHeaderMetadata(worksheet);
    const rowNames = extractRowNames(worksheet, headerRowNumber, rowNameColumnNumber);

    const rows: RowRecord[] = [];
    for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r += 1) {
        const row = worksheet.getRow(r);
        const record = extractRowRecord(row, headerLabels);
        const rowName = (record[headerLabels[rowNameColumnNumber - 1]] || '').trim();
        if (rowName.length === 0) {
            continue;
        }
        rows.push(record);
    }

    return {
        canceled: false,
        filePath,
        sheetName: worksheet.name,
        rowCount: rows.length,
        columnNames: headerLabels,
        rows,
        rowNames,
        rowNameColumnName: headerLabels[rowNameColumnNumber - 1]
    };
}

async function readRowByName(
    filePath: string,
    sheetName: string | undefined,
    targetRowName: string
): Promise<{ row: RowRecord; columnNames: string[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    if (!worksheet) {
        throw new Error(`工作簿中不存在名为 ${sheetName} 的工作表。`);
    }

    const { headerRowNumber, headerLabels, rowNameColumnNumber } = extractHeaderMetadata(worksheet);

    for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r += 1) {
        const row = worksheet.getRow(r);
        const value = (row.getCell(rowNameColumnNumber).text || '').trim();
        if (value.length === 0) {
            continue;
        }
        if (value === targetRowName.trim()) {
            const record = extractRowRecord(row, headerLabels);
            return { row: record, columnNames: headerLabels };
        }
    }

    throw new Error(`未在工作表中找到 RowName 为 ${targetRowName} 的数据。`);
}

async function writeWorkbookToDisk(filePath: string, rows: RowRecord[], sheetName: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const targetWorksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    if (!targetWorksheet) {
        throw new Error('目标 Excel 工作簿中没有可用工作表。');
    }

    const { headerRowNumber, headerLabels, rowNameColumnNumber } = extractHeaderMetadata(targetWorksheet);

    const headerStyleByColumn: Record<number, ExcelJS.Style> = {};
    for (let c = 1; c <= targetWorksheet.columnCount; c += 1) {
        headerStyleByColumn[c] = JSON.parse(JSON.stringify(targetWorksheet.getRow(headerRowNumber).getCell(c).style || {}));
    }

    const ensureColumnNumber = (columnName: string): number => {
        const existingIndex = headerLabels.findIndex((label) => label === columnName);
        if (existingIndex !== -1) {
            return existingIndex + 1;
        }

        const newColumnNumber = targetWorksheet.columnCount + 1;
        const headerRow = targetWorksheet.getRow(headerRowNumber);
        const headerCell = headerRow.getCell(newColumnNumber);
        headerCell.value = columnName;

        const neighborStyle = headerStyleByColumn[newColumnNumber - 1] || {};
        headerCell.style = JSON.parse(JSON.stringify(neighborStyle));
        headerLabels.push(columnName);
        headerStyleByColumn[newColumnNumber] = JSON.parse(JSON.stringify(headerCell.style || {}));
        return newColumnNumber;
    };

    const rowNameToRowNumber = new Map<string, number>();
    for (let r = headerRowNumber + 1; r <= targetWorksheet.rowCount; r += 1) {
        const row = targetWorksheet.getRow(r);
        const value = (row.getCell(rowNameColumnNumber).text || '').trim();
        if (value.length > 0 && !rowNameToRowNumber.has(value)) {
            rowNameToRowNumber.set(value, r);
        }
    }

    let maxRowNumber = targetWorksheet.rowCount;

    rows.forEach((incomingRow) => {
        const rowName = ensureRowName(incomingRow);
        if (rowName.length === 0) {
            return;
        }

        let targetRowNumber = rowNameToRowNumber.get(rowName);
        if (!targetRowNumber) {
            maxRowNumber += 1;
            targetRowNumber = maxRowNumber;
            rowNameToRowNumber.set(rowName, targetRowNumber);
        }

        const worksheetRow = targetWorksheet.getRow(targetRowNumber);
        const rowNameCell = worksheetRow.getCell(rowNameColumnNumber);
        rowNameCell.value = rowName;

        Object.entries(incomingRow).forEach(([columnName, value]) => {
            if (value === undefined) {
                return;
            }
            const columnNumber = ensureColumnNumber(columnName);
            const cell = worksheetRow.getCell(columnNumber);
            cell.value = value;
        });
    });

    await workbook.xlsx.writeFile(filePath);
}

ipcMain.handle('excel:open', async () => {
    try {
        const result = await handleOpenWorkbook();
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : '读取 Excel 文件时发生未知错误。';
        return { canceled: false, error: message };
    }
});

ipcMain.handle(
    'excel:read-row',
    async (_event, payload: { filePath: string; sheetName: string; rowName: string }) => {
        try {
            const { row, columnNames } = await readRowByName(payload.filePath, payload.sheetName, payload.rowName);
            return { ok: true, rowName: payload.rowName, row, columnNames };
        } catch (error) {
            const message = error instanceof Error ? error.message : '读取单行数据时发生未知错误。';
            return { ok: false, error: message };
        }
    }
);

ipcMain.handle('excel:save', async (_event, payload: { filePath: string; sheetName: string; rows: RowRecord[] }) => {
    try {
        await writeWorkbookToDisk(payload.filePath, payload.rows, payload.sheetName);
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : '写入 Excel 文件失败。';
        return { ok: false, error: message };
    }
});

ipcMain.handle('excel:save-as', async (_event, payload: { defaultPath?: string; sheetName: string; rows: RowRecord[] }) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog({
            defaultPath: payload.defaultPath,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (canceled || !filePath) {
            return { canceled: true };
        }

        await writeWorkbookToDisk(filePath, payload.rows, payload.sheetName);
        return { canceled: false, filePath, ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : '写入 Excel 文件失败。';
        return { canceled: false, ok: false, error: message };
    }
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        title: 'Excel原子编辑工具',
        width: 1500,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        webPreferences: {
            preload: join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(join(__dirname, '../../index.html'));
    }

    const delegate = FAtomExpressionParser.main("DealDamageByBuffHitConfigID(False, False, 1, 1007)");
    const json = JSON.stringify(delegate, undefined, '  ');
    console.log(json);
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});