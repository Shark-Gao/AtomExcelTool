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
            const match = line.match(/^\.\.\.\s+(\w+)\s+(.*)$/);
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
