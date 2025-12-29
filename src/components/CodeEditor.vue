<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import * as monaco from 'monaco-editor'

// Worker 已在 monacoTypeRegistry.ts 中全局配置

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const typescriptDefaults = (monaco.languages as any).typescript?.typescriptDefaults

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    theme?: 'vs' | 'vs-dark' | 'hc-black'
    readonly?: boolean
    placeholder?: string
    // 额外的类型定义（可选，全局类型已在 main.ts 中初始化）
    extraLibs?: Array<{ content: string; filePath?: string }>
    // 弹窗编辑器配置
    modalTitle?: string
    modalWidth?: string
    modalHeight?: string
  }>(),
  {
    language: 'typescript',
    theme: 'vs-dark',
    readonly: false,
    placeholder: '// 点击编辑代码...',
    modalTitle: '代码编辑器',
    modalWidth: '80vw',
    modalHeight: '70vh'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
  'editor-mounted': [editor: monaco.editor.IStandaloneCodeEditor]
}>()

// 状态
const isModalOpen = ref(false)
const editorContainerRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLElement | null>(null)
const tooltipRef = ref<HTMLElement | null>(null)
const showTooltip = ref(false)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let extraLibDisposables: monaco.IDisposable[] = []

// 临时编辑值（用于取消时恢复）
const tempValue = ref('')

// 显示的预览文本
const displayText = computed(() => {
  const text = props.modelValue?.trim()
  if (!text) return props.placeholder
  // 显示第一行或截断
  const firstLine = text.split('\n')[0]
  return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine
})

// 完整代码用于 tooltip
const fullCodePreview = computed(() => {
  const text = props.modelValue?.trim()
  if (!text) return ''
  // 限制显示行数
  const lines = text.split('\n')
  if (lines.length > 15) {
    return lines.slice(0, 15).join('\n') + '\n...'
  }
  return text
})

// Tooltip 位置计算
const tooltipStyle = ref<Record<string, string>>({})

function updateTooltipPosition() {
  if (!inputRef.value || !tooltipRef.value) return
  
  const inputRect = inputRef.value.getBoundingClientRect()
  const tooltipRect = tooltipRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  
  let left = inputRect.left
  let top = inputRect.bottom + 4
  
  // 检查右边界
  if (left + tooltipRect.width > viewportWidth - 10) {
    left = viewportWidth - tooltipRect.width - 10
  }
  
  // 检查左边界
  if (left < 10) {
    left = 10
  }
  
  // 检查下边界，如果超出则显示在上方
  if (top + tooltipRect.height > viewportHeight - 10) {
    top = inputRect.top - tooltipRect.height - 4
  }
  
  // 检查上边界
  if (top < 10) {
    top = 10
  }
  
  tooltipStyle.value = {
    left: `${left}px`,
    top: `${top}px`
  }
}

function handleMouseEnter() {
  if (props.modelValue?.trim() && !isModalOpen.value) {
    showTooltip.value = true
    nextTick(() => {
      updateTooltipPosition()
    })
  }
}

function handleMouseLeave() {
  showTooltip.value = false
}

function handleMouseMove() {
  if (showTooltip.value) {
    updateTooltipPosition()
  }
}

/**
 * 添加额外的类型库（实例级别）
 */
function addExtraLibraries() {
  extraLibDisposables.forEach(d => d.dispose())
  extraLibDisposables = []
  
  if (props.extraLibs) {
    props.extraLibs.forEach((lib, index) => {
      const disposable = typescriptDefaults?.addExtraLib(
        lib.content,
        lib.filePath || `ts:extra-lib-${Date.now()}-${index}.d.ts`
      )
      if (disposable) {
        extraLibDisposables.push(disposable)
      }
    })
  }
}

function initEditor() {
  if (!editorContainerRef.value || editor) return
  
  addExtraLibraries()

  editor = monaco.editor.create(editorContainerRef.value, {
    value: tempValue.value,
    language: props.language,
    theme: props.theme,
    readOnly: props.readonly,
    automaticLayout: true,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'on',
    tabSize: 2,
    wordWrap: 'on',
    folding: true,
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 3,
    renderLineHighlight: 'line',
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto',
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10
    },
    padding: {
      top: 12,
      bottom: 12
    }
  })

  editor.onDidChangeModelContent(() => {
    tempValue.value = editor?.getValue() || ''
  })

  emit('editor-mounted', editor)
  
  // 聚焦编辑器
  editor.focus()
}

function disposeEditor() {
  if (editor) {
    editor.dispose()
    editor = null
  }
}

function openModal() {
  if (props.readonly) return
  tempValue.value = props.modelValue || ''
  isModalOpen.value = true
  showTooltip.value = false
  
  nextTick(() => {
    initEditor()
  })
}

function closeModal() {
  isModalOpen.value = false
  disposeEditor()
}

function confirmEdit() {
  emit('update:modelValue', tempValue.value)
  emit('change', tempValue.value)
  closeModal()
}

