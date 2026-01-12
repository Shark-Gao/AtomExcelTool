// src/electron/main/main.ts
import { join, extname, basename } from 'path';
import { existsSync, chmodSync, statSync, constants } from 'fs';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ExcelJS from 'exceljs';
// @ts-ignore - xlsx-populate 没有类型定义
import XlsxPopulate from 'xlsx-populate';
import { FAtomExpressionParser } from './MHTsAtomSystemUtils';
import {DelegateMetadataGenerator} from './DelegateMetadataGenerator';
import { deParseJsonToExpression } from './DeParseJsonToExpression';
import { AtomFieldsConfigLoader } from './AtomFieldsConfigLoader';
import { LogManager } from './LogManager';
import { initHunyuanService, getHunyuanService, HunyuanConfig } from './HunyuanService';
import { initDeepSeekService, getDeepSeekService, DeepSeekConfig } from './DeepSeekService';
import { initP4Service, getP4Config, isP4Configured, testP4Connection, isFileUnderP4, checkoutFile, getFileStatus, P4Config, checkExeUpdateWithoutConfig, openCmdForP4Sync, getFileChangeDescriptions } from './P4Service';
// import { runAllTests } from './DeParseJsonToExpression.test';



// AI 服务相关变量（需要在 delegate:get-metadata 之前声明）
let aiConfigured = false;
let aiConfig: { model: string } = { model: 'hunyuan-2.0-thinking-20251109' };
let cachedAtomMetadata: any[] | null = null;

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

/**
 * P4 更新对话框的配置参数
 */
interface P4UpdateDialogOptions {
    hasUpdate: boolean;
    isUnderP4: boolean;
    message: string;
    haveRev?: string;
    headRev?: string;
    exeDir: string;
    filePath: string;
    changeDescriptions: string[];
    isDevMode: boolean;
}

/**
 * 显示 P4 更新对话框（带滚动条的自定义窗口）
 * @returns 用户选择的操作: 'update' | 'later'
 */
