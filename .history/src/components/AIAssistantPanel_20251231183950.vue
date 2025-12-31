<script setup lang="ts">
/**
 * AI 助手面板组件
 * 提供原子配置推荐问答功能
 */

import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { marked } from 'marked';
import type { ClassMetadata } from '../types/MetaDefine';

// 配置 marked 选项
marked.setOptions({
  breaks: true,  // 支持换行
  gfm: true      // 支持 GitHub 风格 Markdown
});

// ============ Props & Emits ============

interface Props {
  /** 是否显示面板 */
  visible: boolean;
  /** 当前选中的原子元数据 */
  currentAtom?: ClassMetadata | null;
  /** 所有可用的原子元数据 */
  allAtomMetadata?: ClassMetadata[];
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  currentAtom: null,
  allAtomMetadata: () => []
});

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'apply-suggestion', suggestion: string): void;
}>();

// ============ 类型定义 ============

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// ============ 响应式状态 ============

const messages = ref<ChatMessage[]>([]);
const inputMessage = ref('');
const isLoading = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const isConfigured = ref(false);
const showSettings = ref(false);
const hasBuiltinConfig = ref(false);

// 面板宽度相关
const panelWidth = ref(Math.floor(window.innerWidth / 3)); // 默认三分之一宽度
const minPanelWidth = 320;  // 最小宽度
const isResizing = ref(false);
const resizeHandleRef = ref<HTMLElement | null>(null);

// API 配置
const currentModel = ref<'deepseek' | 'hunyuan'>('deepseek');
const availableModels = ref<string[]>(['deepseek', 'hunyuan']);
const modelLabels: Record<string, string> = {
  deepseek: 'DeepSeek v3.2（免费）',
  hunyuan: '腾讯混元 Thinking'
};

// 流式输出控制
let currentStreamUnsubscribe: (() => void) | null = null;

// 快捷问题
const quickQuestions = [
  '这个原子有什么用途？',
  '请推荐适合的参数配置',
  '如何实现条件判断？',
  '帮我优化当前配置'
];

// ============ 计算属性 ============

const currentAtomInfo = computed(() => {
  if (!props.currentAtom) return null;
  return {
    name: props.currentAtom.displayName || props.currentAtom.className,
    funcName: props.currentAtom.funcName,
    description: props.currentAtom.description,
    category: props.currentAtom.category,
    fields: props.currentAtom.fields?.map(f => ({
      name: f.label || f.key,
      type: Array.isArray(f.type) ? f.type.join(' | ') : f.type,
      description: f.description
    }))
  };
});

const hasMessages = computed(() => messages.value.length > 0);

// ============ 方法 ============

/** 生成唯一 ID */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 滚动到底部 */
async function scrollToBottom() {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

/** 渲染 Markdown 为 HTML */
function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    return marked(content) as string;
  } catch {
    return content;
  }
}

/** 发送消息（使用流式输出） */
async function sendMessage(content?: string) {
  const messageContent = content || inputMessage.value.trim();
  if (!messageContent || isLoading.value) return;

  // 检查是否已配置
  if (!isConfigured.value) {
    showSettings.value = true;
    return;
  }

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: generateId(),
    role: 'user',
    content: messageContent,
    timestamp: new Date()
  };
  messages.value.push(userMessage);
  inputMessage.value = '';
  
  await scrollToBottom();

  // 添加 AI 消息占位
  const assistantMessage: ChatMessage = {
    id: generateId(),
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    isStreaming: true
  };
  messages.value.push(assistantMessage);
  
  // 获取消息在数组中的索引，用于响应式更新
  const messageIndex = messages.value.length - 1;

  isLoading.value = true;

  try {
    // 使用流式聊天 API
    const streamHandle = window.aiBridge?.chatStream({
      message: messageContent,
      currentAtom: props.currentAtom || undefined
    });

    if (!streamHandle) {
      messages.value[messageIndex] = { ...messages.value[messageIndex], content: '错误: AI 服务不可用', isStreaming: false };
      isLoading.value = false;
      return;
    }

    // 监听流式数据
    const unsubscribe = streamHandle.onChunk((chunk) => {
      if (chunk.type === 'content' && chunk.content) {
        // 通过索引更新，确保触发 Vue 响应式
        const currentMsg = messages.value[messageIndex];
        messages.value[messageIndex] = { 
          ...currentMsg, 
          content: currentMsg.content + chunk.content 
        };
        // 滚动到底部
        scrollToBottom();
      } else if (chunk.type === 'error') {
        const currentMsg = messages.value[messageIndex];
        messages.value[messageIndex] = { 
          ...currentMsg, 
          content: currentMsg.content + `\n\n错误: ${chunk.error || '未知错误'}`,
          isStreaming: false 
        };
        isLoading.value = false;
        currentStreamUnsubscribe = null;
        unsubscribe?.();
      } else if (chunk.type === 'done') {
        const currentMsg = messages.value[messageIndex];
        messages.value[messageIndex] = { ...currentMsg, isStreaming: false };
        isLoading.value = false;
        currentStreamUnsubscribe = null;
        unsubscribe?.();
        scrollToBottom();
      }
    });
    
    // 保存取消订阅函数，用于停止输出
    currentStreamUnsubscribe = unsubscribe;
  } catch (error) {
    messages.value[messageIndex] = { 
      ...messages.value[messageIndex], 
      content: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
      isStreaming: false 
    };
    isLoading.value = false;
    await scrollToBottom();
  }
}

