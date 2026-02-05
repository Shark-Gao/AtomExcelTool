/**
 * 通用工具使用上报客户端模块
 * 用于向局域网监控服务器上报工具使用情况
 * 
 * 支持上报的事件类型：
 * - launch: 应用启动
 * - close: 应用关闭
 * - open_excel: 打开 Excel 文件
 * - save_excel: 保存 Excel 文件
 * - save_excel_as: 另存为 Excel 文件
 * - ai_chat: 使用 AI 问答
 * - open_code_editor: 打开代码编辑器
 */

import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import { app } from 'electron';

// ============ 类型定义 ============

export interface UsageReporterConfig {
    /** 工具唯一标识（建议使用英文，与服务器配置对应） */
    toolId: string;
    /** 服务器通知接口地址 */
    serverUrl: string;
    /** 是否启用上报，默认 true */
    enabled?: boolean;
    /** 请求超时时间（毫秒），默认 3000 */
    timeout?: number;
    /** 工具版本号 */
    appVersion?: string;
    /** 额外的固定信息（每次上报都会包含） */
    extraInfo?: Record<string, unknown>;
}

export interface ReportPayload {
    timestamp: string;
    event_type: string;
    tool_id: string;
    app_version: string;
    username: string;
    hostname: string;
    ip_address: string;
    os_version: string;
    [key: string]: unknown;
}

// ============ 工具函数 ============

/**
 * 获取本机局域网 IP
 */
function getLocalIp(): string {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            const ifaceList = interfaces[name];
            if (!ifaceList) continue;
            for (const iface of ifaceList) {
                // 跳过内部地址和非 IPv4 地址
                if (iface.internal || iface.family !== 'IPv4') continue;
                return iface.address;
            }
        }
    } catch {
        // ignore
    }
    return '127.0.0.1';
}

/**
 * 获取当前时间字符串
 */
function getTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ============ UsageReporter 类 ============

/**
 * 通用工具使用上报器
 * 用于向局域网监控服务器上报工具使用情况
 * 所有上报都是异步的，不会阻塞主程序
 */
export class UsageReporter {
    private toolId: string;
    private serverUrl: string;
    private enabled: boolean;
    private timeout: number;
    private appVersion: string;
    private extraInfo: Record<string, unknown>;
    private deviceInfo: {
        username: string;
        hostname: string;
        ip_address: string;
        os_version: string;
    };

    constructor(config: UsageReporterConfig) {
        this.toolId = config.toolId;
        this.serverUrl = config.serverUrl;
        this.enabled = config.enabled ?? true;
        this.timeout = config.timeout ?? 3000;
        this.appVersion = config.appVersion ?? '1.0.0';
        this.extraInfo = config.extraInfo ?? {};

        // 缓存设备信息
        this.deviceInfo = {
            username: os.userInfo().username,
            hostname: os.hostname(),
            ip_address: getLocalIp(),
            os_version: `${os.platform()} ${os.release()}`
        };
    }

    /**
     * 构建上报数据
     */
    private buildPayload(eventType: string, extra?: Record<string, unknown>): ReportPayload {
        const payload: ReportPayload = {
            timestamp: getTimestamp(),
            event_type: eventType,
            tool_id: this.toolId,
            app_version: this.appVersion,
            ...this.deviceInfo,
            ...this.extraInfo
        };

        if (extra) {
            Object.assign(payload, extra);
        }

        return payload;
    }

