import { ClassMetadata } from "../../types/MetaDefine";

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

      // 判断字段类型是否为 array
      if (field.type === 'array') {
        // 对于 array 类型，收集后续所有类型匹配的参数
        const arrayValues: any[] = [];
        while (paramIndex < params.length) {
          const param = params[paramIndex];
          // 如果 array 的元素是对象类型，需要检查是否需要构造
          const processedParam = field.baseClass 
            ? this.processParamByBaseClass(param, field.baseClass)
            : param;
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
        // 普通类型，单个参数对应一个字段
        let paramValue = params[paramIndex];
        
        // 如果字段有 baseClass（对象类型），检查是否需要构造
        if (field.baseClass && field.type === 'object') {
          paramValue = this.processParamByBaseClass(paramValue, field.baseClass);
        }
        
        matched.set(field.key, paramValue);
        paramIndex++;
      }
    }

    return matched;
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
