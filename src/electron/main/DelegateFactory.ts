import { ClassMetadata, FieldMeta, BaseClassType, getFieldMetaTypeList, resolveFieldMetaTypeByValue, isBaseClassNative } from "../../types/MetaDefine";

export interface DelegateMetadataRegistry {
  byClassName: Record<string, ClassMetadata>;
  byDelegateKey: Record<string, ClassMetadata>;
}

/**
 * 基于元数据的 Delegate 工厂
 * 通过元信息而非直接构造函数引用来创建对象
 */
export class DelegateFactory {
  private static metadataRegistry: DelegateMetadataRegistry;

  /**
   * 初始化工厂 - 从元数据配置生成注册表
   */
  static initialize(byClassName: Record<string, ClassMetadata>, byDelegateKey: Record<string, ClassMetadata>): void {
    this.metadataRegistry = {
      byClassName: byClassName,
      byDelegateKey: byDelegateKey,
    };
  }

  /**
   * 根据委托名称创建对象
   */
  static createByDelegateKey(delegateKey: string, params: any[]): any {
    const meta = this.metadataRegistry.byDelegateKey[delegateKey];
    if (!meta) {
      throw new Error(`Unknown delegate: ${delegateKey}`);
    }
    return this.createFromMetadata(meta, params);
  }

  /**
   * 根据类名创建对象
   */
  static createByClassName(className: string, params: any[]): any {
    const meta = this.metadataRegistry.byClassName[className];
    if (!meta) {
      throw new Error(`Unknown class: ${className}`);
    }
    return this.createFromMetadata(meta, params);
  }

  /**
   * 核心创建逻辑 - 基于元数据
   */
  private static createFromMetadata(
    meta: ClassMetadata,
    params: any[]
  ): any {
    // 验证参数数量
    const expectedParamCount = meta.fields.filter((f) => !f.isOptional).length;
    if (params.length < expectedParamCount) {
      throw new Error(
        `[${meta.className}] expected ${expectedParamCount} params but got ${params.length}`
      );
    }

    // 构建参数对象
    const constructorArgs = this.matchParamsToFields(meta, params);

    // 通过 eval 或其他动态构造方式创建对象
    return this.dynamicallyConstruct(meta, constructorArgs);
  }

  /**
   * 参数匹配 - 将参数列表与字段对应
   * 对于 array 类型字段，将后续所有符合类型的参数作为该字段的值
   * 对于 object 类型且 baseClass 为委托类型的字段，如果参数不是对象则自动构造
   */
  private static matchParamsToFields(
    meta: ClassMetadata,
    params: any[]
  ): Map<string, any> {
    const matched = new Map<string, any>();
    let paramIndex = 0;

    for (let i = 0; i < meta.fields.length && paramIndex < params.length; i++) {
      const field = meta.fields[i];
      const supportedTypes = getFieldMetaTypeList(field);
      const isPureArrayField = supportedTypes.length === 1 && supportedTypes[0] === 'array';

      if (isPureArrayField) {
        // 对于 array 类型，收集后续所有类型匹配的参数
        const arrayValues: any[] = [];
        while (paramIndex < params.length) {
          const param = params[paramIndex];
          const processedParam = field.baseClass
            ? this.processParamByBaseClass(param, field.baseClass)
            : param;
          // 校验数组元素类型
          this.validateParamType(field, processedParam, meta, paramIndex);
          arrayValues.push(processedParam);
          paramIndex++;
        }

        if (arrayValues.length === 0 && !field.isOptional) {
          throw new Error(
            `[${meta.className}] array field "${field.key}" requires at least one element`
          );
        }

        matched.set(field.key, arrayValues);
      } else {
        let paramValue = params[paramIndex];
        const resolvedType = resolveFieldMetaTypeByValue(field, paramValue);

        if (field.baseClass && resolvedType === 'object') {
          paramValue = this.processParamByBaseClass(paramValue, field.baseClass);
        }

        // 校验参数类型
        this.validateParamType(field, paramValue, meta, paramIndex);

        matched.set(field.key, paramValue);
        paramIndex++;
      }
    }

    return matched;
  }

