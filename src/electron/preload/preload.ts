// src/electron/preload/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
type RowRecord = Record<string, string>
type WorksheetPayload = {
    sheetName: string;
    rowCount: number;
    columnNames: string[];
    rowNameColumnName: string;
    columnDescriptions: Record<string, string>;
    rows: RowRecord[];
};
type WorkbookSelectionPayload = {
    filePath: string;
    sheets: WorksheetPayload[];
    sheetErrors?: { sheetName: string; error: string }[];
};
type ExcelMultiOpenResult =
    | { canceled: true }
    | {
          canceled: false;
          workbooks: WorkbookSelectionPayload[];
          errors?: { filePath: string; error: string }[];
      };

const externalExcelListeners: Array<(filePath: string) => void> = [];
const pendingExternalExcelPaths: string[] = [];

console.log('[Preload] 初始化外部 Excel 文件监听系统');

ipcRenderer.on('excel:open-external-path', (_event, filePath: string) => {
    console.log('[Preload IPC] 收到 excel:open-external-path 信号:', filePath);
    if (!filePath) {
        console.log('[Preload IPC] 文件路径为空，忽略');
        return;
    }
    if (!externalExcelListeners.length) {
        console.log('[Preload IPC] 暂无监听器，缓冲文件路径');
        pendingExternalExcelPaths.push(filePath);
        return;
    }
    console.log('[Preload IPC] 分发文件路径给 ' + externalExcelListeners.length + ' 个监听器');
    externalExcelListeners.forEach((listener) => listener(filePath));
});

const registerExternalExcelListener = (listener: (filePath: string) => void) => {
    if (typeof listener !== 'function') {
        console.log('[Preload] 无效的监听器函数');
        return () => void 0;
    }
    console.log('[Preload] 注册外部 Excel 文件监听器');
    externalExcelListeners.push(listener);
    if (pendingExternalExcelPaths.length) {
        const buffered = pendingExternalExcelPaths.splice(0);
        console.log('[Preload] 处理 ' + buffered.length + ' 个缓冲的文件路径');
        buffered.forEach((path) => listener(path));
    }
    return () => {
        const index = externalExcelListeners.indexOf(listener);
        if (index >= 0) {
            console.log('[Preload] 移除外部 Excel 文件监听器');
            externalExcelListeners.splice(index, 1);
        }
    };
};

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
              sheetList?: string[];
              error?: string;
          }
    >,
    openWorkbookByPath: (payload: { filePath: string }) =>
        ipcRenderer.invoke('excel:open-by-path', payload) as Promise<
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
                  sheetList?: string[];
                  error?: string;
              }
        >,
    openMultipleWorkbooks: () => ipcRenderer.invoke('excel:open-multiple') as Promise<ExcelMultiOpenResult>,
    loadSheet: (payload: { filePath: string; sheetName: string }) =>
        ipcRenderer.invoke('excel:load-sheet', payload) as Promise<{
              ok: boolean;
              sheetName?: string;
              rowCount?: number;
              columnNames?: string[];
              rowNames?: string[];
              rows?: Record<string, string>[];
              rowNameColumnName?: string;
              columnDescriptions?: Record<string, string>;
              error?: string;
        }>,
    readRow: (payload: { filePath: string; sheetName: string; rowName: string }) =>
        ipcRenderer.invoke('excel:read-row', payload) as Promise<
            | { ok: false; error: string }
            | { ok: true; rowName: string; row: RowRecord; columnNames: string[]; conditionFields: Record<string, any> }
        >,
    loadConditionFields: (payload: { record: RowRecord; columnNames: string[] }) =>
        ipcRenderer.invoke('excel:load-condition-fields', payload) as Promise<{
            ok: boolean;
            conditionFields?: Record<string, any>;
            error?: string;
        }>,
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
        error?: string;
        defaultJson?: string;
    }>,
    parseExpression: (payload: { expression: string }) => ipcRenderer.invoke('condition:parse-expression', payload) as Promise<{
        ok: boolean;
        parsed?: any;
        json?: string;
        error?: string;
    }>,
    parseConditionField: (payload: { fieldName: string; rawValue: string; sheetName?: string; fileName?: string }) => ipcRenderer.invoke('delegate:parse-condition-field', payload) as Promise<{
        ok: boolean;
        parsed?: any;
        error?: string;
    }>,
    deParseJsonToExpression: (payload: { json: any }) => ipcRenderer.invoke('delegate:deparse-json-to-expression', payload) as Promise<{
        ok: boolean;
        expression?: { expression: string; expressionDesc: string };
        error?: string;
    }>,
    // 监听元数据加载完成事件
    onMetadataLoaded: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('delegate:metadata-loaded', handler);
        return () => ipcRenderer.removeListener('delegate:metadata-loaded', handler);
    }
});

