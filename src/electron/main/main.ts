// src/electron/main/main.ts
import { join, extname } from 'path';
import { existsSync } from 'fs';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ExcelJS from 'exceljs';
import { FAtomExpressionParser } from './MHTsAtomSystemUtils';
import {DelegateMetadataGenerator} from './DelegateMetadataGenerator';
import { deParseJsonToExpression } from './DeParseJsonToExpression';
import { AtomFieldsConfigLoader } from './AtomFieldsConfigLoader';
import { LogManager } from './LogManager';
// import { runAllTests } from './DeParseJsonToExpression.test';

// 在应用启动时立即初始化日志系统
const logManager = LogManager.getInstance();
logManager.initialize();

const execFileAsync = promisify(execFile);
const EXCEL_CONTEXT_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.xlsb'];
const EXCEL_CONTEXT_MENU_KEY = 'MHAtomExcelTool';
const EXCEL_CONTEXT_MENU_TITLE = '原子Excel编辑器';
const EXCEL_CONTEXT_BASE_KEY = 'HKCU\\Software\\Classes\\SystemFileAssociations';

type RowRecord = Record<string, string>;

type WorkbookOpenPayload = {
    filePath: string;
    sheetName: string;
    rowCount: number;
    columnNames: string[];
    rows: RowRecord[];
    rowNames: string[];
    rowNameColumnName: string;
    columnDescriptions: Record<string, string>;
    sheetList: string[];
};

type WorksheetScanPayload = {
    sheetName: string;
    rowCount: number;
    columnNames: string[];
    rowNameColumnName: string;
    columnDescriptions: Record<string, string>;
    rows: RowRecord[];
};

type WorksheetScanError = {
    sheetName: string;
    error: string;
};

type WorkbookScanPayload = {
    filePath: string;
    sheets: WorksheetScanPayload[];
    sheetErrors: WorksheetScanError[];
};

const ROW_NAME_IDENTIFIER = 'rowname';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
const pendingExternalExcelPaths: string[] = [];

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    console.log('[Single-Instance Lock] 应用已在运行，退出当前实例。');
    app.quit();
    process.exit(0);
}

console.log('[App Start] 获取单实例锁成功');

function normalizeArgumentPath(arg: string): string {
    return arg.replace(/^['"']+|['"']+$/g, '');
}

function isExcelFilePath(targetPath: string): boolean {
    if (!targetPath) {
        return false;
    }
    const extension = extname(targetPath).toLowerCase();
    return EXCEL_CONTEXT_EXTENSIONS.includes(extension);
}

function extractExcelFilePathFromArgs(args: string[]): string | null {
    console.log('[Startup Args] 解析启动参数:', JSON.stringify(args));
    for (const rawArg of args) {
        if (!rawArg || rawArg.startsWith('-')) {
            continue;
        }
        const normalized = normalizeArgumentPath(rawArg);
        if (!isExcelFilePath(normalized)) {
            console.log('[Startup Args] 跳过非 Excel 文件:', normalized);
            continue;
        }
        if (!existsSync(normalized)) {
            console.log('[Startup Args] 文件不存在:', normalized);
            continue;
        }
        console.log('[Startup Args] 发现有效的 Excel 文件:', normalized);
        return normalized;
    }
    console.log('[Startup Args] 未发现启动参数中的 Excel 文件');
    return null;
}

function queueExternalExcelPath(filePath: string | null | undefined) {
    if (!filePath) {
        return;
    }
    console.log('[External Excel Path] 队列化文件路径:', filePath);
    pendingExternalExcelPaths.push(filePath);
    dispatchExternalExcelPaths();
}

function dispatchExternalExcelPaths() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.log('[Dispatch Excel Paths] 主窗口未就绪，待命传递 ' + pendingExternalExcelPaths.length + ' 个文件');
        return;
    }
    while (pendingExternalExcelPaths.length > 0) {
        const nextPath = pendingExternalExcelPaths.shift();
        if (nextPath) {
            console.log('[Dispatch Excel Paths] 向渲染层发送文件路径:', nextPath);
            mainWindow.webContents.send('excel:open-external-path', nextPath);
        }
    }
}

const startupExcelPath = extractExcelFilePathFromArgs(process.argv);
queueExternalExcelPath(startupExcelPath);

