import 'reflect-metadata';
import type { ClassMetadata, FieldMeta, ParamMetadata } from '../../types/DynamicObjectForm';
import { getConstructorParamNames, getConstructorRawParamName, getConstructorRawParamNames, PARAM_METADATA_KEY } from './DelegateDecorators';
import { DELEGATE_BASE_CLASSES, DELEGATE_BASE_CLASS_DETECTION_ORDER } from '../../constants/DelegateBaseClassesConst';




/**
 * 从Delegate类生成编辑器元数据
 * 使用reflect-metadata通过装饰器获取构造函数参数类型信息
 */
export class DelegateMetadataGenerator {
  /**
   * 判断类型是否为Delegate类型
   */
  private static isDelegateType(type: any): boolean {
    if (!type) return false;
    const typeName = type.name || '';
    return (
      typeName.includes('Delegate') ||
      typeName.includes('ActorValue') ||
      typeName.includes('NumberValue') ||
      typeName.includes('BoolValue') || 
      typeName.includes('Action') || 
      typeName.includes('Task')
    );
  }

  /**
   * 判断类型是否为枚举类型，并提取枚举选项
   * 注意：TypeScript 枚举编译后会生成反向映射，需要过滤掉数值键
   * 例如：enum E { A = 0, B = 1 } 编译后为 { A: 0, B: 1, 0: "A", 1: "B" }
   */
  private static extractEnumOptions(paramType: any): Array<{ label: string; value: any }> | null {
    if (!paramType || typeof paramType !== 'object') {
      return null;
    }

    // 检查是否为枚举对象（通常有多个数值属性）
    const keys = Object.keys(paramType);
    if (keys.length === 0) {
      return null;
    }

    // 过滤出数值或字符串类型的属性（枚举值）
    const enumValues: Array<{ label: string; value: any }> = [];
    for (const key of keys) {
      const value = paramType[key];
      
      // 跳过函数和特殊属性
      if (typeof value === 'function' || key.startsWith('_')) {
        continue;
      }
      
      // 跳过反向映射的数值键（TypeScript 枚举特性）
      // 如果 key 是纯数字字符串，说明是反向映射，跳过
      if (/^\d+$/.test(key)) {
        continue;
      }
      
      // 收集枚举值（只收集键名为字符串的属性）
      if (typeof value === 'number' || typeof value === 'string') {
        enumValues.push({
          label: key,
          value: value
        });
      }
    }

    return enumValues.length > 0 ? enumValues : null;
  }

  /**
   * 将反射获取的类型转换为FieldMeta类型
   */
  private static inferFieldType(
    fieldName: string,
    paramName: string,
    paramType: any,
    paramSubType?: any
  ): FieldMeta | null {
    if (!paramType) {
      return null;
    }

    const typeName = paramType.name || '';

    // 检查是否为Delegate类型
    if (this.isDelegateType(paramType)) {
      let baseClass = undefined;
      if (typeName.includes('NumberValue')) {
        baseClass = DELEGATE_BASE_CLASSES.NumberValueDelegate;
      } else if (typeName.includes('BoolValue')) {
        baseClass = DELEGATE_BASE_CLASSES.BoolValueDelegate;
      } else if (typeName.includes('ActorValue')) {
        baseClass = DELEGATE_BASE_CLASSES.ActorValueDelegate;
      } else if (typeName.includes('EventDelegate')) {
        baseClass = DELEGATE_BASE_CLASSES.EventDelegateEx;
      } else if (typeName.includes('ActionDelegate')) {
        baseClass = DELEGATE_BASE_CLASSES.ActionDelegate;
      } else if (typeName.includes('TaskDelegate')) {
        baseClass = DELEGATE_BASE_CLASSES.TaskDelegate;
      }

      if (baseClass) {
        return {
          key: fieldName,
          label: paramName,
          type: 'object',
          baseClass,
        };
      }
    }

    // 检查是否为枚举类型
    const enumOptions = this.extractEnumOptions(paramType);
    if (enumOptions) {
      return {
        key: fieldName,
        label: paramName,
        type: 'select',
        options: enumOptions,
      };
    }

    // 基本类型
    if (paramType === String) {
      return {
        key: fieldName,
        label: paramName,
        type: 'string',
      };
    }

    if (paramType === Number) {
      return {
        key: fieldName,
        label: paramName,
        type: 'number',
      };
    }

    if (paramType === Boolean) {
      return {
        key: fieldName,
        label: paramName,
        type: 'boolean',
      };
    }

    // 数组类型
    if (paramType === Array) {
      return {
        key: fieldName,
        label: paramName,
        type: 'array',
        baseClass: paramSubType,
      };
    }

    if (paramSubType) {
      return {
          key: fieldName,
          label: paramName,
          type: 'string',
          baseClass: paramSubType,
        };
    }
    return null;
  }