// ============ Monaco 编辑器 Bridge ============
contextBridge.exposeInMainWorld('monacoBridge', {
    /** 获取类型元数据（用于 Monaco 编辑器类型提示，直接使用 cachedAtomMetadata） */
    getTypeMetadata: () => ipcRenderer.invoke('monaco:get-type-metadata') as Promise<{
        ok: boolean;
        atomMetadata?: any[];
        error?: string;
    }>
});

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel: string, payload?: any) => ipcRenderer.invoke(channel, payload),
    registerExcelContextMenu: () => ipcRenderer.invoke('shell:register-excel-context-menu') as Promise<{ ok: boolean; error?: string }>,
    onOpenExternalExcel: (callback: (filePath: string) => void) => registerExternalExcelListener(callback),
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url) as Promise<void>,
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath) as Promise<{ ok: boolean; error?: string }>,
    openClaudeInternal: () => ipcRenderer.invoke('shell:open-claude-internal') as Promise<{ ok: boolean; error?: string }>,
    getLogInfo: () => ipcRenderer.invoke('app:get-log-info') as Promise<{
        ok: boolean;
        logDir?: string;
        logFilePath?: string;
        error?: string;
    }>,
    getAtomFieldsConfig: () => ipcRenderer.invoke('config:get-atom-fields-config') as Promise<{
        ok: boolean;
        config?: any;
        error?: string;
    }>,
    saveAtomFieldsConfig: (config: any) => ipcRenderer.invoke('config:save-atom-fields-config', config) as Promise<{
        ok: boolean;
        error?: string;
    }>,
    // 快捷键监听
    onOpen: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('shortcut:open', handler);
        return () => ipcRenderer.removeListener('shortcut:open', handler);
    },
    onSave: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('shortcut:save', handler);
        return () => ipcRenderer.removeListener('shortcut:save', handler);
    },
    onSaveAs: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('shortcut:save-as', handler);
        return () => ipcRenderer.removeListener('shortcut:save-as', handler);
    }
});

// ============ P4V Bridge ============
contextBridge.exposeInMainWorld('p4Bridge', {
    /** 配置 P4 服务 */
    configure: (config: { port: string; user: string; client: string }) =>
        ipcRenderer.invoke('p4:configure', config) as Promise<{ success: boolean; error?: string }>,
    
    /** 获取 P4 配置 */
    getConfig: () =>
        ipcRenderer.invoke('p4:get-config') as Promise<{
            configured: boolean;
            config?: { port: string; user: string; client: string };
        }>,
    
    /** 测试 P4 连接 */
    testConnection: () =>
        ipcRenderer.invoke('p4:test-connection') as Promise<{ success: boolean; message: string }>,
    
    /** 检查文件是否在 P4 工程下 */
    checkFile: (filePath: string) =>
        ipcRenderer.invoke('p4:check-file', filePath) as Promise<{
            success: boolean;
            isUnderP4: boolean;
            isMapped: boolean;
            action?: string;
            error?: string;
        }>,
    
    /** Checkout 文件 */
    checkout: (filePath: string) =>
        ipcRenderer.invoke('p4:checkout', filePath) as Promise<{ success: boolean; message: string }>,
    
    /** 获取文件状态 */
    getFileStatus: (filePath: string) =>
        ipcRenderer.invoke('p4:get-file-status', filePath) as Promise<{
            success: boolean;
            isUnderP4: boolean;
            isCheckedOut: boolean;
            action?: string;
            message: string;
        }>
});

