/**
 * 应用设置存储管理
 */

export interface P4Settings {
  port: string       // P4PORT, e.g., ssl:9.134.225.161:1666
  user: string       // P4USER, e.g., sharkgao
  client: string     // P4CLIENT (Workspace), e.g., MHA_Client_main
}

export interface RecentFileItem {
  filePath: string
  fileName: string
  lastOpenedAt: number  // 时间戳
}

export interface AppSettings {
  theme: string
  showOnlyAtomicFields: boolean
  isDebugMode: boolean
  fieldLayoutDirection: 'horizontal' | 'vertical'
  autoSaveEnabled: boolean
  autoSaveInterval: number // 分钟
  // P4V 设置
  p4: P4Settings
  p4CheckoutPromptEnabled: boolean  // 是否提示 checkout
  // 最近打开文件历史
  recentFiles: RecentFileItem[]
}

const SETTINGS_STORAGE_KEY = 'mhatomexceltool_settings'
const MAX_RECENT_FILES = 10  // 最多保存10个最近文件

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dracula_custom',
  showOnlyAtomicFields: true,
  isDebugMode: false,
  fieldLayoutDirection: 'horizontal',
  autoSaveEnabled: false,
  autoSaveInterval: 5,
  // P4V 默认设置
  p4: {
    port: '',
    user: '',
    client: ''
  },
  p4CheckoutPromptEnabled: true,
  recentFiles: []
}

/**
 * 从本地存储读取设置
 */
export function loadSettingsFromStorage(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) {
      const settings = JSON.parse(stored) as Partial<AppSettings>
      return {
        theme: settings.theme ?? DEFAULT_SETTINGS.theme,
        showOnlyAtomicFields: settings.showOnlyAtomicFields ?? DEFAULT_SETTINGS.showOnlyAtomicFields,
        isDebugMode: settings.isDebugMode ?? DEFAULT_SETTINGS.isDebugMode,
        fieldLayoutDirection: settings.fieldLayoutDirection ?? DEFAULT_SETTINGS.fieldLayoutDirection,
        autoSaveEnabled: settings.autoSaveEnabled ?? DEFAULT_SETTINGS.autoSaveEnabled,
        autoSaveInterval: settings.autoSaveInterval ?? DEFAULT_SETTINGS.autoSaveInterval,
        p4: settings.p4 ?? DEFAULT_SETTINGS.p4,
        p4CheckoutPromptEnabled: settings.p4CheckoutPromptEnabled ?? DEFAULT_SETTINGS.p4CheckoutPromptEnabled,
        recentFiles: settings.recentFiles ?? DEFAULT_SETTINGS.recentFiles
      }
    }
  } catch (error) {
    console.warn('Failed to load settings from localStorage:', error)
  }
  return { ...DEFAULT_SETTINGS }
}

/**
 * 保存设置到本地存储
 */
export function saveSettingsToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.warn('Failed to save settings to localStorage:', error)
  }
}

/**
 * 重置设置为默认值
 */
export function resetSettingsToDefault(): AppSettings {
  const defaultSettings = { ...DEFAULT_SETTINGS }
  saveSettingsToStorage(defaultSettings)
  return defaultSettings
}

/**
 * 从文件路径提取文件名
 */
function extractFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

/**
 * 添加文件到最近打开历史
 */
export function addRecentFile(filePath: string): void {
  const settings = loadSettingsFromStorage()
  const fileName = extractFileName(filePath)
  const now = Date.now()
  
  // 移除已存在的相同文件（如果有）
  settings.recentFiles = settings.recentFiles.filter(
    item => item.filePath.toLowerCase() !== filePath.toLowerCase()
  )
  
  // 添加到列表开头
  settings.recentFiles.unshift({
    filePath,
    fileName,
    lastOpenedAt: now
  })
  
  // 限制最大数量
  if (settings.recentFiles.length > MAX_RECENT_FILES) {
    settings.recentFiles = settings.recentFiles.slice(0, MAX_RECENT_FILES)
  }
  
  saveSettingsToStorage(settings)
}

/**
 * 获取最近打开的文件列表
 */
export function getRecentFiles(): RecentFileItem[] {
  const settings = loadSettingsFromStorage()
  return settings.recentFiles
}

/**
 * 从历史记录中移除指定文件
 */
export function removeRecentFile(filePath: string): void {
  const settings = loadSettingsFromStorage()
  settings.recentFiles = settings.recentFiles.filter(
    item => item.filePath.toLowerCase() !== filePath.toLowerCase()
  )
  saveSettingsToStorage(settings)
}

/**
 * 清空最近打开文件历史
 */
export function clearRecentFiles(): void {
  const settings = loadSettingsFromStorage()
  settings.recentFiles = []
  saveSettingsToStorage(settings)
}