  /**
   * 校验参数类型是否与字段期望的类型匹配
   *
   * 检查维度：
   * 1. 原生类型（string/number/boolean）：typeof 直接比对
   * 2. 委托类型（NumberValueDelegate/BoolValueDelegate/ActionDelegate 等）：
   *    通过参数对象的 _ClassName 反查其 baseClass，与字段期望的 baseClass 比对
   * 3. 枚举值（有 options 时）：检查值是否在允许列表中
   */
  private static validateParamType(
    field: FieldMeta,
    paramValue: any,
    meta: ClassMetadata,
    paramIndex: number
  ): void {
    // 无类型约束的字段跳过
    if (!field.baseClass) {
      return;
    }

    // null/undefined 跳过（由参数数量检查兜底）
    if (paramValue === null || paramValue === undefined) {
      return;
    }

    // === 1. 原生类型检查 ===
    if (isBaseClassNative(field.baseClass)) {
      const actualType = typeof paramValue;
      // 对象类型的委托值（如 NumberValueConst 实例）传给 number 位也合法
      // 因为 processParamByBaseClass 可能没转换成功，但原始 number/string/boolean 不匹配就报错
      if (actualType !== 'object' && actualType !== field.baseClass) {
        throw new Error(
          `[${meta.className}] 参数 "${field.key}"(第${paramIndex + 1}个) 期望类型 "${field.baseClass}"，实际传入类型 "${actualType}"`
        );
      }
      return;
    }

    // === 2. 委托类型检查 ===
    // 只对对象类型参数做委托基类校验
    if (typeof paramValue === 'object' && paramValue !== null && paramValue._ClassName) {
      const paramMeta = this.metadataRegistry.byClassName[paramValue._ClassName];
      if (paramMeta && paramMeta.baseClass) {
        const expectedBaseClass = field.baseClass as BaseClassType;
        const actualBaseClass = paramMeta.baseClass;

        if (actualBaseClass !== expectedBaseClass) {
          // 获取可读名称
          const paramDisplayName = paramMeta.funcName || paramMeta.className;
          throw new Error(
            `[${meta.className}] 参数 "${field.key}"(第${paramIndex + 1}个) 期望类型 "${expectedBaseClass}"，` +
            `实际传入 "${paramDisplayName}" 的类型为 "${actualBaseClass}"`
          );
        }
      }
    }

    // === 3. 枚举值检查 ===
    if (field.options && field.options.length > 0 && typeof paramValue === 'string') {
      const validValues = field.options.map(o => String(o.value));
      if (!validValues.includes(paramValue)) {
        // 如果字段支持可编辑（selectEditable），仅输出警告不阻断
        if ((field as any).selectEditable) {
          console.warn(
            `[${meta.className}] 参数 "${field.key}"(第${paramIndex + 1}个) 值 "${paramValue}" 不在预设选项中: [${validValues.slice(0, 5).join(', ')}${validValues.length > 5 ? '...' : ''}]`
          );
        } else {
          throw new Error(
            `[${meta.className}] 参数 "${field.key}"(第${paramIndex + 1}个) 值 "${paramValue}" 不在允许的选项中: [${validValues.slice(0, 10).join(', ')}${validValues.length > 10 ? '...' : ''}]`
          );
        }
      }
    }
  }

  /**
   * 根据 baseClass 处理参数值
   * 如果参数不是对象且 baseClass 是委托类型，则自动构造相应的委托对象
   */
  private static processParamByBaseClass(param: any, baseClass: string): any {
    // 如果参数已经是对象，直接返回
    if (typeof param === 'object' && param !== null) {
      return param;
    }

    // 映射 baseClass 到对应的常量代理类型
    const delegateKeyMap: Record<string, string> = {
      'NumberValueDelegate': 'NumberValueConst',
      'BoolValueDelegate': 'BoolValueConst',
    };

    const delegateKey = delegateKeyMap[baseClass];
    if (!delegateKey) {
      // 如果不在映射表中，无法构造，返回原值
      return param;
    }

    // 根据不同的类型参数构造相应的委托对象
    try {
      if (baseClass === 'NumberValueDelegate' && typeof param === 'number' || 
        baseClass === 'BoolValueDelegate' && typeof param === 'boolean'
      ) {
        return this.createByDelegateKey(delegateKey, [param]);
      }
    } catch (error) {
      console.warn(
        `[DelegateFactory] Failed to construct ${baseClass} with value ${param}:`,
        error
      );
      return param;
    }

    return param;
  }

  /**
   * 动态构造 - 使用原型链和属性注入
   */
  private static dynamicallyConstruct(
    meta: ClassMetadata,
    args: Map<string, any>
  ): any {
    // 方案 1: 使用 Reflect 和原型链（推荐）
    const instance = Object.create(Object.prototype);
    instance._ClassName = meta.className;

    // 注入字段值
    for (const [fieldKey, value] of args) {
      instance[fieldKey] = value;
    }

    return instance;
  }

  /**
   * 获取元数据（用于调试或UI展示）
   */
  static getMetadataByDelegateName(delegateName: string): ClassMetadata | undefined {
    return this.metadataRegistry.byClassName[delegateName];
  }

    /**
   * 获取元数据（用于调试或UI展示）
   */
  static getMetadataByFuncName(funcName: string): ClassMetadata | undefined {
    return this.metadataRegistry.byDelegateKey[funcName];
  }
}
