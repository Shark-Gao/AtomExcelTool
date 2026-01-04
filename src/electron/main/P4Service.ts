/**
 * Perforce (P4) 服务模块
 * 提供 P4V 版本控制集成功能
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { dirname } from 'path';

const execAsync = promisify(exec);

export interface P4Config {
    port: string;      // P4PORT, e.g., ssl:9.134.225.161:1666
    user: string;      // P4USER, e.g., sharkgao
    client: string;    // P4CLIENT (Workspace), e.g., MHA_Client_main
}

export interface P4FileInfo {
    depotFile?: string;
    clientFile?: string;
    action?: string;
    headAction?: string;
    headRev?: string;
    haveRev?: string;
    isMapped: boolean;
    isUnderP4: boolean;
}

let p4Config: P4Config | null = null;

/**
 * 初始化 P4 配置
 */
export function initP4Service(config: P4Config): void {
    p4Config = config;
    console.log('[P4Service] Initialized with config:', {
        port: config.port,
        user: config.user,
        client: config.client
    });
}

/**
 * 获取当前 P4 配置
 */
export function getP4Config(): P4Config | null {
    return p4Config;
}

/**
 * 检查 P4 是否已配置
 */
export function isP4Configured(): boolean {
    return p4Config !== null && 
           p4Config.port.length > 0 && 
           p4Config.user.length > 0 && 
           p4Config.client.length > 0;
}

/**
 * 构建 P4 命令的环境变量
 */
function getP4Env(): NodeJS.ProcessEnv {
    if (!p4Config) {
        return process.env;
    }
    return {
        ...process.env,
        P4PORT: p4Config.port,
        P4USER: p4Config.user,
        P4CLIENT: p4Config.client
    };
}

/**
 * 执行 P4 命令
 */
async function runP4Command(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const command = `p4 ${args.join(' ')}`;
    console.log('[P4Service] Running command:', command);
    
    try {
        const result = await execAsync(command, {
            env: getP4Env(),
            cwd: cwd || process.cwd(),
            timeout: 30000 // 30 秒超时
        });
        return result;
    } catch (error: any) {
        console.error('[P4Service] Command failed:', error.message);
        throw error;
    }
}

/**
 * 检查文件是否在 P4 工程下
 */
export async function isFileUnderP4(filePath: string): Promise<P4FileInfo> {
    if (!isP4Configured()) {
        return { isMapped: false, isUnderP4: false };
    }

    try {
        // 使用 p4 fstat 检查文件状态
        const { stdout } = await runP4Command(['fstat', `"${filePath}"`], dirname(filePath));
        
        const info: P4FileInfo = {
            isMapped: true,
            isUnderP4: true
        };

        // 解析 fstat 输出
        const lines = stdout.split('\n');
        for (const line of lines) {
            // P4 fstat 输出格式: "... fieldName value\r" (Windows 换行)
            // 先去除行尾的 \r
            const trimmedLine = line.replace(/\r$/, '');
            const match = trimmedLine.match(/^\.\.\.\ (\w+)\ (.*)$/);
            if (match) {
                const [, key, value] = match;
                switch (key) {
                    case 'depotFile':
                        info.depotFile = value;
                        break;
                    case 'clientFile':
                        info.clientFile = value;
                        break;
                    case 'action':
                        info.action = value;
                        break;
                    case 'headAction':
                        info.headAction = value;
                        break;
                    case 'headRev':
                        info.headRev = value;
                        break;
                    case 'haveRev':
                        info.haveRev = value;
                        break;
                }
            }
        }

        return info;
    } catch (error: any) {
        // 如果文件不在 P4 映射中，fstat 会返回错误
        if (error.stderr?.includes('not in client view') || 
            error.stderr?.includes('no such file') ||
            error.message?.includes('not in client view')) {
            return { isMapped: false, isUnderP4: false };
        }
        console.error('[P4Service] isFileUnderP4 error:', error.message);
        return { isMapped: false, isUnderP4: false };
    }
}

/**
 * Checkout 文件（打开文件进行编辑）
 */
export async function checkoutFile(filePath: string): Promise<{ success: boolean; message: string }> {
    if (!isP4Configured()) {
        return { success: false, message: 'P4 未配置' };
    }

    try {
        const { stdout, stderr } = await runP4Command(['edit', `"${filePath}"`], dirname(filePath));
        
        if (stderr && stderr.includes('not on client')) {
            return { success: false, message: '文件不在 P4 客户端映射中' };
        }
        
        if (stdout.includes('opened for edit') || stdout.includes('currently opened')) {
            return { success: true, message: '文件已 checkout' };
        }
        
        return { success: true, message: stdout || '操作完成' };
    } catch (error: any) {
        const errorMsg = error.stderr || error.message || '未知错误';
        
        // 检查是否已经 checkout
        if (errorMsg.includes('currently opened') || errorMsg.includes('already opened')) {
            return { success: true, message: '文件已经处于 checkout 状态' };
        }
        
        return { success: false, message: `Checkout 失败: ${errorMsg}` };
    }
}