app.on('second-instance', (event, commandLine) => {
    event.preventDefault();
    console.log('[Second Instance] 捕获第二实例，命令行:', JSON.stringify(commandLine));
    const filePath = extractExcelFilePathFromArgs(commandLine);
    if (filePath) {
        queueExternalExcelPath(filePath);
    }
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            console.log('[Second Instance] 还原最小化窗口');
            mainWindow.restore();
        }
        console.log('[Second Instance] 聚焦主窗口');
        mainWindow.focus();
    }
});

app.on('open-file', (event, filePath) => {
    event.preventDefault();
    console.log('[Open File Event] 捕获 macOS 打开文件事件:', filePath);
    queueExternalExcelPath(filePath);
});

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

function buildWorksheetPayload(worksheet: ExcelJS.Worksheet): WorksheetScanPayload {
    const { headerRowNumber, headerLabels, rowNameColumnNumber } = extractHeaderMetadata(worksheet);
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

    const columnDescriptions: Record<string, string> = {};
    const descRow = worksheet.getRow(1);
    headerLabels.forEach((label, idx) => {
        const text = (descRow.getCell(idx + 1).text || '').trim();
        columnDescriptions[label] = text;
    });

    return {
        sheetName: worksheet.name,
        rowCount: rows.length,
        columnNames: headerLabels,
        rowNameColumnName: headerLabels[rowNameColumnNumber - 1],
        columnDescriptions,
        rows
    };
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

async function loadWorkbookFromFile(filePath: string): Promise<WorkbookOpenPayload> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    if (!workbook.worksheets.length) {
        throw new Error('所选 Excel 文件中没有可读取的工作表。');
    }

    const sheetList = workbook.worksheets.map((ws) => ws.name);
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

    const columnDescriptions: Record<string, string> = {};
    const descRow = worksheet.getRow(1);
    headerLabels.forEach((label, idx) => {
        const text = (descRow.getCell(idx + 1).text || '').trim();
        columnDescriptions[label] = text;
    });

    return {
        filePath,
        sheetName: worksheet.name,
        rowCount: rows.length,
        columnNames: headerLabels,
        rows,
        rowNames,
        rowNameColumnName: headerLabels[rowNameColumnNumber - 1],
        columnDescriptions,
        sheetList
    };
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
    const payload = await loadWorkbookFromFile(filePath);

    return {
        canceled: false,
        ...payload
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

async function registerExcelContextMenu() {
    if (process.platform !== 'win32') {
        throw new Error('仅支持在 Windows 上注册右键菜单。');
    }

    const exePath = app.getPath('exe');
    const commandValue = `"${exePath}" "%1"`;
    console.log('注册右键菜单:', commandValue);

    for (const ext of EXCEL_CONTEXT_EXTENSIONS) {
        const shellKey = `${EXCEL_CONTEXT_BASE_KEY}\\${ext}\\shell\\${EXCEL_CONTEXT_MENU_KEY}`;
        const commandKey = `${shellKey}\\command`;

        await execFileAsync('reg', ['add', shellKey, '/ve', '/d', EXCEL_CONTEXT_MENU_TITLE, '/f']);
        await execFileAsync('reg', ['add', shellKey, '/v', 'Icon', '/t', 'REG_SZ', '/d', exePath, '/f']);
        await execFileAsync('reg', ['add', commandKey, '/ve', '/d', commandValue, '/f']);
    }
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

ipcMain.handle('excel:open-by-path', async (_event, payload: { filePath: string }) => {
    try {
        if (!payload?.filePath) {
            throw new Error('文件路径为空。');
        }
        console.log('[IPC excel:open-by-path] 开始加载文件:', payload.filePath);
        const result = await loadWorkbookFromFile(payload.filePath);
        console.log('[IPC excel:open-by-path] 文件加载成功，工作表:', result.sheetName, '行数:', result.rowCount);
        return { canceled: false, ...result };
    } catch (error) {
        const message = error instanceof Error ? error.message : '通过路径打开 Excel 文件失败。';
        console.error('[IPC excel:open-by-path] 错误:', message);
        return { canceled: false, error: message };
    }
});

ipcMain.handle('excel:open-multiple', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
        });

        if (canceled || !filePaths || filePaths.length === 0) {
            return { canceled: true };
        }

        const workbooks: WorkbookScanPayload[] = [];
        const errors: { filePath: string; error: string }[] = [];

        for (const filePath of filePaths) {
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(filePath);

                const sheetPayloads: WorksheetScanPayload[] = [];
                const sheetErrors: WorksheetScanError[] = [];

                if (!workbook.worksheets.length) {
                    sheetErrors.push({ sheetName: '未找到工作表', error: '工作簿中没有可读取的工作表。' });
                }

                workbook.worksheets.forEach((worksheet) => {
                    try {
                        const payload = buildWorksheetPayload(worksheet);
                        sheetPayloads.push(payload);
                    } catch (sheetError) {
                        const message = sheetError instanceof Error ? sheetError.message : '读取工作表失败。';
                        sheetErrors.push({ sheetName: worksheet.name, error: message });
                    }
                });

                workbooks.push({ filePath, sheets: sheetPayloads, sheetErrors });
            } catch (workbookError) {
                const message = workbookError instanceof Error ? workbookError.message : '读取 Excel 文件失败。';
                errors.push({ filePath, error: message });
            }
        }

        return { canceled: false, workbooks, errors };
    } catch (error) {
        const message = error instanceof Error ? error.message : '选择 Excel 文件时发生未知错误。';
        return { canceled: false, workbooks: [], errors: [{ filePath: '', error: message }] };
    }
});

