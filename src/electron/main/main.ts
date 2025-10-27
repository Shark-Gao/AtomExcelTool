// src/electron/main/main.ts
import { join } from 'path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { read, utils, write, type WorkSheet } from 'xlsx';

type RowRecord = Record<string, string>;
type RawMatrix = string[][];

const ROW_NAME_IDENTIFIER = 'rowname';

const isDev = !app.isPackaged;//process.env.npm_lifecycle_event === 'app:dev';

function normalizeHeaderIdentifier(label: string): string {
    return label.replace(/\s+/g, '').toLowerCase();
}

function isRowNameLabel(label: string): boolean {
    const normalized = normalizeHeaderIdentifier(label);
    return normalized.startsWith(ROW_NAME_IDENTIFIER);
}

function normalizeRow(row: Record<string, unknown>): RowRecord {
    const normalized: RowRecord = {};
    Object.entries(row).forEach(([columnName, value]) => {
        normalized[columnName] = value === undefined || value === null ? '' : String(value);
    });
    return normalized;
}

function ensureRowName(record: RowRecord): string {
    const possibleKeys = Object.keys(record);
    for (const key of possibleKeys) {
        if (isRowNameLabel(key)) {
            const value = record[key];
            if (value && value.toString().trim().length > 0) {
                return value;
            }
        }
    }
    throw new Error('未找到 RowName 列，请确认表头包含 RowName。');
}

function convertSheetToRawMatrix(sheet: WorkSheet): RawMatrix {
    return utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: ''
    }) as RawMatrix;
}

function findHeaderRowIndex(rawMatrix: RawMatrix): number {
    for (let rowIndex = 0; rowIndex < rawMatrix.length; rowIndex += 1) {
        const row = rawMatrix[rowIndex];
        const hasRowNameHeader = row.some((cellValue) => typeof cellValue === 'string' && isRowNameLabel(cellValue));
        if (hasRowNameHeader) {
            return rowIndex;
        }
    }

    throw new Error('未自动识别到包含 RowName 的表头行，请检查 Excel 列标题。');
}

function buildHeaderFromMatrixRow(headerRow: string[]): string[] {
    const headerSet = new Set<string>();
    headerRow.forEach((cellValue, columnIndex) => {
        const headerLabel = typeof cellValue === 'string' ? cellValue.trim() : '';
        if (!headerLabel) {
            headerSet.add(`Column${columnIndex + 1}`);
            return;
        }

        let candidateLabel = headerLabel;
        let duplicateCount = 1;
        while (headerSet.has(candidateLabel)) {
            duplicateCount += 1;
            candidateLabel = `${headerLabel}_${duplicateCount}`;
        }
        headerSet.add(candidateLabel);
    });

    return Array.from(headerSet);
}

function convertMatrixToObjects(matrix: RawMatrix, headerRowIndex: number): Record<string, unknown>[] {
    const headerRow = matrix[headerRowIndex];
    if (!headerRow) {
        throw new Error('未找到表头行数据，请检查 Excel 文件。');
    }

    const headerColumns = buildHeaderFromMatrixRow(headerRow);
    const dataRows = matrix.slice(headerRowIndex + 1);

    if (!dataRows.length) {
        throw new Error('识别到表头行后没有数据行，请检查 Excel 文件内容。');
    }

    return dataRows.map((dataRow, dataRowIndex) => {
        const record: Record<string, unknown> = {};
        let hasRowNameValue = false;
        headerColumns.forEach((columnName, columnIndex) => {
            const cellValue = dataRow[columnIndex];
            const isRowName = isRowNameLabel(columnName);
            if (isRowName) {
                hasRowNameValue = typeof cellValue === 'string' ? cellValue.trim().length > 0 : cellValue !== undefined && cellValue !== null;
            }
            record[columnName] = cellValue === undefined || cellValue === null ? '' : cellValue;
        });

        if (!hasRowNameValue) {
            throw new Error(`第 ${dataRowIndex + 1} 行数据缺少 RowName 值，请检查 Excel 数据。`);
        }

        return record;
    });
}

function extractRowsWithDynamicHeader(sheet: WorkSheet): Record<string, unknown>[] {
    const rawMatrix = convertSheetToRawMatrix(sheet);

    if (!rawMatrix.length) {
        throw new Error('工作表没有数据行。');
    }

    const headerRowIndex = findHeaderRowIndex(rawMatrix);
    const objects = convertMatrixToObjects(rawMatrix, headerRowIndex);

    return objects;
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
    const buffer = await readFile(filePath);
    const workbook = read(buffer, { type: 'buffer' });

    if (!workbook.SheetNames.length) {
        throw new Error('所选 Excel 文件中没有可读取的工作表。');
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = extractRowsWithDynamicHeader(sheet);

    if (!rawRows.length) {
        throw new Error('工作表没有数据行。');
    }

    const rows = rawRows.map((row) => {
        const normalized = normalizeRow(row);
        const rowName = ensureRowName(normalized);
        normalized.RowName = rowName;
        return normalized;
    });

    return {
        canceled: false,
        filePath,
        sheetName,
        rowCount: rows.length,
        rows
    };
}

async function writeWorkbookToDisk(filePath: string, rows: RowRecord[], sheetName: string) {
    if (!rows.length) {
        throw new Error('没有可写入的数据行。');
    }

    const sheet = utils.json_to_sheet(rows);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, sheetName || 'Sheet1');
    const buffer = write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    await writeFile(filePath, buffer);
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
        width: 1280,
        height: 800,
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
        // mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(join(__dirname, '../../index.html'));
    }
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