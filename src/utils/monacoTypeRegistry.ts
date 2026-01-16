/**
 * Monaco Editor 全局类型注册服务
 * 用于在应用初始化时注入自定义函数库，所有 CodeEditor 实例共享
 */
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { EAtomType, type ClassMetadata, type FieldMeta, type BaseClassType } from '../types/MetaDefine'

// 配置 Monaco Editor 的 worker（必须在使用前配置）
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    return new editorWorker()
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const typescriptDefaults = (monaco.languages as any).typescript?.typescriptDefaults
const ScriptTarget = (monaco.languages as any).typescript?.ScriptTarget
const ModuleResolutionKind = (monaco.languages as any).typescript?.ModuleResolutionKind
const ModuleKind = (monaco.languages as any).typescript?.ModuleKind

// AtomType 到 TypeScript 返回类型的映射
const ATOM_TYPE_MAP: Record<number, string> = {
  [EAtomType.Unknown]: 'unknown',
  [EAtomType.Any]: 'any',
  [EAtomType.LiteralString]: 'string',
  [EAtomType.LiteralNumber]: 'number',
  [EAtomType.LiteralBoolean]: 'boolean',
  [EAtomType.Number]: 'number',
  [EAtomType.Boolean]: 'boolean',
  [EAtomType.Action]: 'void',
  [EAtomType.Actor]: 'Actor',
  [EAtomType.Event]: 'void',
  [EAtomType.Task]: 'Promise<void>'
}

// BaseClassType 到 TypeScript 类型的映射
const BASE_CLASS_TYPE_MAP: Record<BaseClassType, string> = {
  'string': 'string',
  'number': 'number',
  'boolean': 'boolean',
  'NumberValueDelegate': 'NumberValueDelegate',
  'BoolValueDelegate': 'BoolValueDelegate',
  'ActorValueDelegate': 'ActorValueDelegate',
  'EventDelegateEx': 'EventDelegateEx',
  'ActionDelegate': 'ActionDelegate',
  'TaskDelegate': 'TaskDelegate'
}

class MonacoTypeRegistry {
  private static instance: MonacoTypeRegistry
  private initialized = false
  private disposables: monaco.IDisposable[] = []
  private atomMetadata: ClassMetadata[] | null = null
  private completionProviderDisposable: monaco.IDisposable | null = null

  private constructor() {}

  static getInstance(): MonacoTypeRegistry {
    if (!MonacoTypeRegistry.instance) {
      MonacoTypeRegistry.instance = new MonacoTypeRegistry()
    }
    return MonacoTypeRegistry.instance
  }

  /**
   * 从 FieldMeta 生成 TypeScript 类型字符串
   */
  private fieldMetaToTypeString(field: FieldMeta): string {
    const types = Array.isArray(field.type) ? field.type : [field.type]
    
    const typeStrings = types.map(t => {
      if (t === 'object' && field.baseClass) {
        return BASE_CLASS_TYPE_MAP[field.baseClass] || field.baseClass
      }
      if (t === 'select' && field.options) {
        // 枚举类型，生成联合类型
        return field.options.map(opt => 
          typeof opt.value === 'string' ? `'${opt.value}'` : String(opt.value)
        ).join(' | ')
      }
      if (t === 'array' && field.elementType) {
        const elemType = field.elementType.baseClass 
          ? (BASE_CLASS_TYPE_MAP[field.elementType.baseClass] || field.elementType.baseClass)
          : 'unknown'
        return `${elemType}[]`
      }
      // 基本类型映射
      switch (t) {
        case 'string': return 'string'
        case 'number': return 'number'
        case 'boolean': return 'boolean'
        case 'object': return 'object'
        case 'array': return 'unknown[]'
        default: return 'unknown'
      }
    })

    return typeStrings.length > 1 ? typeStrings.join(' | ') : typeStrings[0]
  }

  /**
   * 从 baseClass 获取返回类型
   */
  private getReturnTypeFromBaseClass(baseClass: BaseClassType): string {
    switch (baseClass) {
      case 'NumberValueDelegate': return 'number'
      case 'BoolValueDelegate': return 'boolean'
      case 'ActorValueDelegate': return 'Actor'
      case 'ActionDelegate': return 'void'
      case 'EventDelegateEx': return 'void'
      case 'TaskDelegate': return 'Promise<void>'
      case 'string': return 'string'
      case 'number': return 'number'
      case 'boolean': return 'boolean'
      default: return 'unknown'
    }
  }