async function showP4UpdateDialog(options: P4UpdateDialogOptions): Promise<'update' | 'later'> {
    const {
        hasUpdate,
        isUnderP4,
        message,
        haveRev,
        headRev,
        exeDir,
        filePath,
        changeDescriptions,
        isDevMode
    } = options;

    const updateWindow = new BrowserWindow({
        width: 500,
        height: 450,
        minWidth: 400,
        minHeight: 350,
        resizable: true,
        minimizable: false,
        maximizable: false,
        alwaysOnTop: true,
        title: isDevMode ? '[DEV TEST] P4 更新检查' : '发现新版本',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    
    updateWindow.setMenu(null);
    
    // 构建 HTML 内容
    const titleText = hasUpdate ? '工具有新版本可用' : (isUnderP4 ? '已是最新版本' : 'P4 检查结果');
    const versionInfo = hasUpdate 
        ? message 
        : `当前已是最新版本<br>本地版本: #${haveRev}<br>服务器版本: #${headRev}`;
    const dirInfo = isUnderP4 ? `工具目录: ${exeDir}` : `检查路径: ${filePath}`;
    
    const changelogHtml = changeDescriptions.length > 0 
        ? `<div class="changelog-section">
            <div class="changelog-title">📋 更新内容 (${changeDescriptions.length} 条提交):</div>
            <div class="changelog-list">
                ${changeDescriptions.map((d, i) => `<div class="changelog-item">${i + 1}. ${d.replace(/\n/g, '<br>&nbsp;&nbsp;&nbsp;')}</div>`).join('')}
            </div>
           </div>`
        : '';
    
    const showUpdateButton = hasUpdate || isDevMode;
    const primaryBtnText = hasUpdate ? '更新' : '测试打开CMD';
    const secondaryBtnText = hasUpdate ? '稍后' : '关闭';
    
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
                padding: 20px;
                background: #f5f5f5;
                color: #333;
                display: flex;
                flex-direction: column;
                height: 100vh;
            }
            .header {
                display: flex;
                align-items: center;
                margin-bottom: 15px;
            }
            .icon {
                width: 48px;
                height: 48px;
                margin-right: 15px;
                background: #0078d4;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
            }
            .title {
                font-size: 18px;
                font-weight: 600;
            }
            .info-section {
                background: white;
                border-radius: 8px;
                padding: 12px 15px;
                margin-bottom: 15px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .version-info {
                font-size: 14px;
                line-height: 1.6;
                color: #444;
            }
            .dir-info {
                font-size: 12px;
                color: #666;
                margin-top: 8px;
                word-break: break-all;
            }
            .changelog-section {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-height: 0;
                background: white;
                border-radius: 8px;
                padding: 12px 15px;
                margin-bottom: 15px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .changelog-title {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 10px;
                color: #0078d4;
            }
            .changelog-list {
                flex: 1;
                overflow-y: auto;
                font-size: 13px;
                line-height: 1.6;
                padding-right: 5px;
            }
            .changelog-list::-webkit-scrollbar {
                width: 6px;
            }
            .changelog-list::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
            }
            .changelog-list::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 3px;
            }
            .changelog-list::-webkit-scrollbar-thumb:hover {
                background: #a1a1a1;
            }
            .changelog-item {
                padding: 6px 0;
                border-bottom: 1px solid #eee;
            }
            .changelog-item:last-child {
                border-bottom: none;
            }
            .footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding-top: 5px;
            }
            .footer-hint {
                flex: 1;
                font-size: 12px;
                color: #666;
                align-self: center;
            }
            .btn {
                padding: 8px 20px;
                border: none;
                border-radius: 4px;
                font-size: 14px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .btn-primary {
                background: #0078d4;
                color: white;
            }
            .btn-primary:hover {
                background: #006cbd;
            }
            .btn-secondary {
                background: #e1e1e1;
                color: #333;
            }
            .btn-secondary:hover {
                background: #d1d1d1;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="icon">↑</div>
            <div class="title">${titleText}</div>
        </div>
        <div class="info-section">
            <div class="version-info">${versionInfo}</div>
            <div class="dir-info">${dirInfo}</div>
        </div>
        ${changelogHtml}
        <div class="footer">
            ${hasUpdate ? '<div class="footer-hint">点击"更新"将打开命令行窗口执行 P4 同步</div>' : ''}
            <div id="buttons"></div>
        </div>
        <script>
            // 使用全局变量存储用户操作（data: URL 无法使用 localStorage）
            window.p4UpdateAction = null;
            
            document.getElementById('buttons').innerHTML = \`
                ${showUpdateButton 
                    ? `<button class="btn btn-primary" id="btnUpdate">${primaryBtnText}</button>
                       <button class="btn btn-secondary" id="btnLater">${secondaryBtnText}</button>`
                    : `<button class="btn btn-primary" id="btnLater">确定</button>`
                }
            \`;
            
            const btnUpdate = document.getElementById('btnUpdate');
            const btnLater = document.getElementById('btnLater');
            
            if (btnUpdate) {
                btnUpdate.addEventListener('click', () => {
                    window.p4UpdateAction = 'update';
                });
            }
            if (btnLater) {
                btnLater.addEventListener('click', () => {
                    window.p4UpdateAction = 'later';
                });
            }
        </script>
    </body>
    </html>
    `;
    
    updateWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    // 等待窗口关闭并获取用户选择
    return new Promise<'update' | 'later'>((resolve) => {
        let resolved = false;
        let checkAction: NodeJS.Timeout | null = null;
        
        const doResolve = (action: 'update' | 'later') => {
            if (resolved) return;
            resolved = true;
            if (checkAction) {
                clearInterval(checkAction);
                checkAction = null;
            }
            resolve(action);
        };
        
        updateWindow.on('closed', () => {
            // 窗口关闭时，如果还没有解析，则默认为 'later'
            doResolve('later');
        });
        
        // 通过轮询全局变量获取用户操作
        checkAction = setInterval(async () => {
            if (resolved || updateWindow.isDestroyed()) {
                if (checkAction) {
                    clearInterval(checkAction);
                    checkAction = null;
                }
                return;
            }
            try {
                const action = await updateWindow.webContents.executeJavaScript('window.p4UpdateAction');
                if (action && !resolved) {
                    await updateWindow.webContents.executeJavaScript('window.p4UpdateAction = null');
                    const userAction = action as 'update' | 'later';
                    doResolve(userAction);
                    // 延迟关闭窗口，确保 resolve 先执行
                    setTimeout(() => {
                        if (!updateWindow.isDestroyed()) {
                            updateWindow.close();
                        }
                    }, 50);
                }
            } catch {
                // 窗口可能已关闭，不做处理
            }
        }, 100);
    });
}

let mainWindow: BrowserWindow | null = null;
const pendingExternalExcelPaths: string[] = [];

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    console.log('[Single-Instance Lock] App already running, exiting current instance.');
    app.quit();
    process.exit(0);
}

console.log('[App Start] Single instance lock acquired successfully');

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
    console.log('[Startup Args] Parsing startup arguments:', JSON.stringify(args));
    for (const rawArg of args) {
        if (!rawArg || rawArg.startsWith('-')) {
            continue;
        }
        const normalized = normalizeArgumentPath(rawArg);
        if (!isExcelFilePath(normalized)) {
            console.log('[Startup Args] Skipping non-Excel file:', normalized);
            continue;
        }
        if (!existsSync(normalized)) {
            console.log('[Startup Args] File does not exist:', normalized);
            continue;
        }
        console.log('[Startup Args] Found valid Excel file:', normalized);
        return normalized;
    }
    console.log('[Startup Args] No Excel file found in startup arguments');
    return null;
}

