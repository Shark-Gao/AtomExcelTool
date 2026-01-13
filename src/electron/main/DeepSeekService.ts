/**
 * DeepSeek AI 服务（火山引擎 API）
 * 用于原子配置推荐问答
 */

import { ClassMetadata } from '../../types/MetaDefine';
import { buildSystemPrompt, getDefaultSystemPrompt } from './PromptBuilder';

// ============ 类型定义 ============

export interface DeepSeekConfig {
  apiKey: string;
  model?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface StreamChunk {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
}

// ============ DeepSeek 服务类 ============

export class DeepSeekService {
  private config: DeepSeekConfig;
  private conversationHistory: ChatMessage[] = [];
  private systemPrompt: string = '';
  private atomKnowledgeLoaded: boolean = false;

  constructor(config: DeepSeekConfig) {
    this.config = {
      model: 'ep-20251231180434-9vq8m',
      ...config
    };
    console.log('[DeepSeekService] Initialized with model:', this.config.model);
    this.initializeDefaultPrompt();
  }

  /**
   * 初始化默认提示词
   */
  private initializeDefaultPrompt(): void {
    this.systemPrompt = getDefaultSystemPrompt();

    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];
  }

  /**
   * 使用已解析的 ClassMetadata 初始化原子知识库
   */
  initializeWithAtomKnowledge(metadata: ClassMetadata[]): void {
    if (!metadata || metadata.length === 0) {
      console.log('[DeepSeekService] No metadata provided, using default prompt');
      return;
    }

    console.log('[DeepSeekService] Building knowledge base with', metadata.length, 'atoms');

    this.systemPrompt = buildSystemPrompt(metadata);

    console.log('[DeepSeekService] System prompt length:', this.systemPrompt.length);

    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];
    
    this.atomKnowledgeLoaded = true;
  }

  /**
   * 检查知识库是否已加载
   */
  isKnowledgeLoaded(): boolean {
    return this.atomKnowledgeLoaded;
  }

  /**
   * 发送消息并获取回复
   */
  async chat(userMessage: string, context?: { currentAtom?: ClassMetadata }): Promise<DeepSeekResponse> {
    try {
      let fullMessage = userMessage;
      if (context?.currentAtom) {
        fullMessage = `[当前正在编辑的原子: ${context.currentAtom.displayName || context.currentAtom.className}]\n\n${userMessage}`;
      }

      this.conversationHistory.push({ role: 'user', content: fullMessage });

      let fullContent = '';
      let errorMsg = '';
      
      for await (const chunk of this.callDeepSeekAPIStream(this.conversationHistory)) {
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
        } else if (chunk.type === 'error') {
          errorMsg = chunk.error || '未知错误';
        }
      }

      if (errorMsg) {
        return { success: false, error: errorMsg };
      }
      
      if (fullContent) {
        this.conversationHistory.push({ role: 'assistant', content: fullContent });
      }

      return {
        success: true,
        content: fullContent
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 流式对话
   */
  async *chatStream(userMessage: string, context?: { currentAtom?: ClassMetadata }): AsyncGenerator<StreamChunk> {
    try {
      let fullMessage = userMessage;
      if (context?.currentAtom) {
        fullMessage = `[当前正在编辑的原子: ${context.currentAtom.displayName || context.currentAtom.className}]\n\n${userMessage}`;
      }

      this.conversationHistory.push({ role: 'user', content: fullMessage });

      let fullResponse = '';
      
      for await (const chunk of this.callDeepSeekAPIStream(this.conversationHistory)) {
        if (chunk.type === 'content' && chunk.content) {
          fullResponse += chunk.content;
        }
        yield chunk;
      }

      if (fullResponse) {
        this.conversationHistory.push({ role: 'assistant', content: fullResponse });
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 清空对话历史
   */
  clearHistory(): void {
    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];
  }

  /**
   * 流式调用 DeepSeek API（火山引擎）
   * 使用 OpenAI 兼容格式：/api/v3/chat/completions
   */
  private async *callDeepSeekAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const { apiKey, model } = this.config;
    
    // 构建请求格式（OpenAI 兼容格式）
    const payload = {
      model: model,
      stream: true,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    };

    const url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    console.log('[DeepSeekAPI Stream] Request URL:', url);
    console.log('[DeepSeekAPI Stream] Model:', model);
    console.log('[DeepSeekAPI Stream] Messages count:', messages.length);

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
              // OpenAI 格式: choices[].delta.content
              const content = json.choices?.[0]?.delta?.content || '';
              if (content) {
                yield { type: 'content', content };
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
