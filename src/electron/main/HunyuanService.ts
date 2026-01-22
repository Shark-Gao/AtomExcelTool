/**
 * 腾讯混元 AI 服务（内网 OpenAPI 版本）
 * 用于原子配置推荐问答
 */

import {
  BaseAIService,
  ChatMessage,
  StreamChunk,
  TokenUsage,
  AIResponse,
  estimateMessagesTokens
} from './BaseAIService';

// ============ 类型定义 ============

export interface HunyuanConfig {
  apiKey: string;  // 内网申请的 API Key
  apiHost?: string;  // API 地址，默认 hunyuanapi.woa.com
  model?: string;
}

// 重新导出公共类型
export type { ChatMessage, TokenUsage, StreamChunk };
export type HunyuanResponse = AIResponse;

// ============ 混元服务类 ============

export class HunyuanService extends BaseAIService {
  private config: HunyuanConfig;
  
  // 混元价格：输入约 0.004元/1K tokens，输出约 0.008元/1K tokens
  // 混元内网免费，但记录估算成本用于参考（按公网价格）
  protected inputPricePerK = 0.004;
  protected outputPricePerK = 0.008;

  constructor(config: HunyuanConfig) {
    super('HunyuanService');
    this.config = {
      ...config
    };
    console.log('[HunyuanService] Initialized with model:', this.config.model);
  }

  /**
   * 调用腾讯混元内网 OpenAPI（非流式）
   */
  private async callHunyuanAPI(messages: ChatMessage[]): Promise<AIResponse> {
    const { apiKey, apiHost, model } = this.config;
    
    const payload = {
      model: model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: false
    };

    const url = `http://${apiHost}/v1/chat/completions`;
    console.log('[HunyuanAPI] Request URL:', url);
    console.log('[HunyuanAPI] Request payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    console.log('[HunyuanAPI] Response status:', response.status, response.statusText);

    // 先获取原始文本，便于调试
    const rawText = await response.text();
    console.log('[HunyuanAPI] Raw response (first 500 chars):', rawText.substring(0, 500));

    // 检查 HTTP 状态
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}\n${rawText.substring(0, 200)}`
      };
    }

    // 尝试解析 JSON
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      console.error('[HunyuanAPI] JSON parse error:', parseError);
      return {
        success: false,
        error: `响应不是有效的 JSON 格式: ${rawText.substring(0, 200)}`
      };
    }

    if (data.error) {
      return {
        success: false,
        error: data.error.message || data.error.code || '请求失败'
      };
    }

    return {
      success: true,
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }
    };
  }

  /**
   * 流式调用腾讯混元内网 OpenAPI
   */
  protected async *callAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const { apiKey, apiHost, model } = this.config;
    
    const payload = {
      model: model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: true
    };

    const url = `http://${apiHost}/openapi/v1/chat/completions`;
    
    // 估算本次请求的输入 token
    const estimatedInputTokens = estimateMessagesTokens(messages);
    console.log('[HunyuanAPI Stream] Request URL:', url);
    console.log('[HunyuanAPI Stream] Model:', model);
    console.log('[HunyuanAPI Stream] Estimated input tokens:', estimatedInputTokens);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    console.log('[HunyuanAPI Stream] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[HunyuanAPI Stream] Error response:', errorText.substring(0, 500));
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
        
        // 调试：打印第一个 chunk
        if (isFirstChunk) {
          console.log('[HunyuanAPI Stream] First chunk (100 chars):', chunk.substring(0, 100));
          isFirstChunk = false;
        }

        // 尝试按行解析 SSE 格式
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          // SSE 格式: data: {...}
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data === '[DONE]') {
              yield { type: 'done' };
              return;
            }
            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                yield { type: 'content', content };
              }
              // 解析 usage 信息
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

      // 处理剩余 buffer（可能是完整 JSON 响应而非 SSE）
      if (buffer.trim()) {
        console.log('[HunyuanAPI Stream] Remaining buffer (200 chars):', buffer.substring(0, 200));
        try {
          const json = JSON.parse(buffer);
          // 非流式 JSON 响应格式
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
          // 可能是 SSE 的最后一行
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