// ============ AI 助手 Bridge ============
contextBridge.exposeInMainWorld('aiBridge', {
    /** 获取 AI 服务状态 */
    getStatus: () =>
        ipcRenderer.invoke('ai:get-status') as Promise<{
            configured: boolean;
            config?: { model: string };
        }>,

    /** 获取内置配置状态 */
    getBuiltinConfig: () =>
        ipcRenderer.invoke('ai:get-builtin-config') as Promise<{
            hasBuiltinConfig: boolean;
            currentModel?: string;
            availableModels?: string[];
            knotModels?: Array<{ value: string; label: string }>;
        }>,
    
    /** 初始化原子知识库 */
    initKnowledge: (metadata: any[]) =>
        ipcRenderer.invoke('ai:init-knowledge', metadata) as Promise<{ success: boolean; error?: string }>,
    
    /** 发送聊天消息 */
    chat: (payload: { message: string; currentAtom?: any; stream?: boolean }) =>
        ipcRenderer.invoke('ai:chat', payload) as Promise<{
            success: boolean;
            content?: string;
            error?: string;
            stream?: AsyncIterable<{ type: string; content?: string; error?: string }>;
        }>,
    
    /** 流式聊天（通过事件） */
    chatStream: (payload: { message: string; currentAtom?: any }) => {
        const requestId = `ai-stream-${Date.now()}`;
        ipcRenderer.send('ai:chat-stream', { ...payload, requestId });
        return {
            requestId,
            onChunk: (callback: (chunk: { 
                type: string; 
                content?: string; 
                error?: string;
            }) => void) => {
                const handler = (_event: any, data: any) => {
                    if (data.requestId === requestId) {
                        callback(data.chunk);
                        if (data.chunk.type === 'done' || data.chunk.type === 'error') {
                            ipcRenderer.removeListener('ai:chat-stream-chunk', handler);
                        }
                    }
                };
                ipcRenderer.on('ai:chat-stream-chunk', handler);
                return () => ipcRenderer.removeListener('ai:chat-stream-chunk', handler);
            }
        };
    },
    
    /** 清空对话历史 */
    clearHistory: () =>
        ipcRenderer.invoke('ai:clear-history') as Promise<{ success: boolean }>,
    
    /** 获取 Token 使用统计 */
    getUsage: () =>
        ipcRenderer.invoke('ai:get-usage') as Promise<{
            success: boolean;
            usage?: {
                promptTokens: number;
                completionTokens: number;
                totalTokens: number;
                estimatedCost?: number;
            };
            estimate?: {
                systemTokens: number;
                historyTokens: number;
                totalInputTokens: number;
            };
            modelType?: string;
            error?: string;
        }>,
    
    /** 重置 Token 统计 */
    resetUsage: () =>
        ipcRenderer.invoke('ai:reset-usage') as Promise<{ success: boolean }>,
    
    /** 配置 Knot 服务 */
    configureKnot: (config: { apiToken: string; apiUser: string; model?: string }) =>
        ipcRenderer.invoke('ai:configure-knot', config) as Promise<{ success: boolean; model?: string; error?: string }>,

    /** 获取 Knot 配置状态 */
    getKnotConfig: () =>
        ipcRenderer.invoke('ai:get-knot-config') as Promise<{
            configured: boolean;
            apiUser: string;
            model: string;
            hasToken: boolean;
            availableModels: Array<{ value: string; label: string }>;
        }>,

    /** 设置 Knot 子模型 */
    setKnotModel: (model: string) =>
        ipcRenderer.invoke('ai:set-knot-model', model) as Promise<{ success: boolean; model?: string; error?: string }>
});

// ============ 使用统计上报 Bridge ============
contextBridge.exposeInMainWorld('usageBridge', {
    /** 上报打开代码编辑器 */
    reportOpenCodeEditor: (extraInfo?: Record<string, unknown>) =>
        ipcRenderer.invoke('usage:report-open-code-editor', extraInfo) as Promise<void>,
    
    /** 上报自定义操作 */
    reportAction: (actionName: string, extraInfo?: Record<string, unknown>) =>
        ipcRenderer.invoke('usage:report-action', { actionName, extraInfo }) as Promise<void>,
    
    /** 上报自定义事件 */
    reportEvent: (eventType: string, extraInfo?: Record<string, unknown>) =>
        ipcRenderer.invoke('usage:report-event', { eventType, extraInfo }) as Promise<void>
});