    /**
     * 异步发送数据（不等待结果）
     */
    private sendAsync(payload: ReportPayload): void {
        if (!this.enabled) return;

        try {
            const data = JSON.stringify(payload);
            const url = new URL(this.serverUrl);
            const isHttps = url.protocol === 'https:';
            const httpModule = isHttps ? https : http;

            const options: http.RequestOptions = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: this.timeout
            };

            const req = httpModule.request(options, (res) => {
                if (res.statusCode === 200) {
                    console.log(`[UsageReporter] 上报成功: ${payload.event_type}`);
                } else {
                    console.log(`[UsageReporter] 上报返回非200: ${res.statusCode}`);
                }
                // 消费响应数据，避免内存泄漏
                res.resume();
            });

            req.on('error', (e) => {
                console.log(`[UsageReporter] 上报失败（可忽略）: ${e.message}`);
            });

            req.on('timeout', () => {
                console.log(`[UsageReporter] 上报超时（可忽略）`);
                req.destroy();
            });

            req.write(data);
            req.end();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`[UsageReporter] 上报异常（可忽略）: ${msg}`);
        }
    }

    /**
     * 带等待的发送（用于关闭时确保发送完成）
     */
    private sendWithWait(payload: ReportPayload, waitTimeout: number): Promise<void> {
        return new Promise((resolve) => {
            if (!this.enabled) {
                resolve();
                return;
            }

            const timer = setTimeout(() => {
                console.log(`[UsageReporter] 等待超时，继续执行`);
                resolve();
            }, waitTimeout);

            try {
                const data = JSON.stringify(payload);
                const url = new URL(this.serverUrl);
                const isHttps = url.protocol === 'https:';
                const httpModule = isHttps ? https : http;

                const options: http.RequestOptions = {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + url.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data)
                    },
                    timeout: Math.min(this.timeout, waitTimeout)
                };

                const req = httpModule.request(options, (res) => {
                    clearTimeout(timer);
                    if (res.statusCode === 200) {
                        console.log(`[UsageReporter] 上报成功: ${payload.event_type}`);
                    }
                    res.resume();
                    resolve();
                });

                req.on('error', () => {
                    clearTimeout(timer);
                    resolve();
                });

                req.on('timeout', () => {
                    clearTimeout(timer);
                    req.destroy();
                    resolve();
                });

                req.write(data);
                req.end();
            } catch {
                clearTimeout(timer);
                resolve();
            }
        });
    }

    /**
     * 上报自定义事件
     * @param eventType 事件类型
     * @param extraInfo 额外信息
     * @param waitTimeout 等待超时（毫秒），0 表示不等待
     */
    reportEvent(eventType: string, extraInfo?: Record<string, unknown>, waitTimeout = 0): Promise<void> | void {
        const payload = this.buildPayload(eventType, extraInfo);
        if (waitTimeout > 0) {
            return this.sendWithWait(payload, waitTimeout);
        } else {
            this.sendAsync(payload);
        }
    }

    /**
     * 上报工具启动
     */
    reportLaunch(extraInfo?: Record<string, unknown>): void {
        this.reportEvent('launch', extraInfo);
    }

    /**
     * 上报工具关闭（默认等待 500ms）
     */
    reportClose(extraInfo?: Record<string, unknown>, waitTimeout = 500): Promise<void> {
        return this.reportEvent('close', extraInfo, waitTimeout) as Promise<void>;
    }

    /**
     * 上报打开 Excel 文件
     */
    reportOpenExcel(filePath?: string, extraInfo?: Record<string, unknown>): void {
        this.reportEvent('open_excel', { file_path: filePath, ...extraInfo });
    }

    /**
     * 上报保存 Excel 文件
     */
    reportSaveExcel(filePath?: string, extraInfo?: Record<string, unknown>): void {
        this.reportEvent('save_excel', { file_path: filePath, ...extraInfo });
    }

    /**
     * 上报另存为 Excel 文件
     */
    reportSaveExcelAs(filePath?: string, extraInfo?: Record<string, unknown>): void {
        this.reportEvent('save_excel_as', { file_path: filePath, ...extraInfo });
    }

    /**
     * 上报 AI 问答
     */
    reportAIChat(model?: string, extraInfo?: Record<string, unknown>): void {
        this.reportEvent('ai_chat', { model, ...extraInfo });
    }

    /**
     * 上报打开代码编辑器
     */
    reportOpenCodeEditor(extraInfo?: Record<string, unknown>): void {
        this.reportEvent('open_code_editor', extraInfo);
    }

    /**
     * 上报错误
     */
    reportError(errorMsg: string, extraInfo?: Record<string, unknown>): void {
        this.reportEvent('error', { error_message: errorMsg, ...extraInfo });
    }

    /**
     * 上报用户操作
     */
    reportAction(actionName: string, extraInfo?: Record<string, unknown>): void {
        this.reportEvent('action', { action: actionName, ...extraInfo });
    }
}

// ============ 全局单例 ============

let defaultReporter: UsageReporter | null = null;

/**
 * 初始化全局上报器
 */
export function initReporter(config: UsageReporterConfig): UsageReporter {
    defaultReporter = new UsageReporter(config);
    return defaultReporter;
}

/**
 * 获取全局上报器
 */
export function getReporter(): UsageReporter | null {
    return defaultReporter;
}

// ============ 便捷全局函数 ============

export function reportEvent(eventType: string, extraInfo?: Record<string, unknown>, waitTimeout = 0): Promise<void> | void {
    return defaultReporter?.reportEvent(eventType, extraInfo, waitTimeout);
}

export function reportLaunch(extraInfo?: Record<string, unknown>): void {
    defaultReporter?.reportLaunch(extraInfo);
}


export function reportClose(extraInfo?: Record<string, unknown>): Promise<void> {
    return defaultReporter?.reportClose(extraInfo) ?? Promise.resolve();
}

export function reportOpenExcel(filePath?: string, extraInfo?: Record<string, unknown>): void {
    defaultReporter?.reportOpenExcel(filePath, extraInfo);
}

export function reportSaveExcel(filePath?: string, extraInfo?: Record<string, unknown>): void {
    defaultReporter?.reportSaveExcel(filePath, extraInfo);
}

export function reportSaveExcelAs(filePath?: string, extraInfo?: Record<string, unknown>): void {
    defaultReporter?.reportSaveExcelAs(filePath, extraInfo);
}

export function reportAIChat(model?: string, extraInfo?: Record<string, unknown>): void {
    defaultReporter?.reportAIChat(model, extraInfo);
}

export function reportOpenCodeEditor(extraInfo?: Record<string, unknown>): void {
    defaultReporter?.reportOpenCodeEditor(extraInfo);
}

export function reportError(errorMsg: string, extraInfo?: Record<string, unknown>): void {
    defaultReporter?.reportError(errorMsg, extraInfo);
}

export function reportAction(actionName: string, extraInfo?: Record<string, unknown>): void {
    defaultReporter?.reportAction(actionName, extraInfo);
}

// ============ 自动初始化 ============

// 获取应用版本
const appVersion = app?.getVersion?.() || '0.0.2';

// 自动初始化上报器
initReporter({
    toolId: 'MHAtomExcelTool',
    serverUrl: 'http://10.30.129.88:9876/api/notify',
    appVersion,
    enabled: true,
    timeout: 3000
});

console.log('[UsageReporter] 上报器已初始化，工具ID: MHAtomExcelTool, 版本:', appVersion);
