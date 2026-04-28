/**
 * Knot AI 服务（AG-UI 协议）
 * 通过公司 Knot 智能体网关调用多种 AI 模型
 *
 * 与混元服务的关键差异：
 * - 认证：x-knot-api-token + x-knot-api-user（用户自行配置）
 * - 对话历史：服务端通过 conversation_id 管理，客户端不需要发 messages 数组
 * - 响应格式：AG-UI 事件协议（TEXT_MESSAGE_CONTENT 等），非 OpenAI 兼容格式
 * - 模型：支持 deepseek / claude / gpt / glm / hy3-preview 等 10+ 模型
 *
 * AG-UI 协议事件参考：https://github.com/ag-ui-protocol/ag-ui
 */

import {
  BaseAIService,
  ChatMessage,
  StreamChunk,
  TokenUsage,
} from './BaseAIService';
import { execFile } from 'child_process';
import { Readable } from 'stream';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ============ 类型定义 ============

export interface KnotConfig {
  apiToken: string;   // 用户的个人/团队 token（从 https://knot.woa.com/settings/token 申请）
  apiUser: string;    // 企微英文名
  agentId: string;    // 智能体 ID
  model?: string;     // 模型名称，默认 deepseek-v3.1
}

/** Knot AG-UI 支持的模型列表 */
export const KNOT_AVAILABLE_MODELS = [
  { value: 'deepseek-v3.1', label: 'DeepSeek V3.1' },
  { value: 'deepseek-v3.2', label: 'DeepSeek V3.2' },
  { value: 'glm-4.7', label: 'GLM 4.7' },
  { value: 'glm-5.1', label: 'GLM 5.1' },
  { value: 'claude-4.7-opus', label: 'Claude 4.7 Opus' },
  { value: 'claude-4.6-sonnet', label: 'Claude 4.6 Sonnet' },
  { value: 'claude-4.6-sonnet-1m-context', label: 'Claude 4.6 Sonnet (1M)' },
  { value: 'claude-4.6-opus', label: 'Claude 4.6 Opus' },
  { value: 'claude-4.6-opus-1m-context', label: 'Claude 4.6 Opus (1M)' },
  { value: 'gpt-5.4', label: 'GPT 5.4' },
  { value: 'hy3-preview', label: '混元 Hy3 Preview' },
];

// ============ AG-UI 事件类型 ============

interface AGUIEvent {
  type: string;
  rawEvent: {
    message_id?: string;
    conversation_id?: string;
    content?: string;
    step_name?: string;
    token_usage?: {
      completion_tokens: number;
      prompt_tokens: number;
      total_tokens: number;
    };
    tip_option?: {
      type: string;
      level: string;
      content: string;
    };
  };
}

// ============ Knot 服务类 ============

export class KnotService extends BaseAIService {
  private config: KnotConfig;
  private conversationId: string = '';
  private knowledgeSentForConversation: boolean = false;  // 当前会话是否已注入知识库

  // Knot 按量计费，价格取决于底层模型，这里给一个平均估算值
  protected inputPricePerK = 0.01;
  protected outputPricePerK = 0.03;

  // Knot 上下文窗口取决于底层模型，保守取 128K
  protected maxContextTokens: number = 131072;

  constructor(config: KnotConfig) {
    super('KnotService');
    this.config = {
      model: 'deepseek-v3.1',
      ...config,
    };
    console.log('[KnotService] Initialized with model:', this.config.model, 'agentId:', this.config.agentId);
  }

  /**
   * 获取当前 conversation_id
   */
  getConversationId(): string {
    return this.conversationId;
  }

  /**
   * 重置 conversation（开始新对话）
   */
  resetConversation(): void {
    this.conversationId = '';
    this.knowledgeSentForConversation = false;
    console.log('[KnotService] Conversation reset');
  }

  /**
   * 设置模型
   */
  setModel(model: string): void {
    this.config.model = model;
    console.log('[KnotService] Model set to:', model);
  }

  /**
   * 获取当前模型
   */
  getModel(): string {
    return this.config.model || 'deepseek-v3.1';
  }

  /**
   * 清空对话历史（重写父类：同时重置 conversation_id）
   */
  clearHistory(): void {
    super.clearHistory();
    this.resetConversation();
  }