ipcMain.handle('excel:load-sheet', async (_event, payload: { filePath: string; sheetName: string }) => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(payload.filePath);

        const worksheet = workbook.getWorksheet(payload.sheetName);
        if (!worksheet) {
            throw new Error(`未找到工作表: ${payload.sheetName}`);
        }

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
            ok: true,
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
    } catch (error) {
        const message = error instanceof Error ? error.message : '加载工作表失败。';
        return { ok: false, error: message };
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
        const metadata = DelegateMetadataGenerator.generateMetadataFromMetaJsonConfig();
        const registry = DelegateMetadataGenerator.generateClassRegistry(metadata);
        const grouped = DelegateMetadataGenerator.groupMetadataByBaseClass(metadata);

        return {
            ok: true,
            metadata,
            registry,
            grouped,
            count: metadata.length
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : '生成Delegate元数据失败。';
        console.error('[delegate:get-metadata]', message);
        return { ok: false, error: message };
    }
});

function preprocessCombinationExpression(rawValue: string, allowCombination: boolean): { expression: string; isCombination: boolean } {
    if (!allowCombination || !rawValue || typeof rawValue !== 'string') {
        return { expression: rawValue, isCombination: false };
    }

    const trimmed = rawValue.trim();
    if (!trimmed.includes(';')) {
        return { expression: rawValue, isCombination: false };
    }

    if (/^CombineActions?\s*\(/i.test(trimmed)) {
        return { expression: rawValue, isCombination: true };
    }

    const segments = trimmed
        .split(';')
        .map(segment => segment.trim())
        .filter(segment => segment.length > 0);

    if (segments.length <= 1) {
        return { expression: rawValue, isCombination: false };
    }

    const combinedExpression = `CombineActions(${segments.join(', ')})`;
    return { expression: combinedExpression, isCombination: true };
}

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

ipcMain.handle('delegate:parse-condition-field', async (_event, payload: { fieldName: string; rawValue: string; sheetName?: string; fileName?: string }) => {
    try {
        if (!payload.rawValue || typeof payload.rawValue !== 'string') {
            return { ok: false, error: '字段值为空或无效。' };
        }

        const loader = AtomFieldsConfigLoader.getInstance();
        const fieldRuleInfo = loader.getFieldRuleInfo(payload.fieldName, payload.sheetName, payload.fileName);
        const { expression: expressionToParse } = preprocessCombinationExpression(payload.rawValue, fieldRuleInfo.allowCombination);

        const parsed = FAtomExpressionParser.main(expressionToParse);
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

ipcMain.handle('config:get-atom-fields-config', async () => {
    try {
        const loader = AtomFieldsConfigLoader.getInstance();
        const config = loader.getConfig();
        return { ok: true, config };
    } catch (error) {
        const message = error instanceof Error ? error.message : '获取原子字段配置失败。';
        console.error('[config:get-atom-fields-config]:', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('config:get-allowed-base-classes', async (_event, payload: { fieldName: string; sheetName?: string; fileName?: string }) => {
    try {
        const loader = AtomFieldsConfigLoader.getInstance();
        const baseClasses = loader.getAllowedBaseClassesForField(payload.fieldName, payload.sheetName, payload.fileName);
        return { ok: true, baseClasses };
    } catch (error) {
        const message = error instanceof Error ? error.message : '获取允许的基类失败。';
        console.error('[config:get-allowed-base-classes]:', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('config:is-atomic-field', async (_event, payload: { fieldName: string; sheetName?: string; fileName?: string }) => {
    try {
        const loader = AtomFieldsConfigLoader.getInstance();
        const isAtomic = loader.isAtomicField(payload.fieldName, payload.sheetName, payload.fileName);
        return { ok: true, isAtomic };
    } catch (error) {
        const message = error instanceof Error ? error.message : '判断原子字段失败。';
        console.error('[config:is-atomic-field]:', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('app:get-log-info', async () => {
    try {
        const logDir = logManager.getLogDir();
        const logFilePath = logManager.getLogFilePath();
        return { ok: true, logDir, logFilePath };
    } catch (error) {
        const message = error instanceof Error ? error.message : '获取日志信息失败。';
        console.error('[app:get-log-info]:', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    try {
        if (!filePath) {
            return { ok: false, error: '文件路径为空' };
        }
        await shell.openPath(filePath);
        console.log('[shell:openPath] 打开目录:', filePath);
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : '打开路径失败。';
        console.error('[shell:openPath]:', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('shell:register-excel-context-menu', async () => {
    try {
        console.log('[IPC shell:register-excel-context-menu] 开始注册 Excel 右键菜单');
        await registerExcelContextMenu();
        console.log('[IPC shell:register-excel-context-menu] 右键菜单注册成功');
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : '注册右键菜单失败。';
        console.error('[IPC shell:register-excel-context-menu] 失败:', message);
        return { ok: false, error: message };
    }
});

function createWindow() {
    mainWindow = new BrowserWindow({
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

    const windowRef = mainWindow;
    if (!windowRef) {
        return;
    }

    // 禁用菜单栏
    Menu.setApplicationMenu(null);

    if (isDev) {
        windowRef.loadURL('http://localhost:5173');
    } else {
        windowRef.loadFile(join(__dirname, '../../index.html'));
    }

    // 生产模式：通过快捷键打开开发者工具
    windowRef.webContents.on('before-input-event', (event, input) => {
        // F12 或 Ctrl+Shift+I 打开开发者工具
        if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
            windowRef.webContents.toggleDevTools();
            event.preventDefault();
        }
        // F12 打开开发者工具
        if (input.key === 'F12') {
            windowRef.webContents.toggleDevTools();
            event.preventDefault();
        }
    });
    
    // 初始 HTML 解析完成即显示（可看到 index.html 中的 Skeleton）
    windowRef.webContents.once('dom-ready', () => {
        if (windowRef.isDestroyed()) {
            return;
        }
        windowRef.show();
        dispatchExternalExcelPaths();
    });

    windowRef.on('closed', () => {
        mainWindow = null;
    });

    // const out = FAtomExpressionParser.serializeDelegate(delegate);
    // console.log(out);
}

app.whenReady().then(async () => {
    console.log('[main] 应用准备就绪，开始初始化...');
    
    // 初始化原子字段配置加载器
    try {
        console.log('[main] 开始加载原子字段配置...');
        const configLoader = AtomFieldsConfigLoader.getInstance();
        await configLoader.load();
        console.log('[main] ✅ 原子字段配置加载成功');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[main] ❌ 原子字段配置加载失败，将使用默认规则');
        console.error('[main] 详细错误:', errorMsg);
        if (error instanceof Error) {
            console.error('[main] 堆栈:', error.stack);
        }
    }
    
    console.log('[main] 创建应用窗口...');
    createWindow();
    console.log('[main] 窗口创建完成');
    
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            console.log('[main] 激活事件：重新创建窗口');
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});