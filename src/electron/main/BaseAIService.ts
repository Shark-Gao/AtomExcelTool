/**
 * AI 服务基类
 * 抽取 DeepSeek 和 Hunyuan 服务的公共逻辑
 */

import { ClassMetadata } from '../../types/MetaDefine';
import { buildSystemPrompt, getDefaultSystemPrompt } from './PromptBuilder';

// ============ 公共类型定义 ============

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;      // 输入 token（包含 system + 历史 + 当前问题）
  completionTokens: number;  // 输出 token（AI 回复）
  totalTokens: number;       // 总计
  estimatedCost?: number;    // 估算费用（元）
}

export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  usage?: TokenUsage;
}

export interface StreamChunk {
  type: 'content' | 'done' | 'error' | 'usage';
  content?: string;
  error?: string;
  usage?: TokenUsage;
}

// ============ Token 估算工具 ============

/**
 * 估算文本的 token 数量
 * 中文约 1.5-2 字符/token，英文约 4 字符/token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // 统计中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 统计英文和其他字符
  const otherChars = text.length - chineseChars;
  
  // 中文约 1.5 字符/token，英文约 4 字符/token
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 估算消息列表的总 token 数
 */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    // 每条消息有约 4 token 的元数据开销
    total += 4 + estimateTokens(msg.content);
  }
  return total;
}

// ============ AI 服务基类 ============

export abstract class BaseAIService {
  protected conversationHistory: ChatMessage[] = [];
  protected systemPrompt: string = '';
  protected atomKnowledgeLoaded: boolean = false;
  protected serviceName: string = 'BaseAI';
  
  /** Token 使用统计 */
  protected totalUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0
  };

  /** 价格配置：输入价格（元/1K tokens）和输出价格（元/1K tokens） */
  protected abstract inputPricePerK: number;
  protected abstract outputPricePerK: number;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.initializeDefaultPrompt();
  }

  /**
   * 初始化默认提示词
   */
  protected initializeDefaultPrompt(): void {
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
      console.log(`[${this.serviceName}] No metadata provided, using default prompt`);
      return;
    }

    console.log(`[${this.serviceName}] Building knowledge base with`, metadata.length, 'atoms');

    this.systemPrompt = buildSystemPrompt(metadata);

    const tokens = estimateTokens(this.systemPrompt);
    console.log(`[${this.serviceName}] System prompt length:`, this.systemPrompt.length, 'chars');
    console.log(`[${this.serviceName}] System prompt estimated tokens:`, tokens);

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
   * 获取累计 Token 使用统计
   */
  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  /**
   * 重置 Token 统计
   */
  resetUsage(): void {
    this.totalUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0
    };
  }

  /**
   * 估算当前对话的 token 消耗（发送前预估）
   */
  estimateCurrentUsage(): { systemTokens: number; historyTokens: number; totalInputTokens: number } {
    const systemTokens = estimateTokens(this.systemPrompt);
    const historyTokens = estimateMessagesTokens(
      this.conversationHistory.filter(m => m.role !== 'system')
    );
    return {
      systemTokens,
      historyTokens,
      totalInputTokens: systemTokens + historyTokens
    };
  }

  /**
   * 更新 token 统计
   */
  protected updateUsage(usage: TokenUsage): void {
    this.totalUsage.promptTokens += usage.promptTokens;
    this.totalUsage.completionTokens += usage.completionTokens;
    this.totalUsage.totalTokens += usage.totalTokens;
    this.totalUsage.estimatedCost = (
      this.totalUsage.promptTokens * this.inputPricePerK / 1000 +
      this.totalUsage.completionTokens * this.outputPricePerK / 1000
    );
  }

  /**
   * 构建用户消息（可附加当前上下文）
   */
  protected buildUserMessage(userMessage: string, context?: { currentAtom?: ClassMetadata }): string {
    if (context?.currentAtom) {
      return `[当前正在编辑的原子: ${context.currentAtom.displayName || context.currentAtom.className}]\n\n${userMessage}`;
    }
    return userMessage;
  }

  /**
   * 发送消息并获取回复
   */
  async chat(userMessage: string, context?: { currentAtom?: ClassMetadata }): Promise<AIResponse> {
    try {
      const fullMessage = this.buildUserMessage(userMessage, context);
      this.conversationHistory.push({ role: 'user', content: fullMessage });

      let fullContent = '';
      let errorMsg = '';
      let usage: TokenUsage | undefined;
      
      for await (const chunk of this.callAPIStream(this.conversationHistory)) {
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
        } else if (chunk.type === 'error') {
          errorMsg = chunk.error || '未知错误';
        } else if (chunk.type === 'usage' && chunk.usage) {
          usage = chunk.usage;
        }
      }

      if (errorMsg) {
        return { success: false, error: errorMsg };
      }
      
      if (fullContent) {
        this.conversationHistory.push({ role: 'assistant', content: fullContent });
      }

      // 如果 API 没返回 usage，使用估算值
      if (!usage) {
        const promptTokens = estimateMessagesTokens(this.conversationHistory.slice(0, -1));
        const completionTokens = estimateTokens(fullContent);
        usage = {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        };
      }

      this.updateUsage(usage);
      console.log(`[${this.serviceName}] This request usage:`, usage);
      console.log(`[${this.serviceName}] Total accumulated usage:`, this.totalUsage);

      return {
        success: true,
        content: fullContent,
        usage
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
      const fullMessage = this.buildUserMessage(userMessage, context);
      this.conversationHistory.push({ role: 'user', content: fullMessage });

      let fullResponse = '';
      let usage: TokenUsage | undefined;
      
      for await (const chunk of this.callAPIStream(this.conversationHistory)) {
        if (chunk.type === 'content' && chunk.content) {
          fullResponse += chunk.content;
        }
        if (chunk.type === 'usage' && chunk.usage) {
          usage = chunk.usage;
        }
        yield chunk;
      }

      if (fullResponse) {
        this.conversationHistory.push({ role: 'assistant', content: fullResponse });
      }

      // 如果 API 没返回 usage，使用估算值
      if (!usage) {
        const promptTokens = estimateMessagesTokens(this.conversationHistory.slice(0, -1));
        const completionTokens = estimateTokens(fullResponse);
        usage = {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        };
        yield { type: 'usage', usage };
      }

      this.updateUsage(usage);
      console.log(`[${this.serviceName}] This request usage:`, usage);
      console.log(`[${this.serviceName}] Total accumulated usage:`, this.totalUsage);
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
   * 子类实现：流式调用 API
   */
  protected abstract callAPIStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk>;
}