  /**
   * 流式调用 Knot AG-UI 协议
   *
   * 使用 child_process.spawn + curl：
   * - 临时文件传 JSON body（避免 Windows 引号转义问题）
   * - -k 忽略内网 SSL 自签名证书
   * - --noproxy 避免代理干扰
   */
  protected async *callAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const { apiToken, apiUser, agentId, model } = this.config;

    // 从 messages 中取最后一条 user 消息作为 input
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg || !lastUserMsg.content) {
      yield { type: 'error', error: '没有找到用户消息' };
      return;
    }

    // Knot AG-UI 协议的对话历史由服务端通过 conversation_id 管理，
    // 客户端每次只发一条消息。但服务端不知道原子知识库，
    // 所以在每个新会话的第一条消息中，将系统提示词（原子知识库）注入到用户消息前面，
    // 后续消息靠 conversation_id 延续上下文，不再重复注入。
    let messageToSend = lastUserMsg.content;

    if (!this.knowledgeSentForConversation && this.systemPrompt) {
      console.log('[KnotAPI AG-UI] Injecting atom knowledge into first message (' + this.systemPrompt.length + ' chars)');
      messageToSend =
        `【系统指令 - 原子配置知识库】\n` +
        `以下是你在本次对话中需要遵循的专业知识，请认真阅读并在后续所有回答中参考：\n\n` +
        this.systemPrompt +
        `\n\n---\n\n` +
        `【用户消息】\n` +
        lastUserMsg.content;
      this.knowledgeSentForConversation = true;
    }

    // 构建 AG-UI 请求体
    const chatBody = {
      input: {
        message: messageToSend,
        conversation_id: this.conversationId,
        model: model,
        stream: true,
        enable_web_search: false,
        temperature: 0.5,
      }
    };

    const url = `https://knot.woa.com/apigw/api/v1/agents/agui/${agentId}`;

    console.log('[KnotAPI AG-UI] Request:', url);
    console.log('[KnotAPI AG-UI] Model:', model);
    console.log('[KnotAPI AG-UI] ConversationId:', this.conversationId || '(new)');
    console.log('[KnotAPI AG-UI] Message length:', lastUserMsg.content.length);

    const self = this;

    // 使用 spawn curl 做流式请求
    const { spawn } = require('child_process') as typeof import('child_process');

    // 构建干净的环境变量：移除所有代理设置
    const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'no_proxy', 'ALL_PROXY', 'all_proxy'];
    const cleanEnv = { ...process.env };
    for (const v of proxyVars) {
      delete cleanEnv[v];
    }

    // 将 JSON body 写入临时文件，避免 Windows 下 -d 参数的引号转义问题
    const tempBodyFile = join(tmpdir(), `knot_body_${Date.now()}.json`);
    writeFileSync(tempBodyFile, JSON.stringify(chatBody), 'utf-8');
    console.log('[KnotAPI AG-UI] Body written to temp file:', tempBodyFile);

    const curlArgs = [
      '-s',           // 静默模式
      '-N',           // 禁用缓冲（流式输出）
      '-k',           // 忽略 SSL 证书验证（内网自签名）
      '-L',           // 跟随重定向
      '--noproxy', '*',   // 强制不走任何代理
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', `x-knot-api-token: ${apiToken}`,
      ...(apiUser ? ['-H', `x-knot-api-user: ${apiUser}`] : []),
      '-d', `@${tempBodyFile}`,   // 从文件读取 body，避免 Windows 引号转义
      '-w', '\n__CURL_HTTP_CODE__%{http_code}',
      url
    ];

    console.log('[KnotAPI AG-UI] curl args:', JSON.stringify(curlArgs));

    const curlProcess = spawn('curl', curlArgs, {
      env: cleanEnv,
      windowsHide: true,
    });

    // 清理临时文件的辅助函数
    const cleanupTempFile = () => {
      try { unlinkSync(tempBodyFile); } catch { /* ignore */ }
    };

    // 将 curl 的 stdout 转为异步行迭代器
    const lineGenerator = (async function*(): AsyncGenerator<StreamChunk> {
      let buffer = '';
      let isFirstChunk = true;
      let httpCode = '0';

      for await (const rawChunk of curlProcess.stdout as Readable) {
        const chunk = rawChunk.toString();
        buffer += chunk;

        if (isFirstChunk) {
          console.log('[KnotAPI AG-UI] First chunk (100 chars):', chunk.substring(0, 100));
          isFirstChunk = false;
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // 检查 curl 的 HTTP 状态码标记
          if (trimmedLine.startsWith('__CURL_HTTP_CODE__')) {
            httpCode = trimmedLine.replace('__CURL_HTTP_CODE__', '');
            if (httpCode !== '200') {
              console.error('[KnotAPI AG-UI] HTTP error code:', httpCode);
            }
            continue;
          }

          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data === '[DONE]') {
              yield { type: 'done' } as StreamChunk;
              return;
            }

            try {
              const event: AGUIEvent = JSON.parse(data);
              if (!event.type) continue;

              // 保存 conversation_id
              if (event.rawEvent?.conversation_id) {
                self.conversationId = event.rawEvent.conversation_id;
              }

              switch (event.type) {
                case 'TEXT_MESSAGE_CONTENT':
                  if (event.rawEvent?.content) {
                    yield { type: 'content', content: event.rawEvent.content } as StreamChunk;
                  }
                  break;

                case 'TEXT_MESSAGE_START':
                case 'TEXT_MESSAGE_END':
                  break;

                case 'STEP_FINISHED':
                  if (event.rawEvent?.token_usage) {
                    const tu = event.rawEvent.token_usage;
                    yield {
                      type: 'usage',
                      usage: {
                        promptTokens: tu.prompt_tokens || 0,
                        completionTokens: tu.completion_tokens || 0,
                        totalTokens: tu.total_tokens || 0,
                      }
                    } as StreamChunk;
                  }
                  break;

                case 'RUN_ERROR':
                  if (event.rawEvent?.tip_option?.content) {
                    yield { type: 'error', error: event.rawEvent.tip_option.content } as StreamChunk;
                    return;
                  }
                  break;

                case 'THINKING_TEXT_MESSAGE_CONTENT':
                  break;

                default:
                  break;
              }
            } catch {
              // 可能是非 JSON 的错误文本
              if (!data.startsWith('{')) {
                // 纯文本错误（如 "404 page not found"）
                console.error('[KnotAPI AG-UI] Non-JSON response:', data.substring(0, 200));
                yield { type: 'error', error: data.substring(0, 200) } as StreamChunk;
                return;
              }
            }
          } else {
            // 不是 data: 开头的行，可能是错误响应体
            try {
              const json = JSON.parse(trimmedLine);
              if (json.msg || json.code) {
                console.error('[KnotAPI AG-UI] API error:', json.msg);
                yield { type: 'error', error: json.msg || `错误代码: ${json.code}` } as StreamChunk;
                return;
              }
            } catch {
              // 普通文本，可能是错误页面
              if (trimmedLine.includes('page not found') || trimmedLine.includes('404')) {
                yield { type: 'error', error: `HTTP 404: ${trimmedLine}` } as StreamChunk;
                return;
              }
            }
          }
        }
      }

      // 处理剩余 buffer
      if (buffer.trim()) {
        const remaining = buffer.trim();
        // 去掉可能的 HTTP code 标记
        const cleanRemaining = remaining.replace(/__CURL_HTTP_CODE__\d+/, '').trim();
        if (cleanRemaining && cleanRemaining.startsWith('data:')) {
          const jsonStr = cleanRemaining.slice(5).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            try {
              const event: AGUIEvent = JSON.parse(jsonStr);
              if (event.type === 'TEXT_MESSAGE_CONTENT' && event.rawEvent?.content) {
                yield { type: 'content', content: event.rawEvent.content } as StreamChunk;
              }
            } catch { /* ignore */ }
          }
        } else if (cleanRemaining) {
          try {
            const json = JSON.parse(cleanRemaining);
            if (json.msg) {
              yield { type: 'error', error: json.msg } as StreamChunk;
              return;
            }
          } catch { /* ignore */ }
        }
      }

      // 检查 stderr
      let stderrOutput = '';
      for await (const chunk of curlProcess.stderr as Readable) {
        stderrOutput += chunk.toString();
      }
      if (stderrOutput.trim()) {
        console.error('[KnotAPI AG-UI] curl stderr:', stderrOutput.substring(0, 300));
      }

      yield { type: 'done' } as StreamChunk;
    })();

    try {
      yield* lineGenerator;
    } finally {
      cleanupTempFile();
    }
  }
}

// ============ 单例管理 ============

let knotServiceInstance: KnotService | null = null;

export function initKnotService(config: KnotConfig): KnotService {
  knotServiceInstance = new KnotService(config);
  return knotServiceInstance;
}

export function getKnotService(): KnotService | null {
  return knotServiceInstance;
}
