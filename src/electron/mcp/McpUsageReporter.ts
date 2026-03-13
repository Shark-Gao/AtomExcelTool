/**
 * MCP Server 专用上报模块
 * 
 * 与 UsageReporter.ts 功能类似，但不依赖 Electron（app 模块），
 * 可在独立的 Node.js 进程（MCP Server via stdio）中运行。
 * 
 * 上报事件：
 * - mcp_tool_call: MCP 工具被外部 AI 客户端调用
 * - mcp_server_start: MCP Server 启动
 */

import * as http from 'http';
import * as https from 'https';
import * as os from 'os';

// ============ 配置 ============

const MCP_REPORT_CONFIG = {
  toolId: 'MHAtomExcelTool',
  serverUrl: 'http://10.30.129.88:9876/api/notify',
  timeout: 3000,
};

// ============ 工具函数 ============

function getLocalIp(): string {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (iface.internal || iface.family !== 'IPv4') continue;
        return iface.address;
      }
    }
  } catch {
    // ignore
  }
  return '127.0.0.1';
}

function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ============ 缓存设备信息 ============

const deviceInfo = {
  username: os.userInfo().username,
  hostname: os.hostname(),
  ip_address: getLocalIp(),
  os_version: `${os.platform()} ${os.release()}`,
};

// 尝试从 package.json 获取版本号（MCP Server 进程中无法用 app.getVersion()）
let appVersion = '1.0.0';
try {
  // MCP Server 的 cwd 是项目根目录
  const pkg = require('../../../package.json');
  appVersion = pkg.version || '1.0.0';
} catch {
  // fallback
}

// ============ 上报函数 ============

function sendReport(payload: Record<string, unknown>): void {
  try {
    const data = JSON.stringify(payload);
    const url = new URL(MCP_REPORT_CONFIG.serverUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: MCP_REPORT_CONFIG.timeout,
    };

    const req = httpModule.request(options, (res) => {
      if (res.statusCode === 200) {
        console.error(`[McpUsageReporter] 上报成功: ${payload.event_type}`);
      }
      res.resume();
    });

    req.on('error', (e) => {
      console.error(`[McpUsageReporter] 上报失败（可忽略）: ${e.message}`);
    });

    req.on('timeout', () => {
      console.error(`[McpUsageReporter] 上报超时（可忽略）`);
      req.destroy();
    });

    req.write(data);
    req.end();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[McpUsageReporter] 上报异常（可忽略）: ${msg}`);
  }
}

function buildPayload(eventType: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    timestamp: getTimestamp(),
    event_type: eventType,
    tool_id: MCP_REPORT_CONFIG.toolId,
    app_version: appVersion,
    ...deviceInfo,
    source: 'mcp_server',  // 标识来源为 MCP Server（区别于 Electron 主进程上报）
    ...extra,
  };
}

// ============ 导出的上报函数 ============

/**
 * 上报 MCP 工具调用
 * @param toolName 被调用的工具名
 * @param extraInfo 额外信息（如参数摘要）
 */
export function reportMcpToolCall(toolName: string, extraInfo?: Record<string, unknown>): void {
  const payload = buildPayload('mcp_tool_call', {
    tool_name: toolName,
    ...extraInfo,
  });
  sendReport(payload);
}

/**
 * 上报 MCP Server 启动
 */
export function reportMcpServerStart(): void {
  const payload = buildPayload('mcp_server_start');
  sendReport(payload);
}
