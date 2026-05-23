/**
 * DeepSeek AI 服务（火山引擎 API）
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
  estimateTokens,
  estimateMessagesTokens,
} from './BaseAIService';

// ============ 类型定义 ============

export interface DeepSeekConfig {
  apiKey: string;
  model?: string;
}

// 重新导出公共类型
export type { ChatMessage, TokenUsage, StreamChunk };
export type DeepSeekResponse = AIResponse;

// ============ DeepSeek 服务类 ============

export class DeepSeekService extends BaseAIService {
  private config: DeepSeekConfig;
  
  // DeepSeek 价格：输入 0.001元/1K tokens，输出 0.002元/1K tokens
  protected inputPricePerK = 0.001;
  protected outputPricePerK = 0.002;

  // DeepSeek-V3 上下文窗口 98304 tokens
  protected maxContextTokens: number = 98304;

  constructor(config: DeepSeekConfig) {
    super('DeepSeekService');
    this.config = {
      model: 'ep-20251231180434-9vq8m',
      ...config
    };
    console.log('[DeepSeekService] Initialized with model:', this.config.model);
  }

  /**
   * 流式调用 DeepSeek API（火山引擎）
   * 使用 OpenAI 兼容格式：/api/v3/chat/completions
   * 纯文本问答，不使用 Function Calling
   */
  protected async *callAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const { apiKey, model } = this.config;

    // 构建请求消息
    const apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // 构建请求格式（OpenAI 兼容格式，不附带 tools）
    const payload: any = {
      model: model,
      stream: true,
      stream_options: { include_usage: true },
      messages: apiMessages
    };

    const url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    
    const estimatedMsgTokens = estimateMessagesTokens(messages);
    console.log('[DeepSeekAPI Stream] Request URL:', url);
    console.log('[DeepSeekAPI Stream] Model:', model);
    console.log('[DeepSeekAPI Stream] Messages count:', messages.length);
    console.log(`[DeepSeekAPI Stream] Estimated tokens: msgs=${estimatedMsgTokens}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    console.log('[DeepSeekAPI Stream] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeepSeekAPI Stream] Error response:', errorText.substring(0, 500));
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
          console.log('[DeepSeekAPI Stream] First chunk (200 chars):', chunk.substring(0, 200));
          isFirstChunk = false;
        }

        // 按行解析 SSE 格式
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
                const content = choice.delta.content || '';
                if (content) {
                  yield { type: 'content', content };
                }
              }

              // 解析 usage 信息（通常在最后一个 chunk）
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
        console.log('[DeepSeekAPI Stream] Remaining buffer (300 chars):', buffer.substring(0, 300));
        
        const lines = buffer.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data && data !== '[DONE]') {
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
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

let deepSeekServiceInstance: DeepSeekService | null = null;

export function initDeepSeekService(config: DeepSeekConfig): DeepSeekService {
  deepSeekServiceInstance = new DeepSeekService(config);
  return deepSeekServiceInstance;
}

export function getDeepSeekService(): DeepSeekService | null {
  return deepSeekServiceInstance;
}

// 导出 Token 估算函数供外部使用
export { estimateTokens, estimateMessagesTokens };
