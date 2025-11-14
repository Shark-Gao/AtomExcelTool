import 'reflect-metadata'
import type { FieldMeta, ParamMetadata } from '../../types/MetaDefine'

/**
 * 存储参数元数据的 Symbol
 */
export const PARAM_METADATA_KEY = Symbol('param:metadata')



/**
 * 参数装饰器 - 为构造函数参数添加中文描述
 * @param label 中文标签/描述
 * @param description 详细描述
 */
export function AtomGenParam(paramMetadata: ParamMetadata) {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    // 获取该类已有的参数元数据
    const metadataTarget = typeof target === 'function' ? target : target.constructor
    const existingMetadata: ParamMetadata[] = Reflect.getOwnMetadata(PARAM_METADATA_KEY, metadataTarget) || []

    // 获取参数类型
    const paramTypes: any[] = Reflect.getMetadata('design:paramtypes', metadataTarget) || []
    const paramType = paramTypes[parameterIndex]

    // 获取参数名称（从源代码解析）
    const paramName = getConstructorRawParamName(target, parameterIndex)

    // 添加新的参数元数据
    existingMetadata[parameterIndex] = {
      descName: paramMetadata.descName? paramMetadata.descName : paramName,
      fildName: paramMetadata.fildName? paramMetadata.fildName : paramName,
      type: paramMetadata.type ? paramMetadata.type : paramType,
      subType: paramMetadata.subType,
      description: paramMetadata.description,
      options: paramMetadata.options,
    }

    // 保存元数据
    Reflect.defineMetadata(PARAM_METADATA_KEY, existingMetadata, metadataTarget)
  }
}

/**
 * 构造函数装饰器 - 标记需要提取元数据的 Delegate 类，并附加中文名称
 */
export function AtomGenClass(label?: string) {
  return function (target: any) {
    if (label) {
      Reflect.defineMetadata('class:label', label, target)
    }
    Reflect.defineMetadata('isDelegate', true, target)
    
    // // 从构造函数中提取 _ClassName 并存储到元数据
    // const ueClassName = extractUEClassName(target)
    // if (ueClassName) {
    //   Reflect.defineMetadata('ue:className', ueClassName, target)
    // }
    
    return target
  }
}

/**
 * 从构造函数字符串中提取参数名称
 */
export function getConstructorRawParamName(target: any, paramIndex: number): string {
  try {
    const paramNames = getConstructorRawParamNames(target);

    return paramNames[paramIndex] || `param${paramIndex}`
  } catch (error) {
    console.warn(`Failed to extract param name for index ${paramIndex}:`, error)
    return `param${paramIndex}`
  }
}

  /**
   * 从Delegate类的构造函数中提取参数名称
   * 改进方案：按逗号分割，逐个清理参数名
   * 支持：public/private/protected/readonly/... 修饰符、类型注解、默认值
   */
  export function getConstructorParamNames(delegateClass: any): string[] {
    try {
      const paramNames: string[] = getConstructorRawParamNames(delegateClass);

      // 获取参数的装饰器元数据（包含名称、类型、中文标签）
      const paramMetadataList: ParamMetadata[] =
        Reflect.getOwnMetadata(PARAM_METADATA_KEY, delegateClass) ||
        Reflect.getMetadata(PARAM_METADATA_KEY, delegateClass.prototype) || []

      // 转换参数为字段元数据
      const fields: FieldMeta[] = [];

      const paramTypes: any[] = Reflect.getMetadata(
          'design:paramtypes',
          delegateClass
        ) || [];

      for (let i = 0; i < paramTypes.length; i++) {
        if (paramMetadataList.length > 0 && paramMetadataList[i]) {
          // 如果有装饰器元数据，直接使用
          const paramMeta = paramMetadataList[i];
          paramNames[i] = paramMeta.fildName;
        }
      }
      return paramNames;
    } catch (error) {
      console.warn(
        `[DelegateMetadataGenerator] Failed to extract param names for ${delegateClass.name}:`,
        error
      );
      return [];
    }
  }

  /**
   * 从Delegate类的构造函数中提取参数名称
   * 改进方案：按逗号分割，逐个清理参数名
   * 支持：public/private/protected/readonly/... 修饰符、类型注解、默认值
   */
  export function getConstructorRawParamNames(delegateClass: any): string[] {
    try {
      const paramNames: string[] = [];

      const constructorStr = delegateClass.toString();
      
      // 提取构造函数参数部分（支持多行）
      const constructorMatch = constructorStr.match(/constructor\s*\(([\s\S]*?)\)\s*[{:]/);
      if (!constructorMatch) {
        return [];
      }

      const paramsStr = constructorMatch[1];

      // 按逗号分割参数
      const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);

      // 逐个提取参数名
      params.forEach((param) => {
        // 移除修饰符（public, private, protected, readonly, ...）
        let cleaned = param.replace(/^(public|private|protected|readonly|\.\.\.)\s+/g, '');
        
        // 移除类型注解（: Type 或 : Type[]）
        cleaned = cleaned.replace(/:\s*[\w<>[\]|&\s]+/g, '');
        
        // 移除默认值（= value）
        cleaned = cleaned.replace(/\s*=\s*.*$/, '');
        
        // 最后的清理
        cleaned = cleaned.trim();

        // 验证是否为有效的参数名
        if (cleaned && /^\w+$/.test(cleaned)) {
          paramNames.push(cleaned);
        }
      });

      return paramNames;
    } catch (error) {
      console.warn(
        `[DelegateMetadataGenerator] Failed to extract param names for ${delegateClass.name}:`,
        error
      );
      return [];
    }
  }