  /**
   * 初始化类型注册表（使用 ClassMetadata[]）
   */
  async initializeWithAtomMetadata(atomMetadata: ClassMetadata[]): Promise<void> {
    if (this.initialized) {
      console.warn('[MonacoTypeRegistry] Already initialized, skipping...')
      return
    }

    this.atomMetadata = atomMetadata

    // 配置 TypeScript 编译选项
    typescriptDefaults?.setCompilerOptions({
      target: ScriptTarget?.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: ModuleResolutionKind?.NodeJs,
      module: ModuleKind?.ESNext,
      noEmit: true,
      esModuleInterop: true,
      strict: false,
      skipLibCheck: true,
      lib: ['esnext'],
      noImplicitAny: false
    })

    // 生成并注入类型定义
    const typeDefinitions = this.generateTypeDefinitionsFromMetadata()
    const disposable = typescriptDefaults?.addExtraLib(
      typeDefinitions,
      'ts:atom-global.d.ts'
    )
    this.disposables.push(disposable)

    // 注册自定义补全提供器
    this.registerCompletionProviderFromMetadata()

    this.initialized = true
    console.log('[MonacoTypeRegistry] Initialized with', atomMetadata.length, 'atoms from ClassMetadata')
  }

  /**
   * 注册自定义补全提供器（使用 ClassMetadata[]）
   */
  private registerCompletionProviderFromMetadata(): void {
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose()
    }

