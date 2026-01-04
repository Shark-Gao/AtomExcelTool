/**
 * 配置管理系统 - 管理外部配置目录和元数据热更新
 * 支持开发环境和生产环境的配置加载
 */

import { join, dirname } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, watchFile, unwatchFile, statSync, chmodSync } from 'fs'
import { app } from 'electron'
import { checkoutFile, isP4Configured } from './P4Service'

// ============ 配置路径管理 ============

/**
 * 获取配置目录路径
 * - 开发环境：项目根目录/config
 * - 生产环境：EXE 同级目录/config
 * 
 * 说明：
 * - 开发时：__dirname 是 dist/electron/main，需要 ../../ 回到项目根，再进入 config
 * - 打包时：app.getPath('exe') 返回 EXE 路径，使用其目录下的 config
 */
export function getConfigDirectory(): string {
  let configDir: string

  if (!app.isPackaged) {
    // 开发模式：从 dist/electron/main 回到项目根目录的 config
    // dist/electron/main → dist/electron → dist → {project-root} → config
    configDir = join(__dirname, '../../..', 'config')
  } else {
    // 生产模式：EXE 所在目录的 config 文件夹
    configDir = join(dirname(app.getPath('exe')), 'config')
  }

  // 确保目录存在
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  return configDir
}

/**
 * 获取特定配置文件路径
 */
export function getConfigFilePath(fileName: string): string {
  const configDir = getConfigDirectory()
  return join(configDir, fileName)
}

// ============ 文件写入工具 ============

/**
 * 检查文件是否只读
 */
export function isFileReadOnly(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false
  }
  try {
    const stats = statSync(filePath)
    // Windows: 检查文件是否只读 (mode & 0o200 === 0 表示没有写权限)
    return (stats.mode & 0o200) === 0
  } catch {
    return false
  }
}

/**
 * 设置文件为可写
 */
export function setFileWritable(filePath: string): boolean {
  try {
    const stats = statSync(filePath)
    // 添加写权限
    chmodSync(filePath, stats.mode | 0o200)
    console.log(`[ConfigManager] 文件已设置为可写: ${filePath}`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ConfigManager] 设置文件可写失败: ${message}`)
    return false
  }
}

/**
 * 确保文件可写（先尝试 P4 checkout，失败则直接设置可写）
 * @param filePath 文件路径
 * @returns 是否成功确保文件可写
 */
export async function ensureFileWritable(filePath: string): Promise<{ success: boolean; message: string }> {
  // 如果文件不存在或已经可写，直接返回成功
  if (!existsSync(filePath) || !isFileReadOnly(filePath)) {
    return { success: true, message: '文件可写' }
  }

  console.log(`[ConfigManager] 文件只读，尝试获取写权限: ${filePath}`)

  // 尝试 P4 checkout
  if (isP4Configured()) {
    try {
      const result = await checkoutFile(filePath)
      if (result.success) {
        console.log(`[ConfigManager] P4 checkout 成功: ${filePath}`)
        return { success: true, message: `P4 checkout 成功: ${result.message}` }
      }
      console.log(`[ConfigManager] P4 checkout 失败: ${result.message}，尝试直接设置可写`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[ConfigManager] P4 checkout 异常: ${message}，尝试直接设置可写`)
    }
  }

  // P4 未配置或 checkout 失败，直接设置文件为可写
  if (setFileWritable(filePath)) {
    return { success: true, message: '已直接设置文件为可写' }
  }

  return { success: false, message: '无法获取文件写权限' }
}

// ============ 元数据配置管理 ============

export interface DelegateParamConfig {
  name: string
  type: string
  label?: string
  description?: string
  defaultValue?: any
}

export interface DelegateClassConfig {
  className: string
  label?: string
  ueClassName?: string
  params: DelegateParamConfig[]
  description?: string
  category?: string
}

export interface MetadataConfig {
  version: string
  generatedAt: string
  delegates: DelegateClassConfig[]
}

// 元数据缓存
let METADATA_CACHE: MetadataConfig | null = null
let METADATA_FILE_WATCHERS: Map<string, any> = new Map()

/**
 * 加载元数据配置文件
 */
export function loadMetadataConfig(fileName: string = 'delegates.metadata.json'): any {
  const filePath = getConfigFilePath(fileName)

  try {
    // 如果文件不存在，返回空配置
    if (!existsSync(filePath)) {
      console.warn(`[ConfigManager] Metadata file not found: ${filePath}`)
      return undefined;
    }

    // 读取文件（处理 BOM）
    let content = readFileSync(filePath, 'utf-8')
    
    // 移除 UTF-8 BOM（如果存在）
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1)
    }
    
    // 调试：输出读取内容的前 200 个字符
    console.log(`[ConfigManager] Read file: ${filePath}, first 200 chars:`, content.substring(0, 200))
    
    const config: any = JSON.parse(content)

    // 更新缓存
    METADATA_CACHE = config

    return config
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ConfigManager] Failed to load metadata: ${message}`)
    console.error(`[ConfigManager] File path: ${filePath}`)
    throw new Error(`Failed to load metadata config from ${filePath}: ${message}`)
  }
}

/**
 * 保存元数据配置文件
 */
export async function saveMetadataConfig(
  config: MetadataConfig,
  fileName: string = 'delegates.metadata.json'
): Promise<void> {
  const filePath = getConfigFilePath(fileName)

  try {
    // 确保文件可写
    const writableResult = await ensureFileWritable(filePath)
    if (!writableResult.success) {
      throw new Error(`无法获取文件写权限: ${writableResult.message}`)
    }

    // 更新时间戳
    config.generatedAt = new Date().toISOString()

    // 写入文件
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')

    // 更新缓存
    METADATA_CACHE = config

    console.log(`[ConfigManager] Metadata saved to: ${filePath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ConfigManager] Failed to save metadata: ${message}`)
    throw new Error(`Failed to save metadata config to ${filePath}: ${message}`)
  }
}

/**
 * 获取缓存的元数据（如果没有加载过则自动加载）
 */
export function getMetadataConfigCached(
  fileName: string = 'delegates.metadata.json'
): MetadataConfig {
  if (METADATA_CACHE) {
    return METADATA_CACHE
  }

  return loadMetadataConfig(fileName)
}

/**
 * 按类名获取 Delegate 配置
 */
export function getDelegateConfig(className: string): DelegateClassConfig | undefined {
  const config = getMetadataConfigCached()
  return config.delegates.find(d => d.className === className)
}

/**
 * 获取所有 Delegate 配置
 */
export function getAllDelegateConfigs(): DelegateClassConfig[] {
  const config = getMetadataConfigCached()
  return config.delegates
}

/**
 * 按分类获取 Delegate 配置
 */
export function getDelegateConfigsByCategory(category: string): DelegateClassConfig[] {
  const config = getMetadataConfigCached()
  return config.delegates.filter(d => d.category === category)
}

/**
 * 导出配置为字符串
 */
export function exportMetadataToString(config: MetadataConfig): string {
  return JSON.stringify(config, null, 2)
}

/**
 * 从字符串导入配置
 */
export function importMetadataFromString(jsonString: string): MetadataConfig {
  return JSON.parse(jsonString)
}
