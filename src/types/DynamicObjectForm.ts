/**
 * 动态对象表单类型定义
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'select' | 'object' | 'array';

/**
 * 参数元数据 - 用于装饰器存储参数信息
 */
export interface ParamMetadata {
  fildName?: string;// 属性名
  type?: any;
  subType?: any;
  descName?: string; // 字段描述
  description?: string; // 详细描述
  options?: Array<{ label: string; value: any }>; // 枚举选项
}

/**
 * 字段元数据 - 支持多种字段类型
 */
export type FieldMeta =
  | {
      key: string;
      label: string;
      type: 'string' | 'number' | 'boolean';
      description?: string;
      baseClass?: string;
    }
  | {
      key: string;
      label: string;
      type: 'select';
      options: Array<{ label: string; value: any }>;
      description?: string;
    }
  | {
      key: string;
      label: string;
      type: 'object';
      baseClass: string;
      description?: string;
    }
  | {
      key: string;
      label: string;
      type: 'array';
      baseClass?: string;
      description?: string;
    };

/**
 * 类元数据 - 包含类的完整信息
 */
export interface ClassMetadata {
  // // for editor
  // delegateKey: string;

  className: string;
  displayName: string;
  baseClass: string;
  fields: FieldMeta[];
}

/**
 * 类信息 - 用于编辑器UI
 */
export interface ClassInfo {
  displayName: string;
  baseClass: string;
  fields: Record<string, FieldMeta>;
}

/**
 * 类注册表 - 映射类名到类信息
 */
export type ClassRegistry = Record<string, ClassInfo>;