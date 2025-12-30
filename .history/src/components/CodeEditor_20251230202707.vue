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
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let extraLibDisposables: monaco.IDisposable[] = []

// 临时编辑值（用于取消时恢复）
const tempValue = ref('')

// 显示的代码（直接显示所有内容，没有截断）
const displayCode = computed(() => {
  const text = props.modelValue?.trim()
  if (!text) return props.placeholder
  return text
})

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
  
  nextTick(() => {
    initEditor()
  })
}

function closeModal() {
  // 自动保存编辑内容
  emit('update:modelValue', tempValue.value)
  emit('change', tempValue.value)
  isModalOpen.value = false
  disposeEditor()
}

// 防止误触：记录鼠标按下位置
const mouseDownOnOverlay = ref(false)

function handleOverlayMouseDown(e: MouseEvent) {
  // 只有直接点击 overlay 才记录
  if (e.target === e.currentTarget) {
    mouseDownOnOverlay.value = true
  }
}

function handleOverlayMouseUp(e: MouseEvent) {
  // 只有按下和抬起都在 overlay 上才关闭
  if (mouseDownOnOverlay.value && e.target === e.currentTarget) {
    closeModal()
  }
  mouseDownOnOverlay.value = false
}

// 键盘快捷键
function handleKeydown(e: KeyboardEvent) {
  if (!isModalOpen.value) return
  
  // Escape 关闭
  if (e.key === 'Escape') {
    e.preventDefault()
    closeModal()
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
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  extraLibDisposables.forEach(d => d.dispose())
  extraLibDisposables = []
  disposeEditor()
})
</script>

<template>
  <!-- 代码编辑控件 - 直接显示代码 -->
  <div 
    class="code-editor-control"
    :class="{ 'readonly': readonly, 'has-content': modelValue?.trim() }"
    @click="openModal"
  >
    <div class="editor-header">
      <svg class="code-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
      <span class="editor-label">TypeScript 代码编辑控件</span>
      <svg v-if="!readonly" class="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    </div>
    <pre class="editor-code">{{ displayCode }}</pre>
  </div>

  <!-- 弹窗编辑器 -->
  <Teleport to="body">
    <div v-if="isModalOpen" class="modal-overlay" @click.self="closeModal">
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
            <button class="btn-close" @click="closeModal">关闭</button>
          </div>
        </div>
        
        <!-- 编辑器容器 -->
        <div ref="editorContainerRef" class="editor-container"></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 代码编辑控件样式 */
.code-editor-control {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--fallback-b1, oklch(var(--b1)));
  border: 1px solid var(--fallback-bc, oklch(var(--bc) / 0.2));
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 100px;
  max-height: 400px;
  overflow: hidden;
}

.code-editor-control:hover:not(.readonly) {
  border-color: var(--fallback-p, oklch(var(--p)));
  background: var(--fallback-b2, oklch(var(--b2)));
}

.code-editor-control.readonly {
  cursor: default;
  opacity: 0.7;
}

.code-editor-control.has-content {
  background: var(--fallback-b2, oklch(var(--b2)));
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--fallback-b1, oklch(var(--b1)));
  border-bottom: 1px solid var(--fallback-bc, oklch(var(--bc) / 0.1));
  flex-shrink: 0;
}

.code-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.5;
}

.editor-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--fallback-bc, oklch(var(--bc) / 0.6));
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}

.edit-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.2s;
}

.code-editor-control:hover .edit-icon {
  opacity: 0.8;
}

.editor-code {
  flex: 1;
  margin: 0;
  padding: 12px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--fallback-bc, oklch(var(--bc)));
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
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

.btn-close {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--fallback-p, oklch(var(--p)));
  color: var(--fallback-pc, oklch(var(--pc)));
}

.btn-close:hover {
  filter: brightness(1.1);
}

.editor-container {
  flex: 1;
  min-height: 0;
}
</style>
