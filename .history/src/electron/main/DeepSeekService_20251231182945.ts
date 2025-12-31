/**
 * DeepSeek AI 服务（火山引擎 API）
 * 用于原子配置推荐问答
 */

import { ClassMetadata } from '../../types/MetaDefine';

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
    this.systemPrompt = `你是一个专业的游戏配置原子表达式助手。你的任务是帮助用户理解和配置原子表达式。
请根据用户的问题进行回答。`;

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

    // 按类别分组
    const categoryMap = new Map<string, ClassMetadata[]>();
    
    for (const meta of metadata) {
      const category = meta.category || '未分类';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(meta);
    }

    // 构建知识库摘要
    let atomSummary = '';
    
    for (const [category, atoms] of categoryMap) {
      atomSummary += `\n### ${category}\n`;
      
      for (const atom of atoms) {
        atomSummary += `- **${atom.displayName || atom.className}** (\`${atom.className}\`)\n`;
        if (atom.funcName) {
          atomSummary += `  - 函数名: \`${atom.funcName}\`\n`;
        }
        if (atom.description) {
          atomSummary += `  - 说明: ${atom.description}\n`;
        }
        if (atom.richDescription) {
          atomSummary += `  - 用法: ${atom.richDescription}\n`;
        }
        if (atom.baseClass) {
          atomSummary += `  - 基类: ${atom.baseClass}\n`;
        }
        if (atom.fields && atom.fields.length > 0) {
          const fieldDesc = atom.fields.map(f => `${f.label || f.key}${f.isOptional ? '?' : ''}`).join(', ');
          atomSummary += `  - 参数: ${fieldDesc}\n`;
        }
      }
    }

    this.systemPrompt = `你是一个专业的游戏配置原子表达式助手。你的任务是帮助用户理解和配置原子表达式。

## 你的能力
1. 解释原子的用途和参数含义
2. 根据用户需求推荐合适的原子配置
3. 帮助用户排查原子配置问题
4. 提供原子表达式的最佳实践建议

## 原子知识库

以下是可用的原子类型及其说明：
${atomSummary}

## 回答规范
1. 使用简洁清晰的中文回答
2. 推荐配置时，给出具体的原子类名和参数值示例
3. 如果用户的需求不明确，主动询问细节
4. 对于复杂配置，分步骤说明
5. 引用原子时只显示funcName，最后推荐的原子也只能只funcName，类似这种程序代码的格式
(AAINextDamageTimeSpecificTaskType(RangedAttack)<=(AAIAbilityRandom()*0.05+0.075))&&AAINextDamageTimeSpecificTaskType(RangedAttack)>0&&GetDist2D(Self(), AAIGetEnemy())<=2000

请根据用户的问题，结合上述原子知识库进行回答。`;

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
   * 使用 OpenAI 兼容格式：base_url + /responses
   */
  private async *callDeepSeekAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const { apiKey, model } = this.config;
    
    // 构建请求格式（OpenAI SDK 兼容格式）
    // input 格式: [{"role": "user", "content": "..."}]
    const input = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const payload = {
      model: model,
      stream: true,
      input: input
    };

    const url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    console.log('[DeepSeekAPI Stream] Request URL:', url);
    console.log('[DeepSeekAPI Stream] Model:', model);
    console.log('[DeepSeekAPI Stream] Input messages count:', input.length);

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
          
          // SSE 格式: event: xxx 或 data: {...}
          if (trimmedLine.startsWith('event:')) {
            // 事件类型，可以忽略或记录
            continue;
          }
          
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data === '[DONE]') {
              yield { type: 'done' };
              return;
            }
            
            try {
              const json = JSON.parse(data);
              const content = this.extractContentFromResponse(json);
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
        
        // 尝试按行解析
        const lines = buffer.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            if (data && data !== '[DONE]') {
              try {
                const json = JSON.parse(data);
                const content = this.extractContentFromResponse(json);
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
          } else {
            // 尝试直接解析为 JSON（非流式响应）
            try {
              const json = JSON.parse(trimmedLine);
              const content = this.extractContentFromResponse(json);
              if (content) {
                yield { type: 'content', content };
              }
            } catch {
              // 忽略
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }

  /**
   * 从响应 JSON 中提取文本内容
   * 支持多种可能的响应格式
   */
  private extractContentFromResponse(json: any): string {
    let content = '';
    
    // 格式1: output[].content[].text（火山引擎 responses API 格式）
    if (json.output) {
      for (const outputItem of json.output) {
        if (outputItem.content) {
          if (Array.isArray(outputItem.content)) {
            for (const contentItem of outputItem.content) {
              if (contentItem.text) {
                content += contentItem.text;
              }
            }
          } else if (typeof outputItem.content === 'string') {
            content += outputItem.content;
          }
        }
        // 直接是 text 字段
        if (outputItem.text) {
          content += outputItem.text;
        }
      }
    }
    
    // 格式2: choices[].delta.content（OpenAI 流式格式）
    if (!content && json.choices) {
      content = json.choices[0]?.delta?.content || json.choices[0]?.message?.content || '';
    }
    
    // 格式3: 直接的 content 字段
    if (!content && json.content) {
      if (typeof json.content === 'string') {
        content = json.content;
      } else if (Array.isArray(json.content)) {
        for (const item of json.content) {
          if (item.text) {
            content += item.text;
          }
        }
      }
    }
    
    return content;
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