/** 清空对话 */
function clearChat() {
  messages.value = [];
  window.aiBridge?.clearHistory();
}

/** 停止 AI 输出 */
function stopGeneration() {
  if (currentStreamUnsubscribe) {
    currentStreamUnsubscribe();
    currentStreamUnsubscribe = null;
  }
  
  // 找到正在流式输出的消息，标记为完成
  const streamingMsgIndex = messages.value.findIndex(m => m.isStreaming);
  if (streamingMsgIndex !== -1) {
    messages.value[streamingMsgIndex] = {
      ...messages.value[streamingMsgIndex],
      isStreaming: false,
      content: messages.value[streamingMsgIndex].content + '\n\n[已停止]'
    };
  }
  
  isLoading.value = false;
}

/** 关闭面板 */
function closePanel() {
  emit('update:visible', false);
}

/** 切换模型 */
async function switchModel(modelType: string) {
  try {
    const result = await (window as any).aiBridge?.switchModel(modelType);
    if (result?.success) {
      currentModel.value = modelType as 'deepseek' | 'hunyuan';
      // 清空对话历史，因为切换了模型
      clearChat();
    }
  } catch (error) {
    console.error('切换模型失败:', error);
  }
}

/** 复制消息内容 */
function copyMessage(content: string) {
  navigator.clipboard.writeText(content);
}

/** 应用建议到编辑器 */
function applySuggestion(content: string) {
  emit('apply-suggestion', content);
}

/** 处理键盘事件 */
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

/** 自动调整输入框高度 */
function autoResize() {
  if (inputRef.value) {
    inputRef.value.style.height = 'auto';
    inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 120) + 'px';
  }
}

// ============ 拖拽调整宽度 ============

/** 开始拖拽 */
function startResize(e: MouseEvent) {
  e.preventDefault();
  isResizing.value = true;
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
}

/** 处理拖拽 */
function handleResize(e: MouseEvent) {
  if (!isResizing.value) return;
  
  const newWidth = window.innerWidth - e.clientX;
  panelWidth.value = Math.max(minPanelWidth, newWidth);
}

