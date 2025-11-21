/**
 * 原子字段管理器 - 前端使用
 * 通过 IPC 调用后端配置加载器，获取原子字段配置
 */

const electronWindow = window as typeof window;

export class AtomFieldsManager {
  private static instance: AtomFieldsManager;
  private allowedBaseClassesCache: Map<string, string[]> = new Map();
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): AtomFieldsManager {
    if (!AtomFieldsManager.instance) {
      AtomFieldsManager.instance = new AtomFieldsManager();
    }
    return AtomFieldsManager.instance;
  }

  /**
   * 初始化管理器
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (!electronWindow.electronAPI) {
        console.warn('[AtomFieldsManager] 未检测到 Electron API，使用默认规则');
        this.isInitialized = true;
        return;
      }

      // 尝试获取配置
      const result = await electronWindow.electronAPI.invoke('config:get-atom-fields-config');
      if (result.ok) {
        console.log('[AtomFieldsManager] 配置加载成功');
      } else {
        console.warn('[AtomFieldsManager] 配置加载失败，使用默认规则:', result.error);
      }
    } catch (error) {
      console.warn('[AtomFieldsManager] 初始化失败，使用默认规则:', error);
    }

    this.isInitialized = true;
  }

  /**
   * 获取字段允许的基类
   */
  public async getAllowedBaseClassesForField(fieldName: string, sheetName?: string, fileName?: string): Promise<string[]> {
    const cacheKey = `${fileName || ''}#${sheetName || ''}#${fieldName}`;

    // 检查缓存
    if (this.allowedBaseClassesCache.has(cacheKey)) {
      return this.allowedBaseClassesCache.get(cacheKey)!;
    }

    try {
      if (!electronWindow.electronAPI) {
        // 没有 IPC，返回空
        return [];
      }

      const result = await electronWindow.electronAPI.invoke('config:get-allowed-base-classes', {
        fieldName,
        sheetName,
        fileName
      });

      if (result.ok) {
        this.allowedBaseClassesCache.set(cacheKey, result.baseClasses);
        return result.baseClasses;
      } else {
        console.warn(`[AtomFieldsManager] 获取基类失败 [${fieldName}]:`, result.error);
        return [];
      }
    } catch (error) {
      console.warn(`[AtomFieldsManager] IPC 调用失败 [${fieldName}]:`, error);
      return [];
    }
  }
  
  /**
   * 清空缓存
   */
  public clearCache(): void {
    this.allowedBaseClassesCache.clear();
  }

  /**
   * 重新初始化（热更新）
   */
  public async reinit(): Promise<void> {
    this.clearCache();
    this.isInitialized = false;
    await this.init();
  }
}