function cancelEdit() {
  closeModal()
}

// 键盘快捷键
function handleKeydown(e: KeyboardEvent) {
  if (!isModalOpen.value) return
  
  // Ctrl+Enter 确认
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    confirmEdit()
  }
  // Escape 取消
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
  }
}

// 暴露方法给父组件
defineExpose({
  getValue: () => props.modelValue,
  setValue: (value: string) => {
    emit('update:modelValue', value)
  },
  openEditor: openModal,
  closeEditor: closeModal
})

watch(
  () => props.extraLibs,
  () => {
    if (editor) {
      addExtraLibraries()
    }
  },
  { deep: true }
)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateTooltipPosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateTooltipPosition)
  extraLibDisposables.forEach(d => d.dispose())
  extraLibDisposables = []
  disposeEditor()
})
</script>

<template>
  <!-- 输入框预览 -->
  <div 
    ref="inputRef"
    class="code-input-preview"
    :class="{ 'readonly': readonly, 'has-content': modelValue?.trim() }"
    @click="openModal"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @mousemove="handleMouseMove"
  >
    <div class="preview-content">
      <svg class="code-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
      <span class="preview-text">{{ displayText }}</span>
    </div>
    <svg v-if="!readonly" class="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  </div>

  <!-- Tooltip 预览 -->
  <Teleport to="body">
    <div 
      v-if="showTooltip && fullCodePreview"
      ref="tooltipRef"
      class="code-tooltip"
      :style="tooltipStyle"
    >
      <pre class="tooltip-code">{{ fullCodePreview }}</pre>
    </div>
  </Teleport>

  <!-- 弹窗编辑器 -->
  <Teleport to="body">
    <div v-if="isModalOpen" class="modal-overlay" @click.self="cancelEdit">
      <div 
        class="modal-container"
        :style="{ width: modalWidth, height: modalHeight }"
      >
        <!-- 标题栏 -->
        <div class="modal-header">
          <h3 class="modal-title">
            <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            {{ modalTitle }}
          </h3>
          <div class="modal-actions">
            <span class="shortcut-hint">Ctrl+Enter 确认 | Esc 取消</span>
            <button class="btn-cancel" @click="cancelEdit">取消</button>
            <button class="btn-confirm" @click="confirmEdit">确认</button>
          </div>
        </div>
        
        <!-- 编辑器容器 -->
        <div ref="editorContainerRef" class="editor-container"></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 输入框预览样式 */
.code-input-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--fallback-b1, oklch(var(--b1)));
  border: 1px solid var(--fallback-bc, oklch(var(--bc) / 0.2));
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 40px;
}

.code-input-preview:hover:not(.readonly) {
  border-color: var(--fallback-p, oklch(var(--p)));
  background: var(--fallback-b2, oklch(var(--b2)));
}

.code-input-preview.readonly {
  cursor: default;
  opacity: 0.7;
}

.code-input-preview.has-content {
  background: var(--fallback-b2, oklch(var(--b2)));
}

.preview-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.code-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.5;
}

.preview-text {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  color: var(--fallback-bc, oklch(var(--bc) / 0.8));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.2s;
}

.code-input-preview:hover .edit-icon {
  opacity: 0.8;
}

/* Tooltip 样式 */
.code-tooltip {
  position: fixed;
  z-index: 10000;
  max-width: 500px;
  max-height: 400px;
  background: var(--fallback-n, oklch(var(--n)));
  border: 1px solid var(--fallback-nc, oklch(var(--nc) / 0.3));
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: tooltip-fade-in 0.15s ease;
}

@keyframes tooltip-fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tooltip-code {
  margin: 0;
  padding: 12px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--fallback-nc, oklch(var(--nc)));
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  max-height: 380px;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  animation: overlay-fade-in 0.2s ease;
}

@keyframes overlay-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-container {
  display: flex;
  flex-direction: column;
  background: var(--fallback-b1, oklch(var(--b1)));
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: modal-scale-in 0.2s ease;
}

@keyframes modal-scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--fallback-b2, oklch(var(--b2)));
  border-bottom: 1px solid var(--fallback-bc, oklch(var(--bc) / 0.1));
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fallback-bc, oklch(var(--bc)));
}

.title-icon {
  width: 20px;
  height: 20px;
}

.modal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.shortcut-hint {
  font-size: 12px;
  color: var(--fallback-bc, oklch(var(--bc) / 0.5));
}

.btn-cancel,
.btn-confirm {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel {
  background: var(--fallback-b3, oklch(var(--b3)));
  color: var(--fallback-bc, oklch(var(--bc)));
}

.btn-cancel:hover {
  background: var(--fallback-bc, oklch(var(--bc) / 0.2));
}

.btn-confirm {
  background: var(--fallback-p, oklch(var(--p)));
  color: var(--fallback-pc, oklch(var(--pc)));
}

.btn-confirm:hover {
  filter: brightness(1.1);
}

.editor-container {
  flex: 1;
  min-height: 0;
}
</style>
