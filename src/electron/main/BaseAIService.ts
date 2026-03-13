/**
 * AI 服务基类
 * 抽取 DeepSeek 和 Hunyuan 服务的公共逻辑
 * 
 * 纯 AI 问答模式：不使用 Function Calling / MCP 工具调用，
 * 仅根据提示词中注入的原子知识库来回答问题，避免超出上下文限制。
 */

import { ClassMetadata } from '../../types/MetaDefine';
import { buildSystemPrompt, getDefaultSystemPrompt } from './PromptBuilder';

// ============ 公共类型定义 ============

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | null;
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
 * 估算文本的 token 数量（保守估算，宁多不少）
 * 
 * 实际 BPE tokenizer 特性：
 * - 中文：约 1.2-1.8 字符/token（取 1.2，保守）
 * - 英文单词：约 1-1.5 token/word，即约 3 字符/token
 * - JSON/代码：关键字、括号、引号等各占 1 token，约 2.5 字符/token
 * - 标点符号：通常 1 字符 = 1 token
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  
  // 统计中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 统计英文和其他字符
  const otherChars = text.length - chineseChars;
  
  // 保守估算：中文 1.2 字符/token，英文/JSON 约 2.5 字符/token
  return Math.ceil(chineseChars / 1.2 + otherChars / 2.5);
}

/**
 * 估算消息列表的总 token 数
 */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    // 每条消息有约 7 token 的元数据开销（role, name, 分隔符等）
    total += 7;
    
    // 消息内容
    total += estimateTokens(msg.content);
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

  /** 
   * 模型最大上下文 token 数
   * 子类可以覆盖此值。默认 98304（DeepSeek 的限制）
   */
  protected maxContextTokens: number = 98304;

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
      let fullContent = '';
      let usage: TokenUsage | undefined;

      for await (const chunk of this.chatStream(userMessage, context)) {
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
        } else if (chunk.type === 'error') {
          return { success: false, error: chunk.error || '未知错误' };
        } else if (chunk.type === 'usage' && chunk.usage) {
          usage = chunk.usage;
        }
      }

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
   * 流式对话（纯 AI 问答，无工具调用）
   */
  async *chatStream(userMessage: string, context?: { currentAtom?: ClassMetadata }): AsyncGenerator<StreamChunk> {
    try {
      const fullMessage = this.buildUserMessage(userMessage, context);
      this.conversationHistory.push({ role: 'user', content: fullMessage });

      // 安全阈值 = 模型上下文限制 * 0.85（留 15% 余量给 completion 和误差）
      const safeContextLimit = Math.floor(this.maxContextTokens * 0.85);
      const MAX_INPUT_TOKENS = Math.max(15000, safeContextLimit);
      
      console.log(`[${this.serviceName}] Context limit: ${this.maxContextTokens}, max history tokens: ~${MAX_INPUT_TOKENS}`);

      // 发送前检查并裁剪对话历史
      this.trimHistoryIfNeeded(MAX_INPUT_TOKENS);

      let finalResponse = '';
      let usage: TokenUsage | undefined;

      // 单次 API 调用（无工具循环）
      for await (const chunk of this.callAPIStream(this.conversationHistory)) {
        if (chunk.type === 'content' && chunk.content) {
          finalResponse += chunk.content;
          yield chunk;
        } else if (chunk.type === 'usage' && chunk.usage) {
          usage = chunk.usage;
        } else if (chunk.type === 'error') {
          yield chunk;
          return;
        }
      }

      // 将最终回复加入历史
      if (finalResponse) {
        this.conversationHistory.push({ role: 'assistant', content: finalResponse });
      }

      // 处理 usage
      if (!usage) {
        const promptTokens = estimateMessagesTokens(this.conversationHistory.slice(0, -1));
        const completionTokens = estimateTokens(finalResponse);
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

      yield { type: 'done' };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 自动裁剪对话历史，确保总 token 不超过限制
   * 
   * 保留策略：
   * - system 消息永远保留（第一条）
   * - 最近的用户消息永远保留（最后几条）
   * - 从最早的非 system 消息开始移除，直到 token 降到阈值以下
   */
  protected trimHistoryIfNeeded(maxTokens: number): void {
    const currentTokens = estimateMessagesTokens(this.conversationHistory);
    
    if (currentTokens <= maxTokens) {
      return; // 不需要裁剪
    }

    console.log(`[${this.serviceName}] History too long: ~${currentTokens} tokens (limit: ${maxTokens}). Trimming...`);

    // 保留 system 消息（index 0）和最近的几条消息
    const systemMsg = this.conversationHistory[0]; // system 消息
    const remaining = this.conversationHistory.slice(1); // 其余消息

    // 从前面开始逐步移除，每次移除 2 条（一轮 user + assistant）
    while (remaining.length > 2) { // 至少保留最近一轮对话
      const newHistory = [systemMsg, ...remaining];
      const newTokens = estimateMessagesTokens(newHistory);
      
      if (newTokens <= maxTokens) {
        break;
      }

      // 移除最早的消息
      const removed = remaining.shift()!;
      
      // 如果移除的是 user 消息，对应的 assistant 回复也应该移除
      if (removed.role === 'user' && remaining.length > 0 && (remaining[0] as ChatMessage).role === 'assistant') {
        remaining.shift();
      }
    }

    this.conversationHistory = [systemMsg, ...remaining];
    let finalTokens = estimateMessagesTokens(this.conversationHistory);
    console.log(`[${this.serviceName}] Trimmed history to ~${finalTokens} tokens (${this.conversationHistory.length} messages)`);

    // 最后手段：如果 system prompt 本身太大，截断它
    if (finalTokens > maxTokens && this.conversationHistory[0]?.role === 'system') {
      const sysContent = this.conversationHistory[0].content;
      if (sysContent && sysContent.length > 5000) {
        const originalLen = sysContent.length;
        this.conversationHistory[0].content = sysContent.substring(0, 4000) + '\n\n[系统提示已截断以控制 token 总量]';
        finalTokens = estimateMessagesTokens(this.conversationHistory);
        console.log(`[${this.serviceName}] System prompt truncated: ${originalLen} -> ${this.conversationHistory[0].content.length} chars. Tokens: ~${finalTokens}`);
      }
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