/**
 * 获取文件当前状态
 */
export async function getFileStatus(filePath: string): Promise<{
    isUnderP4: boolean;
    isCheckedOut: boolean;
    action?: string;
    message: string;
}> {
    if (!isP4Configured()) {
        return { isUnderP4: false, isCheckedOut: false, message: 'P4 未配置' };
    }

    try {
        const info = await isFileUnderP4(filePath);
        
        if (!info.isUnderP4) {
            return { isUnderP4: false, isCheckedOut: false, message: '文件不在 P4 工程中' };
        }

        const isCheckedOut = !!info.action;
        return {
            isUnderP4: true,
            isCheckedOut,
            action: info.action,
            message: isCheckedOut ? `文件已 ${info.action}` : '文件未 checkout'
        };
    } catch (error: any) {
        return { isUnderP4: false, isCheckedOut: false, message: error.message };
    }
}

/**
 * 测试 P4 连接
 */
export async function testP4Connection(): Promise<{ success: boolean; message: string }> {
    if (!isP4Configured()) {
        return { success: false, message: 'P4 未配置' };
    }

    try {
        // 使用 p4 info 测试连接
        const { stdout } = await runP4Command(['info']);
        
        if (stdout.includes('User name:') && stdout.includes('Client name:')) {
            return { success: true, message: '连接成功' };
        }
        
        return { success: false, message: '无法获取 P4 信息' };
    } catch (error: any) {
        return { success: false, message: `连接失败: ${error.message}` };
    }
}

/**
 * Revert 文件（撤销 checkout）
 */
export async function revertFile(filePath: string): Promise<{ success: boolean; message: string }> {
    if (!isP4Configured()) {
        return { success: false, message: 'P4 未配置' };
    }

    try {
        const { stdout } = await runP4Command(['revert', `"${filePath}"`], dirname(filePath));
        return { success: true, message: stdout || '文件已 revert' };
    } catch (error: any) {
        return { success: false, message: `Revert 失败: ${error.message}` };
    }
}

/**
 * 检查文件是否有新版本可更新
 * 比较 headRev 和 haveRev，如果 headRev > haveRev 则有更新
 */
export async function checkFileHasUpdate(filePath: string): Promise<{
    isUnderP4: boolean;
    hasUpdate: boolean;
    headRev?: string;
    haveRev?: string;
    depotFile?: string;
    message: string;
}> {
    try {
        const info = await isFileUnderP4(filePath);
        
        if (!info.isUnderP4) {
            return { 
                isUnderP4: false, 
                hasUpdate: false, 
                message: '文件不在 P4 版本控制下' 
            };
        }

        const headRev = parseInt(info.headRev || '0', 10);
        const haveRev = parseInt(info.haveRev || '0', 10);
        const hasUpdate = headRev > haveRev;

        return {
            isUnderP4: true,
            hasUpdate,
            headRev: info.headRev,
            haveRev: info.haveRev,
            depotFile: info.depotFile,
            message: hasUpdate 
                ? `有新版本可用 (本地: #${info.haveRev}, 服务器: #${info.headRev})`
                : '已是最新版本'
        };
    } catch (error: any) {
        console.error('[P4Service] checkFileHasUpdate error:', error.message);
        return { 
            isUnderP4: false, 
            hasUpdate: false, 
            message: `检查更新失败: ${error.message}` 
        };
    }
}

/**
 * 同步目录（使用 p4 sync）
 */
export async function syncDirectory(dirPath: string): Promise<{ success: boolean; message: string }> {
    try {
        const syncPath = `"${dirPath}/..."`;
        const { stdout, stderr } = await runP4Command(['sync', syncPath], dirPath);
        
        if (stderr && !stderr.includes('up-to-date')) {
            console.warn('[P4Service] sync stderr:', stderr);
        }
        
        return { 
            success: true, 
            message: stdout || '同步完成' 
        };
    } catch (error: any) {
        // 如果已经是最新的，p4 sync 可能会返回特定消息
        if (error.stdout?.includes('up-to-date') || error.message?.includes('up-to-date')) {
            return { success: true, message: '已是最新版本' };
        }
        return { 
            success: false, 
            message: `同步失败: ${error.message}` 
        };
    }
}

/**
 * 使用 p4 set 自动检测 P4 配置
 * 从系统环境或 P4 配置文件中读取配置
 */