function queueExternalExcelPath(filePath: string | null | undefined) {
    if (!filePath) {
        return;
    }
    console.log('[External Excel Path] Queuing file path:', filePath);
    pendingExternalExcelPaths.push(filePath);
    dispatchExternalExcelPaths();
}

function dispatchExternalExcelPaths() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.log('[Dispatch Excel Paths] Main window not ready, pending ' + pendingExternalExcelPaths.length + ' file(s)');
        return;
    }
    while (pendingExternalExcelPaths.length > 0) {
        const nextPath = pendingExternalExcelPaths.shift();
        if (nextPath) {
            console.log('[Dispatch Excel Paths] Sending file path to renderer:', nextPath);
            mainWindow.webContents.send('excel:open-external-path', nextPath);
        }
    }
}

const startupExcelPath = extractExcelFilePathFromArgs(process.argv);
queueExternalExcelPath(startupExcelPath);

app.on('second-instance', (event, commandLine) => {
    event.preventDefault();
    console.log('[Second Instance] Captured second instance, command line:', JSON.stringify(commandLine));
    const filePath = extractExcelFilePathFromArgs(commandLine);
    if (filePath) {
        queueExternalExcelPath(filePath);
    }
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            console.log('[Second Instance] Restoring minimized window');
            mainWindow.restore();
        }
        console.log('[Second Instance] Focusing main window');
        mainWindow.focus();
    }
});

app.on('open-file', (event, filePath) => {
    event.preventDefault();
    console.log('[Open File Event] Captured macOS open-file event:', filePath);
    queueExternalExcelPath(filePath);
});

function normalizeHeaderIdentifier(label: string): string {
    return label.replace(/\s+/g, '').toLowerCase();
}

function isRowNameLabel(label: string): boolean {
    return normalizeHeaderIdentifier(label).startsWith(ROW_NAME_IDENTIFIER);
}

