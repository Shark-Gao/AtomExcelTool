/**
 * Monaco Editor 全局类型注册服务
 * 用于在应用初始化时注入自定义函数库，所有 CodeEditor 实例共享
 */
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { EAtomType } from '../types/MetaDefine'

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

// 元数据类型定义
export interface DecoratorMetaData {
  className: string
  isDelegate?: boolean
  fields?: Record<string, unknown>
  displayName?: string
  description?: string
  category?: string
  richDescription?: string
  author?: string
  baseClass?: string
}

export interface ParameterInfo {
  ParentAtomClassName: string
  OrdinalIndex: number
  bLastParameter: boolean
  bOptional: boolean
  bRest: boolean
  ParameterName: string
  AtomType: unknown
  TypeString: string
  TypeNodeText: string
}

export interface ScriptMetaData {
  FunctionName: string
  AtomClassName: string
  ParameterList: ParameterInfo[]
  AtomType: number
}

// AtomType 到 TypeScript 返回类型的映射
// 注意：这里映射的是函数的最终返回类型，而不是 Delegate 类型本身
const ATOM_TYPE_MAP: Record<number, string> = {
  [EAtomType.Unknown]: 'unknown',
  [EAtomType.Any]: 'any',
  [EAtomType.LiteralString]: 'string',
  [EAtomType.LiteralNumber]: 'number',
  [EAtomType.LiteralBoolean]: 'boolean',
  [EAtomType.Number]: 'number',       // NumberValueDelegate 最终返回 number
  [EAtomType.Boolean]: 'boolean',     // BoolValueDelegate 最终返回 boolean
  [EAtomType.Action]: 'void',         // ActionDelegate 返回 void
  [EAtomType.Actor]: 'Actor',         // ActorValueDelegate 返回 Actor
  [EAtomType.Event]: 'void',          // EventDelegateEx 返回 void
  [EAtomType.Task]: 'Promise<void>'   // TaskDelegate 返回 Promise
}

class MonacoTypeRegistry {
  private static instance: MonacoTypeRegistry
  private initialized = false
  private disposables: monaco.IDisposable[] = []
  private decoratorMetaData: Record<string, DecoratorMetaData> | null = null
  private scriptMetaData: Record<string, ScriptMetaData> | null = null
  private completionProviderDisposable: monaco.IDisposable | null = null

  private constructor() {}

  static getInstance(): MonacoTypeRegistry {
    if (!MonacoTypeRegistry.instance) {
      MonacoTypeRegistry.instance = new MonacoTypeRegistry()
    }
    return MonacoTypeRegistry.instance
  }

  /**
   * 初始化类型注册表
   * @param scriptMetaData AtomSystemScriptMetaData.json 的内容
   * @param decoratorMetaData AtomDecoratorMetaData.json 的内容（可选，用于补充描述）
   */
  async initialize(
    scriptMetaData: Record<string, ScriptMetaData>,
    decoratorMetaData?: Record<string, DecoratorMetaData>
  ): Promise<void> {
    if (this.initialized) {
      console.warn('[MonacoTypeRegistry] Already initialized, skipping...')
      return
    }

    this.scriptMetaData = scriptMetaData
    this.decoratorMetaData = decoratorMetaData || null

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
    const typeDefinitions = this.generateTypeDefinitions()
    const disposable = typescriptDefaults?.addExtraLib(
      typeDefinitions,
      'ts:atom-global.d.ts'
    )
    this.disposables.push(disposable)

    // 注册自定义补全提供器（支持自动补全括号）
    this.registerCompletionProvider()

    this.initialized = true
    console.log('[MonacoTypeRegistry] Initialized with', Object.keys(scriptMetaData).length, 'functions')
  }

  /**
   * 注册自定义补全提供器，实现函数自动补全括号
   */
  private registerCompletionProvider(): void {
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose()
    }

