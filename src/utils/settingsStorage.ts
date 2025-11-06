/**
 * 应用设置存储管理
 */

export interface AppSettings {
  theme: string
  showOnlyAtomicFields: boolean
}

const SETTINGS_STORAGE_KEY = 'mhatomexceltool_settings'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dracula_custom',
  showOnlyAtomicFields: true
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
        showOnlyAtomicFields: settings.showOnlyAtomicFields ?? DEFAULT_SETTINGS.showOnlyAtomicFields
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
