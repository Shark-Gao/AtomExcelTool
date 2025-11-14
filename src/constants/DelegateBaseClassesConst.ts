/**
 * 委托基类名称常量
 * 用于在 DelegateMetadataGenerator 和前端 UI 中统一使用
 */

import { ActionDelegate, ActorValueDelegate, BoolValueDelegate, EventDelegateEx, NumberValueDelegate, TaskDelegate } from "../electron/main/MHTsAtomSystemUtils";

// 所有支持的基类名称
export const DELEGATE_BASE_CLASSES = {
  NumberValueDelegate: 'NumberValueDelegate',
  BoolValueDelegate: 'BoolValueDelegate',
  ActorValueDelegate: 'ActorValueDelegate',
  EventDelegateEx: 'EventDelegateEx',
  ActionDelegate: 'ActionDelegate',
  TaskDelegate: 'TaskDelegate',
} as const;

// 所有支持的基类名称
export const DELEGATE_BASE_CLASSES_Def = {
  NumberValueDelegate: NumberValueDelegate,
  BoolValueDelegate: BoolValueDelegate,
  ActorValueDelegate: ActorValueDelegate,
  EventDelegateEx: EventDelegateEx,
  ActionDelegate: ActionDelegate,
  TaskDelegate: TaskDelegate,
} as const;

// 基类优先级匹配顺序（用于检测类型时的匹配顺序）
export const DELEGATE_BASE_CLASS_DETECTION_ORDER = [
  DELEGATE_BASE_CLASSES.NumberValueDelegate,
  DELEGATE_BASE_CLASSES.BoolValueDelegate,
  DELEGATE_BASE_CLASSES.ActorValueDelegate,
  DELEGATE_BASE_CLASSES.EventDelegateEx,
  DELEGATE_BASE_CLASSES.ActionDelegate,
  DELEGATE_BASE_CLASSES.TaskDelegate,
] as const;

// 字段后缀与基类的映射规则
export const FIELD_SUFFIX_TO_BASE_CLASS_MAP: Record<string, string[]> = {
  '.Condition': [DELEGATE_BASE_CLASSES.BoolValueDelegate],
  '.Action': [DELEGATE_BASE_CLASSES.ActionDelegate],
  '.Task': [DELEGATE_BASE_CLASSES.TaskDelegate],
  '.Event': [DELEGATE_BASE_CLASSES.EventDelegateEx],
  '.ActionLhs': [DELEGATE_BASE_CLASSES.ActionDelegate],
  '.ActionRhs': [DELEGATE_BASE_CLASSES.ActionDelegate],
};

// 字段前缀与基类的映射规则
export const FIELD_PREFIX_TO_BASE_CLASS_MAP: Record<string, string[]> = {
  'EventActionEx': [DELEGATE_BASE_CLASSES.ActionDelegate],
};

// 字段全名与基类的映射规则
export const FIELD_FULL_TO_BASE_CLASS_MAP: Record<string, string[]> = {
  'BeginActions': [DELEGATE_BASE_CLASSES.ActionDelegate],
  'EndActions': [DELEGATE_BASE_CLASSES.ActionDelegate],
  'CustomTasks': [DELEGATE_BASE_CLASSES.TaskDelegate],
};

/**
 * 根据字段名获取允许的基类列表
 * @param fieldName 字段名
 * @returns 允许的基类列表，如果无匹配规则则返回空数组
 */
export function getAllowedBaseClassesForFieldName(fieldName: string): string[] {
  // 检查后缀规则
  for (const [suffix, baseClasses] of Object.entries(FIELD_SUFFIX_TO_BASE_CLASS_MAP)) {
    if (fieldName.endsWith(suffix)) {
      return baseClasses;
    }
  }

  // 检查前缀规则
  for (const [prefix, baseClasses] of Object.entries(FIELD_PREFIX_TO_BASE_CLASS_MAP)) {
    if (fieldName.startsWith(prefix)) {
      return baseClasses;
    }
  }

  // 检查全名规则
  for (const [full, baseClasses] of Object.entries(FIELD_FULL_TO_BASE_CLASS_MAP)) {
    if (fieldName === full) {
      return baseClasses;
    }
  }

  // 无匹配规则，返回空数组
  return [];
}

/**
 * 判断字段是否为原子字段（即包含委托类型的字段）
 * @param fieldName 字段名
 * @returns 如果是原子字段则返回 true，否则返回 false
 */
export function isAtomicField(fieldName: string): boolean {
  return getAllowedBaseClassesForFieldName(fieldName).length > 0 || fieldName.endsWith('.e');
}
