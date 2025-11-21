import 'reflect-metadata';
import type { ClassMetadata, FieldMeta, ParamMetadata, RawAtomTSMetaMap, ScriptFunctionParameterMetaData, FAtomTypeBase, FAtomTypeArray, FAtomTypeUnion, BaseClassType, ClassInfo } from '../../types/MetaDefine';
import { EAtomType } from '../../types/MetaDefine';
import { getConstructorParamNames, getConstructorRawParamName, getConstructorRawParamNames, PARAM_METADATA_KEY } from './DelegateDecorators';
import { DELEGATE_BASE_CLASSES, DELEGATE_BASE_CLASSES_Def, DELEGATE_BASE_CLASS_DETECTION_ORDER } from '../../constants/DelegateBaseClassesConst';
import { loadMetadataConfig } from './ConfigManager';
import { DelegateFactory } from './DelegateFactory';
import { NumberValueDelegate } from './MHTsAtomSystemUtils';


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
   * 从Delegate类生成ClassMetadata 废弃旧接口
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
        funcName: delegateConfigKey,
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
   * 将 RawAtomTSMetaMap 转换为 ClassMetadata[]
   * RawAtomTSMetaMap 是从 TS AST 解析出的元信息
   * 需要转换为编辑器可用的 ClassMetadata 格式
   */
  private static convertRawAtomTSMetaToClassMetadata(rawMeta: RawAtomTSMetaMap, decoratorMeta: Record<string, ClassMetadata>): ClassMetadata[] {
    const result: ClassMetadata[] = [];
    const byClassNameMetas: Record<string, ClassMetadata> = {};
    const byDelegateKeyMetas: Record<string, ClassMetadata> = {};
    for (const [className, scriptFunctionMeta] of Object.entries(rawMeta)) {
      if (scriptFunctionMeta.FunctionName == "__test") {
        continue;
      }
      console.log(`[DelegateMetadataGenerator] Converting class: ${className}`);
      const fields: FieldMeta[] = [];
      const decoratorMetaItem: ClassMetadata = decoratorMeta[scriptFunctionMeta.AtomClassName];

      // 转换参数列表为字段列表
      for (const param of scriptFunctionMeta.ParameterList) {
        const fieldMeta = this.convertScriptParameterToFieldMeta(param, decoratorMetaItem);
        if (fieldMeta) {
          fields[param.OrdinalIndex] = fieldMeta;
        }
      }

      // 构建 ClassMetadata
      const classMetadata: ClassMetadata = {
        className: scriptFunctionMeta.AtomClassName,
        funcName: scriptFunctionMeta.FunctionName,
        displayName: decoratorMetaItem? decoratorMetaItem.displayName: scriptFunctionMeta.FunctionName,
        description: decoratorMetaItem? decoratorMetaItem.description: scriptFunctionMeta.FunctionName,
        category: decoratorMetaItem? decoratorMetaItem.category: '',
        richDescription: decoratorMetaItem? decoratorMetaItem.richDescription: '',
        baseClass: this.getAtomTypeClass({AtomType: scriptFunctionMeta.AtomType}), // 默认基类，可根据需要调整
        fields
      };
      byClassNameMetas[scriptFunctionMeta.AtomClassName] = classMetadata;
      byDelegateKeyMetas[scriptFunctionMeta.FunctionName] = classMetadata;
      result.push(classMetadata);
    }

    DelegateFactory.initialize(byClassNameMetas, byDelegateKeyMetas);

    return result;
  }

  /**
   * 判断 Union 类型是否为字符串枚举（所有成员都是 SpecificString 或 LiteralString）
   */
  private static isStringEnumUnion(unionType: FAtomTypeUnion): boolean {
    return unionType.UnionTypes.every(t =>
      t.AtomType === EAtomType.SpecificString || t.AtomType === EAtomType.LiteralString
    );
  }

  private static isObjectUnionType(unionType: FAtomTypeUnion): boolean {
    return unionType.UnionTypes.every(t =>
      t.AtomType >= EAtomType.Number && t.AtomType <= EAtomType.Task
    );
  }

  /**
   * 从 Union 类型提取字符串选项
   */
  private static extractStringEnumOptions(
    unionType: FAtomTypeUnion
  ): Array<{ label: string; value: any }> {
    const options: Array<{ label: string; value: any }> = [];
    
    for (const type of unionType.UnionTypes) {
      if (type.AtomType === EAtomType.SpecificString) {
        const specificType = type as any; // SpecificString 有 SpecificString 属性
        if (specificType.SpecificString) {
          options.push({
            label: specificType.SpecificString,
            value: specificType.SpecificString
          });
        }
      } else if (type.AtomType === EAtomType.LiteralString) {
        // LiteralString 是字面字符串类型，需要从其他地方获取值
        // 这里暂时跳过，或者从 TypeString 解析
      }
    }
    
    return options;
  }

  /**
   * 根据 FAtomTypeBase 获取类型类
   */
  private static getAtomTypeClass(atomType: FAtomTypeBase): BaseClassType {
    switch (atomType.AtomType) {
      case EAtomType.SpecificNumber:
      case EAtomType.LiteralNumber:
        return 'number';
      case EAtomType.LiteralBoolean:
        return 'boolean';
      case EAtomType.SpecificString:
      case EAtomType.LiteralString:
        return 'string';
      case EAtomType.Number:
        return DELEGATE_BASE_CLASSES.NumberValueDelegate;
      case EAtomType.Action:
        return DELEGATE_BASE_CLASSES.ActionDelegate;
      case EAtomType.Actor:
        return DELEGATE_BASE_CLASSES.ActorValueDelegate;
      case EAtomType.Event:
        return DELEGATE_BASE_CLASSES.EventDelegateEx;
      case EAtomType.Boolean:
        return DELEGATE_BASE_CLASSES.BoolValueDelegate;
      case EAtomType.Task:
        return DELEGATE_BASE_CLASSES.TaskDelegate;
      case EAtomType.Array:
        // 对于数组类型，递归获取元素类型
        const arrayType = atomType as FAtomTypeArray;
        return this.getAtomTypeClass(arrayType.ElementType);
      default:
        return 'string';
    }
  }

  /**
   * 将 ScriptFunctionParameterMetaData 转换为 FieldMeta
   * 使用 AtomType 作为主要判断依据
   */
  private static convertScriptParameterToFieldMeta(param: ScriptFunctionParameterMetaData, decoratorMetaItem: ClassMetadata): FieldMeta | null {
    const key = param.ParameterName;
    let label = decoratorMetaItem? decoratorMetaItem.fields[param.OrdinalIndex]?.label : param.ParameterName;
    if (label === undefined) {
      label = param.ParameterName;
    }
    const description = decoratorMetaItem? decoratorMetaItem.fields[param.OrdinalIndex]?.description: param.TypeString;
    let fieldMeta: FieldMeta | null = null;
    
    // 根据 AtomType 判断字段类型
    switch (param.AtomType.AtomType) {
      case EAtomType.SpecificNumber:
      case EAtomType.LiteralNumber:
      case EAtomType.LiteralBoolean:
      case EAtomType.SpecificString:
      case EAtomType.LiteralString:
        fieldMeta = {
          key,
          label,
          type: 'string',
          description: description
        };
        break;

      case EAtomType.Array:
        // 数组类型：获取元素类型并设置到 baseClass
        const arrayType = param.AtomType as FAtomTypeArray;
        const elementTypeName = this.getAtomTypeClass(arrayType.ElementType);
        fieldMeta = {
          key,
          label,
          type: 'array',
          baseClass: elementTypeName,
          description: description
        };
        break;

      case EAtomType.Number:
      case EAtomType.Action:
      case EAtomType.Actor:
      case EAtomType.Event:
      case EAtomType.Boolean:
      case EAtomType.Task:
        // Delegate 类型字段
        const typeName = this.getAtomTypeClass(param.AtomType);
        fieldMeta = {
          key,
          label,
          type: 'object',
          baseClass: typeName,
          description: description
        };
        break;

      case EAtomType.Union:
        // Union 类型：检查是否为字符串枚举
        const unionType = param.AtomType as FAtomTypeUnion;
        if (this.isObjectUnionType(unionType)) {
          // 其他 Union 类型：作为对象类型处理
          fieldMeta = {
            key,
            label,
            type: 'object',
            baseClass: typeName,
            description: description
          };
        }
        if (this.isStringEnumUnion(unionType)) {
          // 字符串枚举：转换为 select 类型
          const options = this.extractStringEnumOptions(unionType);
          fieldMeta = {
            key,
            label,
            type: 'select',
            options,
            description: description
          };
        } else {
          
        }
        break;

      case EAtomType.Any:
      case EAtomType.Unknown:
      case EAtomType.Tuple:
      default:
        // 其他对象类型或未知类型
        fieldMeta = {
          key,
          label,
          type: 'string',
          description: description
        };
        break;
    }
    fieldMeta.isRest = param.bRest;
    fieldMeta.isOptional = param.bOptional;

    return fieldMeta;
  }

  static generateMetadataFromMetaJsonConfig(): ClassMetadata[] {
    const decoratorMeta = loadMetadataConfig("AtomDecoratorMetaData.json") as Record<string, ClassMetadata>;
    const RawAtomTSMetaMap = loadMetadataConfig("AtomSystemScriptMetaData.json") as RawAtomTSMetaMap;
    
    // 将 RawAtomTSMetaMap 转换为 ClassMetadata[]
    const convertedMeta = this.convertRawAtomTSMetaToClassMetadata(RawAtomTSMetaMap, decoratorMeta);
    
    return convertedMeta;
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
  ): Record<string, ClassInfo> {
    const registry: Record<string, ClassInfo> = {};

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
        classMeta: classMeta,
      };
    }

    return registry;
  }
}