    this.completionProviderDisposable = monaco.languages.registerCompletionItemProvider('typescript', {
      triggerCharacters: ['.', '('],
      provideCompletionItems: (model, position) => {
        if (!this.atomMetadata) {
          return { suggestions: [] }
        }

        const wordInfo = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn
        }

        const suggestions: monaco.languages.CompletionItem[] = []

        this.atomMetadata.forEach(meta => {
          // 跳过测试函数
          if (meta.funcName.startsWith('__')) return

          const description = meta.description || meta.displayName || meta.className
          const fields = meta.fields || []
          const hasParams = fields.length > 0

          // 构建插入文本
          let insertText: string
          let insertTextRules: monaco.languages.CompletionItemInsertTextRule | undefined

          if (hasParams) {
            const paramSnippets = fields.map((field, index) => {
              if (field.isOptional) {
                return `\${${index + 1}:/* ${field.label}? */}`
              }
              return `\${${index + 1}:${field.label}}`
            }).join(', ')
            insertText = `${meta.funcName}(${paramSnippets})`
            insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          } else {
            insertText = `${meta.funcName}()`
          }

          // 生成参数签名
          const paramSignature = fields.map(field => {
            const optional = field.isOptional ? '?' : ''
            const typeStr = this.fieldMetaToTypeString(field)
            return `${field.label}${optional}: ${typeStr}`
          }).join(', ')

          // 获取返回类型
          const returnType = this.getReturnTypeFromBaseClass(meta.baseClass)

          suggestions.push({
            label: {
              label: meta.funcName,
              detail: `(${paramSignature})`,
              description: `: ${returnType}`
            },
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: insertText,
            insertTextRules: insertTextRules,
            range: range,
            detail: `${meta.funcName}(${paramSignature}): ${returnType}`,
            documentation: {
              value: `**${description}**\n\n${meta.richDescription || ''}`
            },
            sortText: `0_${meta.funcName}`,
            filterText: meta.funcName
          })
        })

        return { suggestions }
      }
    })

    if (this.completionProviderDisposable) {
      this.disposables.push(this.completionProviderDisposable)
    }
  }

  /**
   * 从 ClassMetadata[] 生成 TypeScript 类型定义
   */
  private generateTypeDefinitionsFromMetadata(): string {
    const lines: string[] = []
    
    lines.push('// ============================================')
    lines.push('// Auto-generated Atom Script Type Definitions')
    lines.push('// (Generated from ClassMetadata)')
    lines.push('// ============================================')
    lines.push('')

    // 1. 生成基础类型声明
    lines.push('// Base Types')
    lines.push('/** Actor 类型 - 表示游戏中的角色/实体 */')
    lines.push('declare type Actor = unknown;')
    lines.push('')
    
    // Delegate 类型
    lines.push('// Delegate Types (for parameter types)')
    const delegateTypes = [
      { name: 'NumberValueDelegate', desc: '数值委托类型' },
      { name: 'BoolValueDelegate', desc: '布尔委托类型' },
      { name: 'StringValueDelegate', desc: '字符串委托类型' },
      { name: 'ActorValueDelegate', desc: 'Actor委托类型' },
      { name: 'EventDelegateEx', desc: '事件委托类型' },
      { name: 'ActionDelegate', desc: '动作委托类型' },
      { name: 'TaskDelegate', desc: '任务委托类型' }
    ]
    delegateTypes.forEach(({ name, desc }) => {
      lines.push(`/** ${desc} */`)
      lines.push(`declare type ${name} = unknown;`)
    })
    lines.push('')

    // 2. 收集所有使用到的自定义类型
    const customTypes = new Set<string>()
    const builtinTypes = new Set(['NumberValueDelegate', 'BoolValueDelegate', 'StringValueDelegate', 
                          'ActorValueDelegate', 'EventDelegateEx', 'ActionDelegate', 'TaskDelegate', 'Actor',
                          'string', 'number', 'boolean', 'unknown', 'void', 'object'])
    
    if (this.atomMetadata) {
      // 从 className 收集类型
      this.atomMetadata.forEach(meta => {
        if (!builtinTypes.has(meta.className)) {
          customTypes.add(meta.className)
        }
      })
    }

    // 3. 生成自定义类型声明
    if (customTypes.size > 0) {
      lines.push('// Custom Atom Types')
      this.atomMetadata?.forEach(meta => {
        if (customTypes.has(meta.className)) {
          const desc = meta.description || meta.displayName || meta.className
          lines.push(`/** ${desc} */`)
          if (meta.richDescription) {
            lines.push(`/** @remarks ${meta.richDescription} */`)
          }
          lines.push(`declare type ${meta.className} = ${meta.baseClass || 'unknown'};`)
        }
      })
      lines.push('')
    }

    // 4. 生成函数声明
    if (this.atomMetadata) {
      lines.push('// Function Declarations')
      lines.push('')

      this.atomMetadata.forEach(meta => {
        // 跳过测试函数
        if (meta.funcName.startsWith('__')) return

        const description = meta.description || meta.displayName || meta.className
        const richDescription = meta.richDescription
        const fields = meta.fields || []

        // 生成参数列表
        const params = fields.map(field => {
          const optional = field.isOptional ? '?' : ''
          const rest = field.isRest ? '...' : ''
          let type = this.fieldMetaToTypeString(field)
          
          // 处理 rest 参数的类型
          if (field.isRest && !type.endsWith('[]')) {
            type = `${type}[]`
          }
          
          return `${rest}${field.label}${optional}: ${type}`
        }).join(', ')

        // 获取返回类型
        const returnType = this.getReturnTypeFromBaseClass(meta.baseClass)

        // 生成 JSDoc
        lines.push('/**')
        lines.push(` * ${description}`)
        if (richDescription) {
          lines.push(` * @remarks ${richDescription}`)
        }
        fields.forEach(field => {
          const typeStr = this.fieldMetaToTypeString(field)
          const fieldDesc = field.description || typeStr
          lines.push(` * @param ${field.label} - ${fieldDesc}`)
        })
        lines.push(` * @returns ${returnType}`)
        lines.push(' */')
        lines.push(`declare function ${meta.funcName}(${params}): ${returnType};`)
        lines.push('')
      })
    }

    return lines.join('\n')
  }

  /**
   * 添加额外的类型定义
   */
  addExtraLib(content: string, filePath?: string): monaco.IDisposable | undefined {
    const disposable = typescriptDefaults?.addExtraLib(
      content,
      filePath || `ts:extra-lib-${Date.now()}.d.ts`
    )
    if (disposable) {
      this.disposables.push(disposable)
    }
    return disposable
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 获取已注册的函数数量
   */
  getFunctionCount(): number {
    return this.atomMetadata ? this.atomMetadata.length : 0
  }

  /**
   * 获取生成的类型定义（用于调试）
   */
  getGeneratedTypes(): string {
    return this.generateTypeDefinitionsFromMetadata()
  }

  /**
   * 清理所有注册的类型
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose())
    this.disposables = []
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose()
      this.completionProviderDisposable = null
    }
    this.initialized = false
    this.atomMetadata = null
  }
}

// 导出单例
export const monacoTypeRegistry = MonacoTypeRegistry.getInstance()

// 声明全局 bridge 类型
declare global {
  interface Window {
    monacoBridge?: {
      getTypeMetadata: () => Promise<{
        ok: boolean;
        atomMetadata?: ClassMetadata[];
        error?: string;
      }>;
    };
    delegateBridge?: {
      onMetadataLoaded: (callback: () => void) => () => void;
    };
  }
}

// 便捷初始化函数
// 从主进程获取 cachedAtomMetadata，等待 delegate:get-metadata 完成后再初始化
export async function initializeMonacoTypes(): Promise<void> {
  try {
    // 检查是否在 Electron 环境中
    if (!window.monacoBridge) {
      console.warn('[MonacoTypeRegistry] monacoBridge not available, skipping initialization')
      return
    }

    // 从主进程获取类型元数据（直接使用 cachedAtomMetadata）
    const result = await window.monacoBridge.getTypeMetadata()
    
    if (!result.ok || !result.atomMetadata) {
      console.error('[MonacoTypeRegistry] Failed to get type metadata:', result.error)
      return
    }

    console.log('[MonacoTypeRegistry] Received atomMetadata:', result.atomMetadata.length, 'entries')

    await monacoTypeRegistry.initializeWithAtomMetadata(result.atomMetadata)
  } catch (error) {
    console.error('[MonacoTypeRegistry] Failed to initialize:', error)
  }
}