    this.completionProviderDisposable = monaco.languages.registerCompletionItemProvider('typescript', {
      triggerCharacters: ['.', '('],
      provideCompletionItems: (model, position) => {
        if (!this.scriptMetaData) {
          return { suggestions: [] }
        }

        // 获取当前行的文本
        const lineContent = model.getLineContent(position.lineNumber)
        const wordInfo = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn
        }

        const suggestions: monaco.languages.CompletionItem[] = []

        // 遍历所有原子函数生成补全项
        Object.entries(this.scriptMetaData).forEach(([atomClassName, meta]) => {
          // 跳过测试函数
          if (meta.FunctionName.startsWith('__')) return

          // 获取描述信息
          const decoratorInfo = this.decoratorMetaData?.[atomClassName]
          const description = decoratorInfo?.description || decoratorInfo?.displayName || atomClassName

          // 生成参数占位符
          const params = meta.ParameterList
          const hasParams = params.length > 0

          // 构建插入文本（带括号和参数占位符）
          let insertText: string
          let insertTextRules: monaco.languages.CompletionItemInsertTextRule | undefined

          if (hasParams) {
            // 有参数：生成 snippet 格式，支持 Tab 跳转
            const paramSnippets = params.map((param, index) => {
              const paramName = param.ParameterName
              const isOptional = param.bOptional
              if (isOptional) {
                return `\${${index + 1}:/* ${paramName}? */}`
              }
              return `\${${index + 1}:${paramName}}`
            }).join(', ')
            insertText = `${meta.FunctionName}(${paramSnippets})`
            insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          } else {
            // 无参数：直接插入函数名和空括号
            insertText = `${meta.FunctionName}()`
          }

          // 生成参数签名用于显示
          const paramSignature = params.map(param => {
            const optional = param.bOptional ? '?' : ''
            return `${param.ParameterName}${optional}: ${param.TypeString || 'unknown'}`
          }).join(', ')

          // 获取返回类型
          const returnType = ATOM_TYPE_MAP[meta.AtomType] || 'unknown'

          suggestions.push({
            label: {
              label: meta.FunctionName,
              detail: `(${paramSignature})`,
              description: `: ${returnType}`
            },
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: insertText,
            insertTextRules: insertTextRules,
            range: range,
            detail: `${meta.FunctionName}(${paramSignature}): ${returnType}`,
            documentation: {
              value: `**${description}**\n\n${decoratorInfo?.richDescription || ''}`
            },
            sortText: `0_${meta.FunctionName}`, // 优先显示原子函数
            filterText: meta.FunctionName
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
   * 生成 TypeScript 类型定义
   */
  private generateTypeDefinitions(): string {
    const lines: string[] = []
    
    lines.push('// ============================================')
    lines.push('// Auto-generated Atom Script Type Definitions')
    lines.push('// ============================================')
    lines.push('')

    // 1. 生成基础类型声明
    lines.push('// Base Types')
    lines.push('/** Actor 类型 - 表示游戏中的角色/实体 */')
    lines.push('declare type Actor = unknown;')
    lines.push('')
    
    // Delegate 类型（保留用于参数类型）
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

    // 2. 收集所有使用到的类型
    const usedTypes = new Set<string>()
    if (this.scriptMetaData) {
      Object.values(this.scriptMetaData).forEach(meta => {
        meta.ParameterList.forEach(param => {
          // 从 TypeString 中提取类型名
          const typeMatches = param.TypeString.match(/[A-Z][a-zA-Z]*Delegate/g)
          if (typeMatches) {
            typeMatches.forEach(t => usedTypes.add(t))
          }
        })
      })
    }

    // 3. 从 DecoratorMetaData 生成额外的类型定义
    const builtinTypes = ['NumberValueDelegate', 'BoolValueDelegate', 'StringValueDelegate', 
                          'ActorValueDelegate', 'EventDelegateEx', 'ActionDelegate', 'TaskDelegate', 'Actor']
    if (this.decoratorMetaData) {
      lines.push('// Decorator Types with Descriptions')
      Object.entries(this.decoratorMetaData).forEach(([className, meta]) => {
        if (builtinTypes.includes(className)) return
        
        const desc = meta.description || meta.displayName || className
        lines.push(`/** ${desc} */`)
        if (meta.richDescription) {
          lines.push(`/** @remarks ${meta.richDescription} */`)
        }
        lines.push(`declare type ${className} = ${meta.baseClass || 'unknown'};`)
      })
      lines.push('')
    }

    // 4. 生成函数声明
    if (this.scriptMetaData) {
      lines.push('// Function Declarations')
      lines.push('')

      Object.entries(this.scriptMetaData).forEach(([atomClassName, meta]) => {
        // 跳过测试函数
        if (meta.FunctionName.startsWith('__')) return

        // 获取描述信息
        const decoratorInfo = this.decoratorMetaData?.[atomClassName]
        const description = decoratorInfo?.description || decoratorInfo?.displayName || atomClassName
        const richDescription = decoratorInfo?.richDescription

        // 生成参数列表
        const params = meta.ParameterList.map(param => {
          const optional = param.bOptional ? '?' : ''
          const rest = param.bRest ? '...' : ''
          let type = param.TypeString || 'unknown'
          
          // 处理 rest 参数的类型
          if (param.bRest && !type.endsWith('[]')) {
            type = `${type}[]`
          }
          
          return `${rest}${param.ParameterName}${optional}: ${type}`
        }).join(', ')

        // 获取返回类型
        const returnType = ATOM_TYPE_MAP[meta.AtomType] || 'unknown'

        // 生成 JSDoc
        lines.push('/**')
        lines.push(` * ${description}`)
        if (richDescription) {
          lines.push(` * @remarks ${richDescription}`)
        }
        meta.ParameterList.forEach(param => {
          const paramDesc = param.TypeNodeText || param.TypeString
          lines.push(` * @param ${param.ParameterName} - ${paramDesc}`)
        })
        lines.push(` * @returns ${returnType}`)
        lines.push(' */')
        lines.push(`declare function ${meta.FunctionName}(${params}): ${returnType};`)
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
    return this.scriptMetaData ? Object.keys(this.scriptMetaData).length : 0
  }

  /**
   * 获取生成的类型定义（用于调试）
   */
  getGeneratedTypes(): string {
    return this.generateTypeDefinitions()
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
    this.scriptMetaData = null
    this.decoratorMetaData = null
  }
}

// 导出单例
export const monacoTypeRegistry = MonacoTypeRegistry.getInstance()

// 便捷初始化函数
export async function initializeMonacoTypes(): Promise<void> {
  try {
    // 动态导入元数据文件
    const [scriptMetaModule, decoratorMetaModule] = await Promise.all([
      import('../../config/AtomSystemScriptMetaData.json'),
      import('../../config/AtomDecoratorMetaData.json')
    ])

    const scriptMeta = scriptMetaModule.default as Record<string, ScriptMetaData>
    const decoratorMeta = decoratorMetaModule.default as Record<string, DecoratorMetaData>
    
    console.log('[MonacoTypeRegistry] Loaded scriptMetaData:', Object.keys(scriptMeta).length, 'entries')
    console.log('[MonacoTypeRegistry] Loaded decoratorMetaData:', Object.keys(decoratorMeta).length, 'entries')

    await monacoTypeRegistry.initialize(scriptMeta, decoratorMeta)
  } catch (error) {
    console.error('[MonacoTypeRegistry] Failed to initialize:', error)
  }
}
