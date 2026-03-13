/**
 * 腾讯混元 AI 服务（内网 OpenAPI 版本）
 * 用于原子配置推荐问答
 * 
 * 纯 AI 问答模式：不使用 Function Calling，
 * 仅根据提示词中的知识库回答问题。
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

  // 混元 2.0 thinking 模型上下文窗口 32K
  // 如使用 hunyuan-pro / hunyuan-turbo 等模型可按需调整
  protected maxContextTokens: number = 3276800;

  constructor(config: HunyuanConfig) {
    super('HunyuanService');
    this.config = {
      ...config
    };
    console.log('[HunyuanService] Initialized with model:', this.config.model);
  }

  /**
   * 流式调用腾讯混元内网 OpenAPI
   * 纯文本问答，不使用 Function Calling
   */
  protected async *callAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const { apiKey, apiHost, model } = this.config;
    
    // 构建请求消息
    const apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // 构建请求格式（不附带 tools）
    const payload: any = {
      model: model,
      messages: apiMessages,
      stream: true,
      stream_options: { include_usage: true }
    };

    const url = `http://${apiHost}/openapi/v1/chat/completions`;
    
    const estimatedMsgTokens = estimateMessagesTokens(messages);
    console.log('[HunyuanAPI Stream] Request URL:', url);
    console.log('[HunyuanAPI Stream] Model:', model);
    console.log('[HunyuanAPI Stream] Messages count:', messages.length);
    console.log(`[HunyuanAPI Stream] Estimated tokens: msgs=${estimatedMsgTokens}`);

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
        
        if (isFirstChunk) {
          console.log('[HunyuanAPI Stream] First chunk (100 chars):', chunk.substring(0, 100));
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
        console.log('[HunyuanAPI Stream] Remaining buffer (200 chars):', buffer.substring(0, 200));
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
