import { FunctionNameToDelegate } from './MHTsAtomSystemUtils';
import { getConstructorParamNames } from './DelegateDecorators';

/**
 * 类名到函数名的缓存映射
 * 在第一次调用时初始化，之后直接使用缓存数据
 */
let classNameToFunctionNameCache: Map<string, string> | null = null;

/**
 * 初始化类名到函数名的缓存映射
 * 只在第一次调用时执行，之后使用缓存数据
 */
function initializeClassNameCache(): Map<string, string> {
  if (classNameToFunctionNameCache === null) {
    classNameToFunctionNameCache = new Map();
    for (const [functionName, delegateClass] of FunctionNameToDelegate.entries()) {
      if (delegateClass.name) {
        classNameToFunctionNameCache.set(delegateClass.name, functionName);
      }
    }
  }
  return classNameToFunctionNameCache;
}

/**
 * 反向解析 JSON 对象为表达式字符串
 * 支持：
 * - 常量值（数字、布尔值、字符串）
 * - 函数调用
 * - 二元操作符
 * - 一元操作符
 * - 嵌套对象
 * 
 * @param jsonObject 包含 _ClassName 的对象
 * @returns 表达式字符串
 */
export function deParseJsonToExpression(jsonObject: any): string {
  if (!jsonObject || typeof jsonObject !== 'object') {
    return '';
  }

  const className = jsonObject._ClassName;
  if (!className) {
    return '';
  }

  // 处理常量值
  if (className === 'NumberValueConstDelegate') {
    const constant = jsonObject.Constant;
    const constantKey = jsonObject.ConstantKey;
    
    if (constantKey && constantKey.trim()) {
      // 如果有 ConstantKey，返回 {key} 格式
      return `{${constantKey}}`;
    }
    
    return String(constant);
  }

  if (className === 'BoolValueConstDelegate') {
    return String(jsonObject.BoolConst);
  }

  // 处理一元操作符
  if (className === 'NumberValueUnaryOperatorDelegate') {
    const operand = deParseJsonToExpression(jsonObject.Value);
    return `-(${operand})`;
  }

  if (className === 'BoolValueNotDelegate') {
    const operand = deParseJsonToExpression(jsonObject.Value);
    return `!(${operand})`;
  }

  // 处理二元操作符（数值）
  if (className === 'NumberValueBinaryOperatorDelegate') {
    const lhs = deParseJsonToExpression(jsonObject.lhs);
    const rhs = deParseJsonToExpression(jsonObject.rhs);
    const operator = getOperatorString(jsonObject.operator, 'number');
    return `(${lhs} ${operator} ${rhs})`;
  }

  // 处理二元操作符（布尔值）
  if (className === 'BoolValueBinaryOperatorOnBoolDelegate') {
    const lhs = deParseJsonToExpression(jsonObject.lhs);
    const rhs = deParseJsonToExpression(jsonObject.rhs);
    const operator = getOperatorString(jsonObject.operator, 'bool');
    return `(${lhs} ${operator} ${rhs})`;
  }

  // 处理二元操作符（数值比较）
  if (className === 'BoolValueBinaryOperatorOnNumberDelegate') {
    const lhs = deParseJsonToExpression(jsonObject.lhs);
    const rhs = deParseJsonToExpression(jsonObject.rhs);
    const operator = getOperatorString(jsonObject.operator, 'compare');
    return `(${lhs} ${operator} ${rhs})`;
  }

  // 处理函数调用
  const functionName = findFunctionNameByClassName(className);
  if (functionName) {
    return buildFunctionCall(functionName, className, jsonObject);
  }

  // 如果找不到对应的函数名，返回类名
  return className;
}

/**
 * 根据类名查找函数名（使用缓存）
 */
function findFunctionNameByClassName(className: string): string | null {
  const cache = initializeClassNameCache();
  return cache.get(className) ?? null;
}

/**
 * 构建函数调用表达式
 */
function buildFunctionCall(functionName: string, className: string, jsonObject: any): string {
  const delegateClass = FunctionNameToDelegate.get(functionName);
  if (!delegateClass) {
    return functionName;
  }

  // 获取参数名称
  const paramNames = getConstructorParamNames(delegateClass);
  const params: string[] = [];

  // 为每个参数生成表达式
  for (const paramName of paramNames) {
    const paramValue = jsonObject[paramName];

    if (paramValue === undefined || paramValue === null) {
      continue;
    }

    if (Array.isArray(paramValue)) {
      // 处理数组参数
      const arrayElements = paramValue.map(item => deParseJsonToExpression(item));
      params.push(...arrayElements);
    } else if (typeof paramValue === 'object') {
      // 递归处理嵌套对象
      const nestedExpression = deParseJsonToExpression(paramValue);
      if (nestedExpression) {
        params.push(nestedExpression);
      }
    } else if (typeof paramValue === 'string') {
      // 字符串需要加引号
      params.push(`"${paramValue}"`);
    } else {
      // 数字、布尔值等直接转换
      params.push(String(paramValue));
    }
  }

  // 构建函数调用表达式
//   if (params.length === 0) {
//     return functionName;
//   }

  return `${functionName}(${params.join(', ')})`;
}

/**
 * 获取操作符字符串
 */
function getOperatorString(operatorEnum: number, type: 'number' | 'bool' | 'compare'): string {
  const operatorMap: Record<string, Record<number, string>> = {
    number: {
      0: '+',
      1: '-',
      2: '*',
      3: '/',
      4: '%',
    },
    bool: {
      0: '&&',
      1: '||',
    },
    compare: {
      0: '>=',
      1: '>',
      2: '<=',
      3: '<',
      4: '==',
      5: '!=',
    },
  };

  return operatorMap[type]?.[operatorEnum] ?? '+';
}

/**
 * 优化版本的反向解析函数，使用缓存的反向映射
 */
export function deParseJsonToExpressionOptimized(jsonObject: any): string {
  return deParseJsonToExpression(jsonObject);
}