function getExcelFileName(filePath: string): string {
    const fileName = basename(filePath);
    return fileName.replace(/\.[^/.]+$/, ''); // 移除扩展名
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

function extractHeaderMetadata(worksheet: ExcelJS.Worksheet, xlsxFileName?: string): {
    headerRowNumber: number;
    headerLabels: string[];
    rowNameColumnNumber: number;
    dataStartRow: number;
    descriptionRow: number;
} {
    let headerRowNumber: number;
    let dataStartRow: number;
    let descriptionRow: number;
    
    // 尝试从配置中获取指定的列名行
    if (xlsxFileName) {
        const sheetName = worksheet.name;
        const configLoader = AtomFieldsConfigLoader.getInstance();
        const config = configLoader.getConfig();
        
        // 查找匹配的配置
        // 优先精确匹配（文件名+工作表名），其次匹配文件级配置（sheetName为空表示适用于该文件所有sheet）
        const headerConfig = config.headerRowConfig?.files?.find(file => 
            file.xlsxFile === xlsxFileName && file.sheetName === sheetName
        ) || config.headerRowConfig?.files?.find(file => 
            file.xlsxFile === xlsxFileName && (!file.sheetName || file.sheetName === '')
        );
        
        if (headerConfig && headerConfig.headerRowNumber) {
            headerRowNumber = headerConfig.headerRowNumber;
            dataStartRow = headerConfig.dataStartRow || (headerRowNumber + 1);
            descriptionRow = headerConfig.descriptionRow || 1;
            // logManager.info(`Using configured header row: ${headerRowNumber}, data start row: ${dataStartRow}, description row: ${descriptionRow} (file: ${xlsxFileName}, sheet: ${sheetName})`);
        } else {
            headerRowNumber = findHeaderRowNumber(worksheet);
            dataStartRow = headerRowNumber + 1;
            descriptionRow = 1;
            // logManager.info(`Config not found, using auto-detected header row: ${headerRowNumber}, data start row: ${dataStartRow}, description row: ${descriptionRow}`);
        }
    } else {
        headerRowNumber = findHeaderRowNumber(worksheet);
        dataStartRow = headerRowNumber + 1;
        descriptionRow = 1;
    }
    
    const headerRow = worksheet.getRow(headerRowNumber);
    const headerLabels = buildHeaderLabels(headerRow, worksheet.columnCount);
    const rowNameIndex = headerLabels.findIndex((label) => isRowNameLabel(label));
    if (rowNameIndex === -1) {
        throw new Error('未识别到 RowName 列，请确认表头包含 RowName。');
    }
    return {
        headerRowNumber,
        headerLabels,
        rowNameColumnNumber: rowNameIndex + 1,
        dataStartRow,
        descriptionRow
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

function buildColumnDescriptions(worksheet: ExcelJS.Worksheet, headerLabels: string[], descriptionRow: number): Record<string, string> {
    const columnDescriptions: Record<string, string> = {};
    const descRow = worksheet.getRow(descriptionRow);
    headerLabels.forEach((label, idx) => {
        const text = (descRow.getCell(idx + 1).text || '').trim();
        columnDescriptions[label] = text;
    });
    return columnDescriptions;
}

function buildWorksheetPayload(worksheet: ExcelJS.Worksheet, xlsxFileName?: string): WorksheetScanPayload {
    const { headerRowNumber, headerLabels, rowNameColumnNumber, dataStartRow, descriptionRow } = extractHeaderMetadata(worksheet, xlsxFileName);
    const rows: RowRecord[] = [];

    for (let r = dataStartRow; r <= worksheet.rowCount; r += 1) {
        const row = worksheet.getRow(r);
        const record = extractRowRecord(row, headerLabels);
        const rowName = (record[headerLabels[rowNameColumnNumber - 1]] || '').trim();
        if (rowName.length === 0) {
            continue;
        }
        rows.push(record);
    }

    const columnDescriptions = buildColumnDescriptions(worksheet, headerLabels, descriptionRow);

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

    const xlsxFileName = getExcelFileName(filePath);
    const sheetList = workbook.worksheets.map((ws) => ws.name);
    const worksheet = workbook.worksheets[0];
    const { headerRowNumber, headerLabels, rowNameColumnNumber, dataStartRow, descriptionRow } = extractHeaderMetadata(worksheet, xlsxFileName);
    const rowNames = extractRowNames(worksheet, headerRowNumber, rowNameColumnNumber);

    const rows: RowRecord[] = [];
    for (let r = dataStartRow; r <= worksheet.rowCount; r += 1) {
        const row = worksheet.getRow(r);
        const record = extractRowRecord(row, headerLabels);
        const rowName = (record[headerLabels[rowNameColumnNumber - 1]] || '').trim();
        if (rowName.length === 0) {
            continue;
        }
        rows.push(record);
    }

    const columnDescriptions = buildColumnDescriptions(worksheet, headerLabels, descriptionRow);

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

/**
 * 使用 xlsx-populate 写入 Excel 文件
 * xlsx-populate 直接操作 Excel 的 XML 结构，能完整保留原始格式
 * 包括：条件格式、数据验证、合并单元格、图表、样式、批注等
 */
async function writeWorkbookToDisk(filePath: string, rows: RowRecord[], sheetName: string) {
    // Check if file is read-only, if so, set it to writable first
    if (existsSync(filePath)) {
        try {
            const stats = statSync(filePath);
            const isReadOnly = !(stats.mode & constants.S_IWUSR);
            if (isReadOnly) {
                console.log('[writeWorkbookToDisk] File is read-only, setting to writable:', filePath);
                chmodSync(filePath, stats.mode | constants.S_IWUSR | constants.S_IWGRP | constants.S_IWOTH);
            }
        } catch (error) {
            console.warn('[writeWorkbookToDisk] Error checking/modifying file permissions:', error);
        }
    }

    // 使用 xlsx-populate 打开文件（完整保留所有格式）
    const workbook = await XlsxPopulate.fromFileAsync(filePath);
    
    // 获取目标工作表
    const targetSheet = sheetName ? workbook.sheet(sheetName) : workbook.sheet(0);
    if (!targetSheet) {
        throw new Error('目标 Excel 工作簿中没有可用工作表。');
    }

    // 使用 ExcelJS 读取元数据（表头信息等），但不用它来写入
    const excelJsWorkbook = new ExcelJS.Workbook();
    await excelJsWorkbook.xlsx.readFile(filePath);
    const excelJsSheet = sheetName ? excelJsWorkbook.getWorksheet(sheetName) : excelJsWorkbook.worksheets[0];
    if (!excelJsSheet) {
        throw new Error('无法读取工作表元数据。');
    }

    const xlsxFileName = getExcelFileName(filePath);
    const { headerRowNumber, headerLabels, rowNameColumnNumber, dataStartRow } = extractHeaderMetadata(excelJsSheet, xlsxFileName);

    // 构建列名到列号的映射
    const columnNameToNumber = new Map<string, number>();
    headerLabels.forEach((label, index) => {
        columnNameToNumber.set(label, index + 1);
    });

    // 获取已使用的行数（xlsx-populate 方式）
    const usedRange = targetSheet.usedRange();
    let maxRowNumber = usedRange ? usedRange.endCell().rowNumber() : dataStartRow;

    // 构建 rowName 到行号的映射
    const rowNameToRowNumber = new Map<string, number>();
    for (let r = dataStartRow; r <= maxRowNumber; r += 1) {
        const cell = targetSheet.cell(r, rowNameColumnNumber);
        const value = cell.value();
        const text = value !== undefined && value !== null ? String(value).trim() : '';
        if (text.length > 0 && !rowNameToRowNumber.has(text)) {
            rowNameToRowNumber.set(text, r);
        }
    }

    // 确保列存在的函数
    const ensureColumnNumber = (columnName: string): number => {
        const existing = columnNameToNumber.get(columnName);
        if (existing !== undefined) {
            return existing;
        }

        // 添加新列
        const newColumnNumber = columnNameToNumber.size + 1;
        targetSheet.cell(headerRowNumber, newColumnNumber).value(columnName);
        columnNameToNumber.set(columnName, newColumnNumber);
        headerLabels.push(columnName);
        return newColumnNumber;
    };

    // 写入数据
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

        // 写入 rowName
        targetSheet.cell(targetRowNumber, rowNameColumnNumber).value(rowName);

        // 写入其他列
        Object.entries(incomingRow).forEach(([columnName, value]) => {
            if (value === undefined) {
                return;
            }
            const columnNumber = ensureColumnNumber(columnName);
            targetSheet.cell(targetRowNumber!, columnNumber).value(value);
        });
    });

    // 保存文件（xlsx-populate 会保留所有原始格式）
    await workbook.toFileAsync(filePath);
}

async function registerExcelContextMenu() {
    if (process.platform !== 'win32') {
        throw new Error('仅支持在 Windows 上注册右键菜单。');
    }

    const exePath = app.getPath('exe');
    const commandValue = `"${exePath}" "%1"`;
    console.log('[registerExcelContextMenu] Registering context menu:', commandValue);

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
            throw new Error('File path is empty.');
        }
        console.log('[IPC excel:open-by-path] Loading file:', payload.filePath);
        const result = await loadWorkbookFromFile(payload.filePath);
        console.log('[IPC excel:open-by-path] File loaded successfully, sheet:', result.sheetName, 'rows:', result.rowCount);
        return { canceled: false, ...result };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open Excel file by path.';
        console.error('[IPC excel:open-by-path] Error:', message);
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

                const xlsxFileName = getExcelFileName(filePath);
                workbook.worksheets.forEach((worksheet) => {
                    try {
                        const payload = buildWorksheetPayload(worksheet, xlsxFileName);
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

        const xlsxFileName = getExcelFileName(payload.filePath);
        const { headerRowNumber, headerLabels, rowNameColumnNumber, dataStartRow, descriptionRow } = extractHeaderMetadata(worksheet, xlsxFileName);
        const rowNames = extractRowNames(worksheet, headerRowNumber, rowNameColumnNumber);

        const rows: RowRecord[] = [];
        
        for (let r = dataStartRow; r <= worksheet.rowCount; r += 1) {
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
            columnDescriptions: buildColumnDescriptions(worksheet, headerLabels, descriptionRow)
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

        // 缓存 metadata 并初始化 AI 知识库（如果 AI 服务已配置）
        cachedAtomMetadata = metadata;
        const aiService = getHunyuanService();
        if (aiService && !aiService.isKnowledgeLoaded()) {
            aiService.initializeWithAtomKnowledge(metadata);
            console.log('[delegate:get-metadata] AI knowledge base initialized with', metadata.length, 'atoms');
        }

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
        console.error('[delegate:deparse-json-to-expression]:', message);
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

// 获取原子字段配置
ipcMain.handle('config:get-atom-fields-config', async () => {
    try {
        const configLoader = AtomFieldsConfigLoader.getInstance();
        const config = configLoader.getConfig();
        return { ok: true, config };
    } catch (error) {
        const message = error instanceof Error ? error.message : '获取配置失败。';
        console.error('[config:get-atom-fields-config]:', message);
        return { ok: false, error: message };
    }
});

// 保存原子字段配置
ipcMain.handle('config:save-atom-fields-config', async (_event, config: any) => {
    try {
        const configLoader = AtomFieldsConfigLoader.getInstance();
        configLoader.setConfig(config);
        await configLoader.save();
        console.log('[config:save-atom-fields-config] 配置已保存');
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : '保存配置失败。';
        console.error('[config:save-atom-fields-config]:', message);
        return { ok: false, error: message };
    }
});

// ============ AI 助手相关 IPC 处理器 ============

// 模型配置
type AIModelType = 'deepseek' | 'hunyuan';

interface DeepSeekModelConfig {
  type: 'deepseek';
  apiKey: string;
  model: string;
}

interface HunyuanModelConfig {
  type: 'hunyuan';
  apiKey: string;
  apiHost: string;
  model: string;
}

type ModelConfig = DeepSeekModelConfig | HunyuanModelConfig;

const MODEL_CONFIGS: Record<AIModelType, ModelConfig> = {
  deepseek: {
    type: 'deepseek',
    apiKey: '779b1227-d043-4fb7-8d2d-d4572773dbe7',
    model: 'ep-20251231180434-9vq8m'
  },
  hunyuan: {
    type: 'hunyuan',
    apiKey: '9a0d84de-caed-4048-9c3e-c7ec16ea8a1d',
    apiHost: 'hunyuanapi.woa.com',
    model: 'hunyuan-2.0-thinking-20251109'
  }
};

// 当前选择的模型
let currentModelType: AIModelType = 'hunyuan';  // 默认混元

// 应用启动时自动初始化 AI 服务
console.log('[AI] Auto-initializing with default model:', currentModelType);
try {
    const defaultConfig = MODEL_CONFIGS[currentModelType];
    if (defaultConfig.type === 'deepseek') {
        initDeepSeekService({
            apiKey: defaultConfig.apiKey,
            model: defaultConfig.model
        });
    } else {
        initHunyuanService({
            apiKey: defaultConfig.apiKey,
            apiHost: defaultConfig.apiHost,
            model: defaultConfig.model
        });
    }
    aiConfigured = true;
    aiConfig = { model: defaultConfig.model };
    console.log('[AI] Service initialized with model:', defaultConfig.model);
} catch (error) {
    console.error('[AI] Auto-init failed:', error);
}

// 获取内置配置状态
ipcMain.handle('ai:get-builtin-config', async () => {
    return {
        hasBuiltinConfig: true,
        currentModel: currentModelType,
        availableModels: Object.keys(MODEL_CONFIGS)
    };
});

// 切换模型
ipcMain.handle('ai:switch-model', async (_event, modelType: string) => {
    try {
        if (!MODEL_CONFIGS[modelType as AIModelType]) {
            return { success: false, error: `不支持的模型类型: ${modelType}` };
        }
        
        console.log('[ai:switch-model] Switching to model:', modelType);
        currentModelType = modelType as AIModelType;
        const config = MODEL_CONFIGS[currentModelType];
        
        let service: any;
        if (config.type === 'deepseek') {
            service = initDeepSeekService({
                apiKey: config.apiKey,
                model: config.model
            });
        } else {
            service = initHunyuanService({
                apiKey: config.apiKey,
                apiHost: config.apiHost,
                model: config.model
            });
        }
        
        // 如果已有缓存的 metadata，直接注入知识库
        if (cachedAtomMetadata && cachedAtomMetadata.length > 0) {
            service.initializeWithAtomKnowledge(cachedAtomMetadata);
            console.log('[ai:switch-model] Knowledge base initialized with cached metadata');
        }
        
        aiConfigured = true;
        aiConfig = { model: config.model };
        console.log('[ai:switch-model] Model switched successfully to:', config.model);
        return { success: true, model: config.model };
    } catch (error) {
        const message = error instanceof Error ? error.message : '切换模型失败';
        console.error('[ai:switch-model] Error:', message);
        return { success: false, error: message };
    }
});

// 配置 AI 服务（保留兼容性，但不再需要手动配置）
ipcMain.handle('ai:configure', async (_event, config: { apiKey: string; apiHost?: string; model?: string }) => {
    try {
        console.log('[ai:configure] Configuring AI service...');
        const hunyuanConfig: HunyuanConfig = {
            apiKey: config.apiKey,
            apiHost: config.apiHost || 'hunyuanapi.woa.com',
            model: config.model || 'hunyuan-2.0-thinking-20251109'
        };
        const service = initHunyuanService(hunyuanConfig);
        
        // 如果已有缓存的 metadata，直接注入知识库
        if (cachedAtomMetadata && cachedAtomMetadata.length > 0) {
            service.initializeWithAtomKnowledge(cachedAtomMetadata);
            console.log('[ai:configure] Knowledge base initialized with cached metadata');
        }
        
        aiConfigured = true;
        aiConfig = { model: hunyuanConfig.model! };
        console.log('[ai:configure] AI service configured successfully');
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'AI 配置失败';
        console.error('[ai:configure] Error:', message);
        return { success: false, error: message };
    }
});

// 获取 AI 服务状态
ipcMain.handle('ai:get-status', async () => {
    return {
        configured: aiConfigured,
        config: aiConfigured ? aiConfig : undefined
    };
});

// 获取当前 AI 服务实例（根据模型类型）
function getCurrentAIService() {
    if (currentModelType === 'deepseek') {
        return getDeepSeekService();
    } else {
        return getHunyuanService();
    }
}

// 初始化原子知识库
ipcMain.handle('ai:init-knowledge', async (_event, metadata: any[]) => {
    try {
        const service = getCurrentAIService();
        if (!service) {
            return { success: false, error: 'AI 服务未配置' };
        }
        console.log('[ai:init-knowledge] Initializing knowledge base with', metadata.length, 'atoms');
        service.initializeWithAtomKnowledge(metadata);
        console.log('[ai:init-knowledge] Knowledge base initialized');
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : '初始化知识库失败';
        console.error('[ai:init-knowledge] Error:', message);
        return { success: false, error: message };
    }
});

// 发送聊天消息
ipcMain.handle('ai:chat', async (_event, payload: { message: string; currentAtom?: any; stream?: boolean }) => {
    try {
        const service = getCurrentAIService();
        if (!service) {
            return { success: false, error: 'AI 服务未配置' };
        }
        console.log('[ai:chat] Sending message:', payload.message.substring(0, 50) + '...');
        const response = await service.chat(payload.message, { currentAtom: payload.currentAtom });
        console.log('[ai:chat] Response received');
        return {
            success: response.success,
            content: response.content,
            error: response.error
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : '聊天请求失败';
        console.error('[ai:chat] Error:', message);
        return { success: false, error: message };
    }
});

// 流式聊天
ipcMain.on('ai:chat-stream', async (event, payload: { message: string; currentAtom?: any; requestId: string }) => {
    try {
        const service = getCurrentAIService();
        if (!service) {
            event.reply('ai:chat-stream-chunk', {
                requestId: payload.requestId,
                chunk: { type: 'error', error: 'AI 服务未配置' }
            });
            return;
        }
        console.log('[ai:chat-stream] Starting stream for:', payload.message.substring(0, 50) + '...');
        for await (const chunk of service.chatStream(payload.message, { currentAtom: payload.currentAtom })) {
            event.reply('ai:chat-stream-chunk', {
                requestId: payload.requestId,
                chunk
            });
        }
        console.log('[ai:chat-stream] Stream completed');
    } catch (error) {
        const message = error instanceof Error ? error.message : '流式聊天失败';
        console.error('[ai:chat-stream] Error:', message);
        event.reply('ai:chat-stream-chunk', {
            requestId: payload.requestId,
            chunk: { type: 'error', error: message }
        });
    }
});

// 清空对话历史
ipcMain.handle('ai:clear-history', async () => {
    try {
        const service = getCurrentAIService();
        if (service) {
            service.clearHistory();
            console.log('[ai:clear-history] History cleared');
        }
        return { success: true };
    } catch (error) {
        return { success: false };
    }
});

ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    try {
        if (!filePath) {
            return { ok: false, error: 'File path is empty' };
        }
        await shell.openPath(filePath);
        console.log('[shell:openPath] Opening path:', filePath);
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open path.';
        console.error('[shell:openPath]:', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('shell:register-excel-context-menu', async () => {
    try {
        console.log('[IPC shell:register-excel-context-menu] Registering Excel context menu');
        await registerExcelContextMenu();
        console.log('[IPC shell:register-excel-context-menu] Context menu registered successfully');
        return { ok: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to register context menu.';
        console.error('[IPC shell:register-excel-context-menu] Failed:', message);
        return { ok: false, error: message };
    }
});

ipcMain.handle('shell:open-external', async (_event, url: string) => {
    const { shell } = await import('electron');
    await shell.openExternal(url);
});

// ============ P4V 相关 IPC ============

ipcMain.handle('p4:configure', async (_event, config: P4Config) => {
    try {
        console.log('[P4] Configuring P4 service');
        initP4Service(config);
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to configure P4';
        return { success: false, error: message };
    }
});

ipcMain.handle('p4:get-config', async () => {
    return {
        configured: isP4Configured(),
        config: getP4Config()
    };
});

ipcMain.handle('p4:test-connection', async () => {
    try {
        const result = await testP4Connection();
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection test failed';
        return { success: false, message };
    }
});

ipcMain.handle('p4:check-file', async (_event, filePath: string) => {
    try {
        const info = await isFileUnderP4(filePath);
        return { success: true, ...info };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to check file';
        return { success: false, error: message, isUnderP4: false, isMapped: false };
    }
});

ipcMain.handle('p4:checkout', async (_event, filePath: string) => {
    try {
        const result = await checkoutFile(filePath);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Checkout failed';
        return { success: false, message };
    }
});

ipcMain.handle('p4:get-file-status', async (_event, filePath: string) => {
    try {
        const status = await getFileStatus(filePath);
        return { success: true, ...status };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get file status';
        return { success: false, error: message };
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
        // Ctrl+O 打开
        if ((input.control || input.meta) && !input.shift && input.key.toLowerCase() === 'o') {
            windowRef.webContents.send('shortcut:open');
            event.preventDefault();
        }
        // Ctrl+S 保存
        if ((input.control || input.meta) && !input.shift && input.key.toLowerCase() === 's') {
            windowRef.webContents.send('shortcut:save');
            event.preventDefault();
        }
        // Ctrl+Shift+S 另存为
        if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 's') {
            windowRef.webContents.send('shortcut:save-as');
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
    console.log('[main] App ready, starting initialization...');
    
    // ============ P4 自动更新检查 ============
    // 开发模式下的测试：设置为 true 可测试更新流程
    const TEST_P4_UPDATE_IN_DEV = false;
    // 开发模式下模拟的本地版本号（比实际版本低几个版本来测试更新日志显示）
    const DEV_MOCK_HAVE_REV = 3;  // 模拟本地版本为 #3，会显示 #4 到 headRev 的更新内容
    
    if (!isDev || TEST_P4_UPDATE_IN_DEV) {
        try {
            // 开发模式下使用测试路径，生产模式使用实际 exe 路径
            let testPath: string;
            if (isDev) {
                // 开发模式：使用一个已知在 P4 下的文件路径进行测试
                // 可以修改为你本地 P4 工程中的任意文件
                testPath = 'K:/MHA_Client_main/MHAGame/Tools/MHAtomExcelTool/MHAtomExcelTool.exe';
                console.log('[main] DEV MODE: Testing P4 update with path:', testPath);
            } else {
                testPath = app.getPath('exe');
            }
            
            console.log('[main] Checking P4 update for:', testPath);
            
            const updateInfo = await checkExeUpdateWithoutConfig(testPath);
            console.log('[main] P4 update check result:', updateInfo);
            
            // 开发模式下模拟有更新的场景
            if (isDev && TEST_P4_UPDATE_IN_DEV && updateInfo.isUnderP4) {
                // 强制模拟有更新：将 haveRev 设为较低版本
                updateInfo.haveRev = String(DEV_MOCK_HAVE_REV);
                updateInfo.hasUpdate = parseInt(updateInfo.headRev || '0', 10) > DEV_MOCK_HAVE_REV;
                updateInfo.message = `[DEV MOCK] 发现新版本 (模拟本地: #${DEV_MOCK_HAVE_REV}, 服务器: #${updateInfo.headRev})`;
                console.log('[main] DEV MODE: Mocked update info:', updateInfo);
            }
            
            // 开发模式下总是显示对话框（用于测试），生产模式只在有更新时显示
            const shouldShowDialog = isDev || (updateInfo.isUnderP4 && updateInfo.hasUpdate);
            
            if (shouldShowDialog) {
                // 从 P4 获取提交记录
                let changeDescriptions: string[] = [];
                if (updateInfo.hasUpdate && updateInfo.haveRev && updateInfo.headRev) {
                    try {
                        const changeResult = await getFileChangeDescriptions(
                            testPath, 
                            updateInfo.haveRev, 
                            updateInfo.headRev
                        );
                        if (changeResult.success && changeResult.descriptions.length > 0) {
                            changeDescriptions = changeResult.descriptions;
                        }
                    } catch (e) {
                        console.log('[main] Failed to get P4 change descriptions:', e);
                    }
                }
                
                // 显示更新对话框
                const userAction = await showP4UpdateDialog({
                    hasUpdate: updateInfo.hasUpdate,
                    isUnderP4: updateInfo.isUnderP4,
                    message: updateInfo.message,
                    haveRev: updateInfo.haveRev,
                    headRev: updateInfo.headRev,
                    exeDir: updateInfo.exeDir,
                    filePath: testPath,
                    changeDescriptions,
                    isDevMode: isDev
                });
                
                // 点击更新或测试打开CMD
                if (userAction === 'update' && (updateInfo.hasUpdate || isDev)) {
                    if (updateInfo.isUnderP4) {
                        // 打开 CMD 执行 p4 sync，传入 exe 路径以便同步后重启
                        openCmdForP4Sync(updateInfo.exeDir, testPath);
                        
                        // 生产模式下延迟退出，确保 CMD 窗口启动
                        if (!isDev && updateInfo.hasUpdate) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                            app.quit();
                            return;
                        } else {
                            // 开发模式下只提示，不退出
                            console.log('[main] DEV MODE: CMD opened for P4 sync, continuing app startup...');
                        }
                    }
                }
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log('[main] P4 update check skipped:', errorMsg);
            // 更新检查失败不影响程序启动
        }
    }
    
    // Initialize atom fields config loader
    try {
        console.log('[main] Loading atom fields config...');
        const configLoader = AtomFieldsConfigLoader.getInstance();
        await configLoader.load();
        console.log('[main] Atom fields config loaded successfully');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[main] Failed to load atom fields config, using default rules');
        console.error('[main] Error details:', errorMsg);
        if (error instanceof Error) {
            console.error('[main] Stack:', error.stack);
        }
    }
    
    
    console.log('[main] Creating app window...');
    createWindow();
    console.log('[main] Window created');
    
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            console.log('[main] Activate event: recreating window');
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});