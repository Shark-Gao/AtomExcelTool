/**
 * 腾讯混元 AI 服务（内网 OpenAPI 版本）
 * 用于原子配置推荐问答
 */

import { ClassMetadata } from '../../types/MetaDefine';

// ============ 类型定义 ============

export interface HunyuanConfig {
  apiKey: string;  // 内网申请的 API Key
  apiHost?: string;  // API 地址，默认 hunyuanapi.woa.com
  model?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HunyuanResponse {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
}

// ============ 混元服务类 ============

export class HunyuanService {
  private config: HunyuanConfig;
  private conversationHistory: ChatMessage[] = [];
  private systemPrompt: string = '';

  constructor(config: HunyuanConfig) {
    this.config = {
      apiHost: 'hunyuanapi.woa.com',  // 内网 API 地址
      model: 'hunyuan-2.0-thinkin1g-20251109',  // 固定使用 thinking 模型
      ...config
    };
    console.log('[HunyuanService] Initialized with model:', this.config.model);
  }

  /**
   * 初始化系统提示词，注入原子知识库
   */
  initializeWithAtomKnowledge(metadata: ClassMetadata[]): void {
    // 构建原子知识库摘要
    const atomSummary = this.buildAtomKnowledgeSummary(metadata);
    
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
2. 推荐配置时，给出具体的参数值示例
3. 如果用户的需求不明确，主动询问细节
4. 对于复杂配置，分步骤说明

请根据用户的问题，结合上述原子知识库进行回答。`;

    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];
  }

  /**
   * 构建原子知识库摘要
   */
  private buildAtomKnowledgeSummary(metadata: ClassMetadata[]): string {
    // 按类别分组
    const categoryMap = new Map<string, ClassMetadata[]>();
    
    for (const meta of metadata) {
      const category = meta.category || '未分类';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(meta);
    }

    let summary = '';
    
    for (const [category, atoms] of categoryMap) {
      summary += `\n### ${category}\n`;
      
      for (const atom of atoms.slice(0, 50)) { // 限制每个类别最多50个，避免 token 过多
        summary += `- **${atom.displayName || atom.className}** (${atom.funcName})\n`;
        if (atom.description) {
          summary += `  说明: ${atom.description}\n`;
        }
        if (atom.fields && atom.fields.length > 0) {
          const fieldNames = atom.fields.map(f => f.label || f.key).join(', ');
          summary += `  参数: ${fieldNames}\n`;
        }
      }
    }

    return summary;
  }

  /**
   * 发送消息并获取回复（使用流式调用，收集完整响应）
   */
  async chat(userMessage: string, context?: { currentAtom?: ClassMetadata }): Promise<HunyuanResponse> {
    try {
      // 构建用户消息，可附加当前上下文
      let fullMessage = userMessage;
      if (context?.currentAtom) {
        fullMessage = `[当前正在编辑的原子: ${context.currentAtom.displayName || context.currentAtom.className}]\n\n${userMessage}`;
      }

      this.conversationHistory.push({ role: 'user', content: fullMessage });

      // 使用流式调用，收集完整响应
      let fullContent = '';
      let errorMsg = '';
      
      for await (const chunk of this.callHunyuanAPIStream(this.conversationHistory)) {
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
   * 流式对话（返回 AsyncGenerator）
   */
  async *chatStream(userMessage: string, context?: { currentAtom?: ClassMetadata }): AsyncGenerator<StreamChunk> {
    try {
      let fullMessage = userMessage;
      if (context?.currentAtom) {
        fullMessage = `[当前正在编辑的原子: ${context.currentAtom.displayName || context.currentAtom.className}]\n\n${userMessage}`;
      }

      this.conversationHistory.push({ role: 'user', content: fullMessage });

      let fullResponse = '';
      
      for await (const chunk of this.callHunyuanAPIStream(this.conversationHistory)) {
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
   * 调用腾讯混元内网 OpenAPI
   */
  private async callHunyuanAPI(messages: ChatMessage[]): Promise<HunyuanResponse> {
    const { apiKey, apiHost, model } = this.config;
    
    const payload = {
      model: model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: false
    };

    const url = `https://${apiHost}/v1/chat/completions`;
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
  private async *callHunyuanAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const { apiKey, apiHost, model } = this.config;
    
    const payload = {
      model: model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: true
    };

    const url = `http://hunyuanapi.woa.com/openapi/v1`;
    console.log('[HunyuanAPI Stream] Request URL:', url);
    console.log('[HunyuanAPI Stream] Model:', model);

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