export async function autoDetectP4Config(): Promise<P4Config | null> {
    try {
        const { stdout } = await execAsync('p4 set', { timeout: 10000 });
        
        const config: Partial<P4Config> = {};
        const lines = stdout.split('\n');
        
        for (const line of lines) {
            // 格式: P4PORT=xxx (set) 或 P4PORT=xxx (config)
            const match = line.match(/^(P4PORT|P4USER|P4CLIENT)=([^\s(]+)/);
            if (match) {
                const [, key, value] = match;
                switch (key) {
                    case 'P4PORT':
                        config.port = value;
                        break;
                    case 'P4USER':
                        config.user = value;
                        break;
                    case 'P4CLIENT':
                        config.client = value;
                        break;
                }
            }
        }

        if (config.port && config.user && config.client) {
            console.log('[P4Service] Auto-detected config:', config);
            return config as P4Config;
        }

        return null;
    } catch (error: any) {
        console.log('[P4Service] Auto-detect failed:', error.message);
        return null;
    }
}

/**
 * 检查 exe 是否在 P4 下并有更新（不依赖预配置）
 * 使用系统默认的 P4 配置
 */
export async function checkExeUpdateWithoutConfig(exePath: string): Promise<{
    isUnderP4: boolean;
    hasUpdate: boolean;
    headRev?: string;
    haveRev?: string;
    exeDir: string;
    message: string;
}> {
    const exeDir = dirname(exePath);
    
    try {
        // 直接使用 p4 fstat，依赖系统配置
        const command = `p4 fstat "${exePath}"`;
        console.log('[P4Service] Checking exe update:', command);
        
        const { stdout } = await execAsync(command, {
            cwd: exeDir,
            timeout: 15000
        });

        // 解析 fstat 输出
        let headRev: string | undefined;
        let haveRev: string | undefined;
        
        const lines = stdout.split('\r\n');
        for (const line of lines) {
            // P4 fstat 输出格式: "... fieldName value\r" (Windows 换行)
            const match = line.match(/^\.\.\.\ (\w+)\ (.*)$/);
            if (match) {
                const [, key, value] = match;
                if (key === 'headRev') headRev = value;
                if (key === 'haveRev') haveRev = value;
            }
        }

        const headRevNum = parseInt(headRev || '0', 10);
        const haveRevNum = parseInt(haveRev || '0', 10);
        const hasUpdate = headRevNum > haveRevNum;

        return {
            isUnderP4: true,
            hasUpdate,
            headRev,
            haveRev,
            exeDir,
            message: hasUpdate 
                ? `发现新版本 (本地: #${haveRev}, 服务器: #${headRev})`
                : '已是最新版本'
        };
    } catch (error: any) {
        // 检查是否是因为文件不在 P4 下
        const errMsg = error.stderr || error.message || '';
        if (errMsg.includes('not in client view') || 
            errMsg.includes('no such file') ||
            errMsg.includes('is not under')) {
            return {
                isUnderP4: false,
                hasUpdate: false,
                exeDir,
                message: 'exe 不在 P4 版本控制下'
            };
        }
        
        // P4 未安装或未配置
        if (errMsg.includes('not recognized') || 
            errMsg.includes('not found') ||
            errMsg.includes('ENOENT')) {
            return {
                isUnderP4: false,
                hasUpdate: false,
                exeDir,
                message: 'P4 命令行工具未安装或未配置'
            };
        }

        console.error('[P4Service] checkExeUpdateWithoutConfig error:', errMsg);
        return {
            isUnderP4: false,
            hasUpdate: false,
            exeDir,
            message: `检查失败: ${errMsg}`
        };
    }
}

/**
 * 打开 CMD 窗口执行 P4 sync 命令
 * 使用 start 命令启动独立的 CMD 窗口，确保父进程退出后子进程仍能运行
 */
export function openCmdForP4Sync(dirPath: string): void {
    const { exec } = require('child_process');
    
    // 构建 p4 sync 命令，先显示更新提示，再执行同步
    const syncCommand = `echo 正在更新 MHAtomExcelTool，请稍候... && echo. && p4 sync "${dirPath}/..." && echo. && echo 更新完成，请重新启动工具。`;
    
    // 使用 start 命令在新窗口中运行，完全独立于父进程
    // start "" 启动新窗口，/D 设置工作目录，cmd /K 保持窗口打开
    const startCommand = `start "P4 Sync - MHAtomExcelTool 更新" /D "${dirPath}" cmd /K "${syncCommand}"`;
    
    exec(startCommand, {
        cwd: dirPath,
        windowsHide: false
    }, (error: any) => {
        if (error) {
            console.error('[P4Service] Failed to open CMD:', error.message);
        }
    });
    
    console.log('[P4Service] Opened independent CMD for sync:', syncCommand);
}
