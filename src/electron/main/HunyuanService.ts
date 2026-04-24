/**
 * 混元 Hy3 Preview AI 服务（太极平台 OpenAPI v2）
 * 用于原子配置推荐问答
 * 
 * 纯 AI 问答模式：不使用 Function Calling，
 * 仅根据提示词中的知识库回答问题。
 * 
 * 接入协议变更（v1 → v2）：
 * - 域名：hunyuanapi.woa.com → api.taiji.woa.com
 * - 路径：/openapi/v1/chat/completions → /openapi/v2/chat/completions
 * - 模型名：hy3-preview
 * - 已移除参数：stream_moderation、enable_enhancement
 * - finish_reason 映射：sensitive → content_filter，新增 length
 * - 使用 reasoning_effort 替代 enable_thinking
 */

import {
  BaseAIService,
  ChatMessage,
  StreamChunk,
  TokenUsage,
  AIResponse,
  estimateMessagesTokens,
} from './BaseAIService';

// ============ 类型定义 ============

export interface HunyuanConfig {
  apiKey: string;  // 太极平台申请的 API Key
  apiHost?: string;  // API 地址，默认 api.taiji.woa.com
  model?: string;
}

// 重新导出公共类型
export type { ChatMessage, TokenUsage, StreamChunk };
export type HunyuanResponse = AIResponse;

// ============ 混元服务类 ============

export class HunyuanService extends BaseAIService {
  private config: HunyuanConfig;
  
  // Hy3 preview 价格（内网免费，记录估算成本仅供参考）
  protected inputPricePerK = 0.004;
  protected outputPricePerK = 0.008;

  // Hy3 preview 上下文窗口 256K
  protected maxContextTokens: number = 262144;

  // 思考模式：'no_think'(默认) / 'low' / 'high'
  private reasoningEffort: string = 'no_think';

  constructor(config: HunyuanConfig) {
    super('HunyuanService');
    this.config = {
      ...config
    };
    console.log('[HunyuanService] Initialized with model:', this.config.model);
  }

  /**
   * 设置思考模式
   */
  setReasoningEffort(level: 'no_think' | 'low' | 'high'): void {
    this.reasoningEffort = level;
    console.log('[HunyuanService] Reasoning effort set to:', level);
  }

  /**
   * 获取当前深度思考等级
   */
  getReasoningEffort(): string {
    return this.reasoningEffort;
  }

  /**
   * 映射 finish_reason（v2 协议适配）
   * - sensitive → content_filter（内容安全拦截）
   * - length（新增，输出达到 max_tokens 截断）
   * - stop（正常结束）
   */
  private mapFinishReason(reason: string | undefined): string | undefined {
    if (!reason) return reason;
    if (reason === 'sensitive') return 'content_filter';
    return reason; // stop, length 等原样返回
  }

  /**
   * 流式调用太极平台 Hy3 Preview OpenAPI v2
   * 纯文本问答，不使用 Function Calling
   */
  protected async *callAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const { apiKey, apiHost, model } = this.config;
    
    // 构建请求消息
    const apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // 构建请求格式（v2 协议，不附带已移除的 stream_moderation / enable_enhancement 等）
    const payload: any = {
      model: model,
      messages: apiMessages,
      stream: true,
      stream_options: { include_usage: true }
    };

    // 仅在非 no_think 时才设置 reasoning_effort
    if (this.reasoningEffort && this.reasoningEffort !== 'no_think') {
      payload.reasoning_effort = this.reasoningEffort;
    }

    // v2 协议使用 https 和新路径
    const url = `http://${apiHost}/openapi/v2/chat/completions`;
    
    const estimatedMsgTokens = estimateMessagesTokens(messages);
    console.log('[HunyuanAPI v2 Stream] Request URL:', url);
    console.log('[HunyuanAPI v2 Stream] Model:', model);
    console.log('[HunyuanAPI v2 Stream] Messages count:', messages.length);
    console.log(`[HunyuanAPI v2 Stream] Estimated tokens: msgs=${estimatedMsgTokens}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    console.log('[HunyuanAPI v2 Stream] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[HunyuanAPI v2 Stream] Error response:', errorText.substring(0, 500));
      yield { type: 'error', error: `HTTP ${response.status}: ${response.statusText}\n${errorText.substring(0, 200)}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: '无法获取响应流' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let isFirstChunk = true;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        if (isFirstChunk) {
          console.log('[HunyuanAPI v2 Stream] First chunk (100 chars):', chunk.substring(0, 100));
          isFirstChunk = false;
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data === '[DONE]') {
              yield { type: 'done' };
              return;
            }
            try {
              const json = JSON.parse(data);
              const choice = json.choices?.[0];
              
              // 处理 finish_reason（v2 协议映射）
              const finishReason = this.mapFinishReason(choice?.finish_reason);
              if (finishReason === 'content_filter') {
                yield { type: 'error', error: '内容被安全策略拦截（content_filter）' };
                return;
              }
              if (finishReason === 'length') {
                console.log('[HunyuanAPI v2 Stream] Output truncated: finish_reason=length');
              }

              if (choice?.delta) {
                const content = choice.delta.content;
                if (content) {
                  yield { type: 'content', content };
                }
              }

              if (json.usage) {
                yield {
                  type: 'usage',
                  usage: {
                    promptTokens: json.usage.prompt_tokens || 0,
                    completionTokens: json.usage.completion_tokens || 0,
                    totalTokens: json.usage.total_tokens || 0
                  }
                };
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // 处理剩余 buffer
      if (buffer.trim()) {
        console.log('[HunyuanAPI v2 Stream] Remaining buffer (200 chars):', buffer.substring(0, 200));
        try {
          const json = JSON.parse(buffer);
          const content = json.choices?.[0]?.message?.content || json.choices?.[0]?.delta?.content;
          if (content) {
            yield { type: 'content', content };
          }
          if (json.usage) {
            yield {
              type: 'usage',
              usage: {
                promptTokens: json.usage.prompt_tokens || 0,
                completionTokens: json.usage.completion_tokens || 0,
                totalTokens: json.usage.total_tokens || 0
              }
            };
          }
          if (json.error) {
            yield { type: 'error', error: json.error.message || json.error.code || '请求失败' };
            return;
          }
        } catch {
          if (buffer.startsWith('data:')) {
            const data = buffer.slice(5).trim();
            if (data && data !== '[DONE]') {
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  yield { type: 'content', content };
                }
                if (json.usage) {
                  yield {
                    type: 'usage',
                    usage: {
                      promptTokens: json.usage.prompt_tokens || 0,
                      completionTokens: json.usage.completion_tokens || 0,
                      totalTokens: json.usage.total_tokens || 0
                    }
                  };
                }
              } catch {
                // 忽略
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }
}

// ============ 单例管理 ============

let hunyuanServiceInstance: HunyuanService | null = null;

export function initHunyuanService(config: HunyuanConfig): HunyuanService {
  hunyuanServiceInstance = new HunyuanService(config);
  return hunyuanServiceInstance;
}

export function getHunyuanService(): HunyuanService | null {
  return hunyuanServiceInstance;
}