/** 停止拖拽 */
function stopResize() {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

/** 窗口大小变化时调整面板宽度 */
function handleWindowResize() {
  // 确保面板不超过窗口宽度
  if (panelWidth.value > window.innerWidth - 100) {
    panelWidth.value = window.innerWidth - 100;
  }
}

// ============ 生命周期 ============

onMounted(async () => {
  // 监听窗口大小变化
  window.addEventListener('resize', handleWindowResize);
  
  // 检查内置配置和服务状态
  const [builtinResult, status] = await Promise.all([
    (window as any).aiBridge?.getBuiltinConfig(),
    window.aiBridge?.getStatus()
  ]);
  
  hasBuiltinConfig.value = builtinResult?.hasBuiltinConfig || false;
  isConfigured.value = status?.configured || false;
  
  // 获取当前模型和可用模型列表
  if (builtinResult?.currentModel) {
    currentModel.value = builtinResult.currentModel;
  }
  if (builtinResult?.availableModels) {
    availableModels.value = builtinResult.availableModels;
  }
  
  // 如果有内置配置且已配置，初始化原子知识库
  if (isConfigured.value && props.allAtomMetadata && props.allAtomMetadata.length > 0) {
    await window.aiBridge?.initKnowledge(props.allAtomMetadata);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize);
  // 确保清理拖拽事件
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
});

// 监听原子变化，添加上下文提示
watch(() => props.currentAtom, (newAtom) => {
  if (newAtom && messages.value.length === 0) {
    // 可选：自动添加欢迎消息
  }
});
</script>

<template>
  <!-- AI 助手侧边面板 -->
  <div 
    class="fixed right-0 top-0 h-full z-50 transition-transform duration-300 ease-in-out"
    :class="visible ? 'translate-x-0' : 'translate-x-full'"
    :style="{ width: panelWidth + 'px' }"
  >
    <!-- 拖拽调整宽度的手柄 -->
    <div 
      ref="resizeHandleRef"
      class="resize-handle"
      :class="{ 'is-resizing': isResizing }"
      @mousedown="startResize"
    >
      <div class="resize-handle-line"></div>
    </div>
    
    <div class="h-full bg-base-200 shadow-xl flex flex-col border-l border-base-300">
      <!-- 头部 -->
      <div class="flex items-center justify-between px-4 py-3 bg-base-300 border-b border-base-content/10">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span class="font-semibold">AI 原子助手</span>
          <span 
            class="badge badge-xs"
            :class="isConfigured ? 'badge-success' : 'badge-warning'"
          >
            {{ isConfigured ? '已连接' : '未配置' }}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button 
            class="btn btn-ghost btn-sm btn-square"
            @click="showSettings = true"
            title="设置"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button 
            class="btn btn-ghost btn-sm btn-square"
            @click="clearChat"
            title="清空对话"
            :disabled="!hasMessages"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button 
            class="btn btn-ghost btn-sm btn-square"
            @click="closePanel"
            title="关闭"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 当前原子上下文 -->
      <div v-if="currentAtomInfo" class="px-4 py-2 bg-base-300/50 border-b border-base-content/10">
        <div class="text-xs text-base-content/60 mb-1">当前原子</div>
        <div class="flex items-center gap-2">
          <span class="badge badge-primary badge-sm">{{ currentAtomInfo.category }}</span>
          <span class="font-medium text-sm truncate">{{ currentAtomInfo.name }}</span>
        </div>
      </div>

      <!-- 消息列表 -->
      <div 
        ref="messagesContainer"
        class="flex-1 overflow-y-auto p-4 space-y-4"
      >
        <!-- 空状态 -->
        <div v-if="!hasMessages" class="h-full flex flex-col items-center justify-center text-base-content/50">
          <svg class="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p class="text-sm mb-4">有什么可以帮助你的？</p>
          
          <!-- 快捷问题 -->
          <div class="flex flex-wrap gap-2 justify-center px-4">
            <button 
              v-for="q in quickQuestions" 
              :key="q"
              class="btn btn-outline btn-xs"
              @click="sendMessage(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>

        <!-- 消息列表 -->
        <template v-else>
          <div 
            v-for="msg in messages" 
            :key="msg.id"
            class="chat"
            :class="msg.role === 'user' ? 'chat-end' : 'chat-start'"
          >
            <div class="chat-image avatar placeholder">
              <div 
                class="w-8 rounded-full"
                :class="msg.role === 'user' ? 'bg-primary text-primary-content' : 'bg-secondary text-secondary-content'"
              >
                <span class="text-xs">{{ msg.role === 'user' ? 'U' : 'AI' }}</span>
              </div>
            </div>
            <div 
              class="chat-bubble chat-bubble-dynamic"
              :class="msg.role === 'user' ? 'chat-bubble-primary' : 'chat-bubble-secondary'"
            >
              <!-- 用户消息：纯文本 -->
              <div v-if="msg.role === 'user'" class="whitespace-pre-wrap text-sm">{{ msg.content }}</div>
              <!-- AI 消息：渲染 Markdown -->
              <div 
                v-else 
                class="prose prose-sm prose-invert max-w-none ai-markdown"
                v-html="renderMarkdown(msg.content)"
              ></div>
              <div v-if="msg.isStreaming" class="flex items-center gap-1 mt-2">
                <span class="loading loading-dots loading-xs"></span>
              </div>
            </div>
            <div class="chat-footer opacity-50 text-xs mt-1">
              <button 
                v-if="msg.role === 'assistant' && !msg.isStreaming"
                class="link link-hover mr-2"
                @click="copyMessage(msg.content)"
              >
                复制
              </button>
              <span>{{ msg.timestamp.toLocaleTimeString() }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- 输入区域 -->
      <div class="p-4 border-t border-base-content/10 bg-base-300/30">
        <!-- 模型选择下拉框 -->
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-base-content/60">模型:</span>
          <select 
            class="select select-bordered select-xs flex-1"
            :value="currentModel"
            :disabled="isLoading"
            @change="switchModel(($event.target as HTMLSelectElement).value)"
          >
            <option 
              v-for="model in availableModels" 
              :key="model" 
              :value="model"
            >
              {{ modelLabels[model] || model }}
            </option>
          </select>
        </div>
        
        <!-- 输入框和发送/停止按钮 -->
        <div class="flex gap-2">
          <textarea
            ref="inputRef"
            v-model="inputMessage"
            class="textarea textarea-bordered flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
            placeholder="输入问题，按 Enter 发送..."
            rows="1"
            :disabled="isLoading"
            @keydown="handleKeydown"
            @input="autoResize"
          ></textarea>
          <!-- 发送按钮 / 停止按钮 -->
          <button 
            v-if="!isLoading"
            class="btn btn-primary btn-square"
            :disabled="!inputMessage.trim()"
            @click="sendMessage()"
            title="发送消息"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
          <button 
            v-else
            class="btn btn-error btn-square"
            @click="stopGeneration"
            title="停止生成"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 设置弹窗 -->
  <div v-if="showSettings" class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4">AI 模型设置</h3>
      
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">选择模型</span>
        </label>
        <select 
          class="select select-bordered w-full"
          :value="currentModel"
          @change="switchModel(($event.target as HTMLSelectElement).value)"
        >
          <option 
            v-for="model in availableModels" 
            :key="model" 
            :value="model"
          >
            {{ modelLabels[model] || model }}
          </option>
        </select>
        <label class="label">
          <span class="label-text-alt text-base-content/60">DeepSeek 免费使用，混元需要消耗配额</span>
        </label>
      </div>

      <div class="alert alert-info text-sm mb-4">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>切换模型会清空当前对话历史</span>
      </div>

      <div class="modal-action">
        <button class="btn" @click="showSettings = false">关闭</button>
      </div>
    </div>
    <div class="modal-backdrop" @click="showSettings = false"></div>
  </div>

  <!-- 遮罩层（点击关闭面板） -->
  <div 
    v-if="visible"
    class="fixed inset-0 bg-black/20 z-40"
    @click="closePanel"
  ></div>
</template>

<style scoped>
.chat-bubble {
  word-break: break-word;
}

.chat-bubble-dynamic {
  max-width: 85%;
}

/* 拖拽手柄样式 */
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resize-handle:hover,
.resize-handle.is-resizing {
  background: oklch(var(--p) / 0.1);
}

.resize-handle-line {
  width: 2px;
  height: 40px;
  background: oklch(var(--bc) / 0.2);
  border-radius: 1px;
  transition: background 0.2s;
}

.resize-handle:hover .resize-handle-line,
.resize-handle.is-resizing .resize-handle-line {
  background: oklch(var(--p) / 0.6);
  height: 60px;
}

/* 自定义滚动条 */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: oklch(var(--bc) / 0.2);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: oklch(var(--bc) / 0.3);
}

/* AI Markdown 样式 */
.ai-markdown {
  font-size: 0.875rem;
  line-height: 1.5;
}

.ai-markdown :deep(p) {
  margin: 0.5em 0;
}

.ai-markdown :deep(p:first-child) {
  margin-top: 0;
}

.ai-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.ai-markdown :deep(code) {
  background: oklch(var(--b3) / 0.5);
  padding: 0.125em 0.375em;
  border-radius: 0.25em;
  font-size: 0.85em;
  font-family: 'Consolas', 'Monaco', monospace;
}

.ai-markdown :deep(pre) {
  background: oklch(var(--b3) / 0.8);
  padding: 0.75em;
  border-radius: 0.5em;
  overflow-x: auto;
  margin: 0.5em 0;
}

.ai-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}

