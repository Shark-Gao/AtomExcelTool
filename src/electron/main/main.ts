// src/electron/main/main.ts
import { join } from 'path';
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import ExcelJS from 'exceljs';
import { FAtomExpressionParser, FunctionNameToDelegate } from './MHTsAtomSystemUtils';
import {DelegateMetadataGenerator} from './DelegateMetadataGenerator';
import { deParseJsonToExpression } from './DeParseJsonToExpression';
import { runAllTests } from './DeParseJsonToExpression.test';

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
    let lastHeaderRowNumber = -1;
    
    for (let r = 5; r >= 1; r -= 1) {
        const row = worksheet.getRow(r);
        for (let c = 1; c <= worksheet.columnCount; c += 1) {
            const text = row.getCell(c).text || '';
            if (isRowNameLabel(text)) {
                lastHeaderRowNumber = r;
                break; // 找到当前行的 RowName 后，继续检查下一行
            }
        }
        if (lastHeaderRowNumber != -1) {
            break
        }
    }
    
    if (lastHeaderRowNumber === -1) {
        throw new Error('未自动识别到包含 RowName 的表头行，请检查 Excel 列标题。');
    }
    
    return lastHeaderRowNumber;
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
    const rowsData: Record<string, RowRecord> = {};
    
    for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r += 1) {
        const row = worksheet.getRow(r);
        const record = extractRowRecord(row, headerLabels);
        const rowName = (record[headerLabels[rowNameColumnNumber - 1]] || '').trim();
        if (rowName.length === 0) {
            continue;
        }
        rows.push(record);
        rowsData[rowName] = record;
    }

    return {
        canceled: false,
        filePath,
        sheetName: worksheet.name,
        rowCount: rows.length,
        columnNames: headerLabels,
        rows,
        rowNames,
        rowNameColumnName: headerLabels[rowNameColumnNumber - 1],
        columnDescriptions: (() => {
            const descRow = worksheet.getRow(1);
            const map: Record<string, string> = {};
            headerLabels.forEach((label, idx) => {
                const text = (descRow.getCell(idx + 1).text || '').trim();
                map[label] = text;
            });
            return map;
        })()
    };
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

ipcMain.handle('delegate:get-metadata', async () => {
    try {
        const metadata = DelegateMetadataGenerator.generateMetadataFromFunctionMap(FunctionNameToDelegate);
        const registry = DelegateMetadataGenerator.generateClassRegistry(metadata);
        const grouped = DelegateMetadataGenerator.groupMetadataByBaseClass(metadata);

        // const delegate = FAtomExpressionParser.main("ConditionalAction(CheckInteractActionType(1),NOP(),Heal(Self(), GetAttr(MaxHealth) * 0.02))");
        const delegate = FAtomExpressionParser.main("NOP()");
        const defaultJson = JSON.stringify(delegate, undefined, '  ');
        console.log(defaultJson);
        runAllTests()

        return {
            ok: true,
            metadata,
            registry,
            grouped,
            defaultJson,
            count: metadata.length
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : '生成Delegate元数据失败。';
        console.error('[delegate:get-metadata]', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('condition:parse-expression', async (_event, payload: { expression: string }) => {
    try {
        const parsed = FAtomExpressionParser.main(payload.expression);
        if (!parsed) {
            return { ok: false, error: '表达式解析失败，返回值为空。' };
        }
        const json = JSON.stringify(parsed, null, 2);
        return { ok: true, parsed, json };
    } catch (error) {
        const message = error instanceof Error ? error.message : '解析条件表达式时发生未知错误。';
        console.error('[condition:parse-expression]', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('delegate:parse-condition-field', async (_event, payload: { fieldName: string; rawValue: string }) => {
    try {
        if (!payload.rawValue || typeof payload.rawValue !== 'string') {
            return { ok: false, error: '字段值为空或无效。' };
        }

        const parsed = FAtomExpressionParser.main(payload.rawValue);
        if (!parsed) {
            return { ok: false, error: `字段 ${payload.fieldName} 解析失败，返回值为空。` };
        }

        return { ok: true, parsed };
    } catch (error) {
        const message = error instanceof Error ? error.message : `解析字段 ${payload.fieldName} 时发生未知错误。`;
        console.error(`[delegate:parse-condition-field] ${payload.fieldName}:`, message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('delegate:deparse-json-to-expression', async (_event, payload: { json: any }) => {
    try {
        if (!payload.json || typeof payload.json !== 'object') {
            return { ok: false, error: 'JSON 对象为空或无效。' };
        }

        const expression = deParseJsonToExpression(payload.json);
        if (!expression) {
            return { ok: false, error: '反向解析失败，返回值为空。' };
        }

        return { ok: true, expression };
    } catch (error) {
        const message = error instanceof Error ? error.message : '反向解析 JSON 时发生未知错误。';
        console.error('[delegate:deparse-json-to-expression]:', message);
        return { ok: false, error: message };
    }
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        title: 'Excel原子编辑工具',
        width: 1500,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        backgroundColor: '#111827', // 与暗色主题接近，避免闪白
        show: false, // 等待渲染就绪再显示，避免白屏
        webPreferences: {
            preload: join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
    });

    // 禁用菜单栏
    Menu.setApplicationMenu(null);

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(join(__dirname, '../../index.html'));
    }

    // 初始 HTML 解析完成即显示（可看到 index.html 中的 Skeleton）
    mainWindow.webContents.once('dom-ready', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.show();
        }
    });

    // const out = FAtomExpressionParser.serializeDelegate(delegate);
    // console.log(out);
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