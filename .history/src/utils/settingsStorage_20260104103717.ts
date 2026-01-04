/**
 * 应用设置存储管理
 */

export interface P4Settings {
  port: string       // P4PORT, e.g., ssl:9.134.225.161:1666
  user: string       // P4USER, e.g., sharkgao
  client: string     // P4CLIENT (Workspace), e.g., MHA_Client_main
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
}

const SETTINGS_STORAGE_KEY = 'mhatomexceltool_settings'

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
  p4CheckoutPromptEnabled: true
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
        autoSaveInterval: settings.autoSaveInterval ?? DEFAULT_SETTINGS.autoSaveInterval
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