  /**
   * 从Delegate类生成ClassMetadata
   */
  static generateMetadataFromDelegate(
    delegateConfigKey: string,
    delegateClass: any
  ): ClassMetadata | null {
    try {
      // 获取类名（TypeScript 类名）
      const className = delegateClass.name;
      
      // 从装饰器元数据中获取 UE 类名（_ClassName）
      const ueClassName = Reflect.getOwnMetadata('ue:className', delegateClass);

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
      const paramNames = getConstructorRawParamNames(delegateClass);

      for (let i = 0; i < paramTypes.length; i++) {
        if (paramMetadataList.length > 0 && paramMetadataList[i]) {
          // 如果有装饰器元数据，直接使用
          const paramMeta = paramMetadataList[i];
          
          // 如果装饰器中指定了 options，则创建 select 类型的字段
          if (paramMeta.options && paramMeta.options.length > 0) {
            const fieldMeta: FieldMeta = {
              key: paramMeta.fildName,
              label: paramMeta.descName,
              type: 'select',
              options: paramMeta.options,
            };
            if (paramMeta.description) {
              fieldMeta.description = paramMeta.description;
            }
            fields.push(fieldMeta);
          } else {
            // 否则通过 inferFieldType 推断类型
            const fieldMeta = this.inferFieldType(paramMeta.fildName, paramMeta.descName, paramMeta.type, paramMeta.subType);
            if (fieldMeta) {
              if (paramMeta.description) {
                fieldMeta.description = paramMeta.description;
              }
              fields.push(fieldMeta);
            }
          }
        } else {
          const paramName = paramNames[i] || `param${i}`;
          const paramType = paramTypes[i];
          const fieldMeta = this.inferFieldType(paramName, paramName, paramType);
          if (fieldMeta) {
            fields.push(fieldMeta);
          }
        }
      }

      // 确定基类 - 搜索所有父类
      let baseClass = undefined;
      let currentProto = Object.getPrototypeOf(delegateClass.prototype);
      
      while (currentProto && currentProto.constructor.name !== 'Object') {
        const baseClassName = currentProto.constructor.name;
        
        if (this.isDelegateType(currentProto.constructor)) {
          // 按优先级匹配基类
          for (const delegateBaseClass of DELEGATE_BASE_CLASS_DETECTION_ORDER) {
            if (baseClassName.includes(delegateBaseClass)) {
              baseClass = delegateBaseClass;
              break;
            }
          }
          if (baseClass) {
            break;
          }
        }
        
        // 继续向上搜索父类
        currentProto = Object.getPrototypeOf(currentProto);
      }

      const displayName = Reflect.getOwnMetadata('class:label', delegateClass) || delegateConfigKey;//Reflect.getOwnMetadata('class:label', delegateClass) || className;

      return {
        className: ueClassName || className,
        baseClass,
        displayName,
        fields,
      };
    } catch (error) {
      console.warn(
        `[DelegateMetadataGenerator] Failed to generate metadata for ${delegateClass.name}:`,
        error
      );
      return null;
    }
  }



  /**
   * 从Delegate类Map生成完整的元数据列表
   */
  static generateMetadataFromFunctionMap(
    functionNameToDelegate: Map<string, any>
  ): ClassMetadata[] {
    const metadata: ClassMetadata[] = [];
    const processedClasses = new Set<string>();

    for (const [delegateConfigKey, delegateClass] of functionNameToDelegate) {
      const className = delegateClass.name;

      // 避免重复处理同一个类
      if (processedClasses.has(className)) {
        continue;
      }
      processedClasses.add(className);

      const classMeta = this.generateMetadataFromDelegate(delegateConfigKey, delegateClass);
      if (classMeta) {
        metadata.push(classMeta);
      }
    }

    return metadata;
  }

  /**
   * 按基类分组元数据
   */
  static groupMetadataByBaseClass(
    metadata: ClassMetadata[]
  ): Record<string, ClassMetadata[]> {
    const grouped: Record<string, ClassMetadata[]> = {};

    for (const meta of metadata) {
      const baseClass = meta.baseClass;
      if (!grouped[baseClass]) {
        grouped[baseClass] = [];
      }
      grouped[baseClass].push(meta);
    }

    return grouped;
  }

  /**
   * 生成编辑器可用的ClassRegistry
   */
  static generateClassRegistry(
    metadata: ClassMetadata[]
  ): Record<string, any> {
    const registry: Record<string, any> = {};

    for (const classMeta of metadata) {
      registry[classMeta.className] = {
        displayName: classMeta.displayName || classMeta.className,
        baseClass: classMeta.baseClass,
        fields: classMeta.fields.reduce<Record<string, FieldMeta>>(
          (acc, field) => {
            acc[field.key] = field;
            return acc;
          },
          {}
        ),
      };
    }

    return registry;
  }
}
