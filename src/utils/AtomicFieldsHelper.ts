/**
 * 原子字段判断工具 - 同时支持本地常量和远程配置
 * 提供向后兼容性，优先使用远程配置
 */

import { AtomFieldsManager } from './AtomFieldsManager';

let atomFieldsManager: AtomFieldsManager | null = null;
let useRemoteConfig = false;

/**
 * 初始化原子字段系统
 */
export async function initializeAtomicFields(): Promise<void> {
  try {
    atomFieldsManager = AtomFieldsManager.getInstance();
    await atomFieldsManager.init();
    useRemoteConfig = true;
    console.log('[AtomicFieldsHelper] 使用远程配置');
  } catch (error) {
    console.warn('[AtomicFieldsHelper] 初始化失败，使用本地配置:', error);
    useRemoteConfig = false;
  }
}

/**
 * 获取字段允许的基类
 * 优先使用远程配置，降级到本地配置
 */
export async function getAllowedBaseClassesForField(fieldName: string, sheetName?: string, fileName?: string): Promise<string[]> {
  if (useRemoteConfig && atomFieldsManager) {
    try {
      const remoteClasses = await atomFieldsManager.getAllowedBaseClassesForField(fieldName, sheetName, fileName);
      if (remoteClasses.length > 0) {
        return remoteClasses;
      }
    } catch (error) {
      console.warn('[AtomicFieldsHelper] 获取远程配置失败，降级到本地配置:', error);
    }
  }
  return [];
}

/**
 * 判断字段是否为原子字段
 * 优先使用远程配置，降级到本地配置
 */
export async function isAtomicFieldAsync(fieldName: string, sheetName?: string, fileName?: string): Promise<boolean> {
  const baseClasses = await getAllowedBaseClassesForField(fieldName, sheetName, fileName);
  return baseClasses.length > 0 || fieldName.endsWith('.e');
}