.ai-markdown :deep(ul),
.ai-markdown :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.ai-markdown :deep(li) {
  margin: 0.25em 0;
}

.ai-markdown :deep(strong) {
  font-weight: 600;
}

.ai-markdown :deep(h1),
.ai-markdown :deep(h2),
.ai-markdown :deep(h3),
.ai-markdown :deep(h4) {
  font-weight: 600;
  margin: 0.75em 0 0.5em;
}

.ai-markdown :deep(h1) { font-size: 1.25em; }
.ai-markdown :deep(h2) { font-size: 1.125em; }
.ai-markdown :deep(h3) { font-size: 1em; }

.ai-markdown :deep(blockquote) {
  border-left: 3px solid oklch(var(--p));
  padding-left: 0.75em;
  margin: 0.5em 0;
  opacity: 0.9;
}

.ai-markdown :deep(a) {
  color: oklch(var(--p));
  text-decoration: underline;
}

.ai-markdown :deep(hr) {
  border: none;
  border-top: 1px solid oklch(var(--bc) / 0.2);
  margin: 0.75em 0;
}

.ai-markdown :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}

.ai-markdown :deep(th),
.ai-markdown :deep(td) {
  border: 1px solid oklch(var(--bc) / 0.2);
  padding: 0.375em 0.5em;
  text-align: left;
}

.ai-markdown :deep(th) {
  background: oklch(var(--b3) / 0.5);
  font-weight: 600;
}
</style>
