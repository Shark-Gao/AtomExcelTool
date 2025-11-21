// import { FunctionNameToDelegate } from './MHTsAtomSystemUtils';
import { DelegateFactory } from './DelegateFactory';

export interface DeParseExpressonType {
  expression: string;
  expressionDesc: string;
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
export function deParseJsonToExpression(jsonObject: any, isRoot = true): DeParseExpressonType {
  if (!jsonObject || typeof jsonObject !== 'object') {
    return {expression:'', expressionDesc:''};
  }

  const className = jsonObject._ClassName;
  if (!className) {
    return {expression:'', expressionDesc:''};
  }

  // 处理常量值
  if (className === 'NumberValueConstDelegate') {
    const constant = jsonObject.Constant;
    const constantKey = jsonObject.ConstantKey;
    
    if (constantKey && constantKey.trim()) {
      // 如果有 ConstantKey，返回 {key} 格式
      return {expression:`{${constantKey}}`, expressionDesc:`${constantKey}`};
    }
    
    return {expression:String(constant), expressionDesc:`${constant}`};
  }

  if (className === 'BoolValueConstDelegate') {
    return {expression:String(jsonObject.BoolConst), expressionDesc:`${jsonObject.BoolConst}`};
  }

  // 处理一元操作符
  if (className === 'NumberValueUnaryOperatorDelegate') {
    const operand = deParseJsonToExpression(jsonObject.Value, false);
    return {expression:`-(${operand.expression})`, expressionDesc:`-(${operand.expressionDesc})`};
  }

  if (className === 'BoolValueNotDelegate') {
    const operand = deParseJsonToExpression(jsonObject.Value, false);
    return {expression:`!(${operand.expression})`, expressionDesc:`!(${operand.expressionDesc})`};
  }

  // 处理二元操作符（数值）
  if (className === 'NumberValueBinaryOperatorDelegate') {
    const lhs = deParseJsonToExpression(jsonObject.lhs, false);
    const rhs = deParseJsonToExpression(jsonObject.rhs, false);
    const operator = getOperatorString(jsonObject.operator, 'number');
    return {expression:`(${lhs.expression} ${operator} ${rhs.expression})`, expressionDesc:`(${lhs.expressionDesc} ${operator} ${rhs.expressionDesc})`};
  }

  // 处理二元操作符（布尔值）
  if (className === 'BoolValueBinaryOperatorOnBoolDelegate') {
    const lhs = deParseJsonToExpression(jsonObject.lhs, false);
    const rhs = deParseJsonToExpression(jsonObject.rhs, false);
    const operator = getOperatorString(jsonObject.operator, 'bool');
    return {expression:`(${lhs.expression} ${operator} ${rhs.expression})`, expressionDesc:`(${lhs.expressionDesc} ${operator} ${rhs.expressionDesc})`};;
  }

  // 处理二元操作符（数值比较）
  if (className === 'BoolValueBinaryOperatorOnNumberDelegate') {
    const lhs = deParseJsonToExpression(jsonObject.lhs, false);
    const rhs = deParseJsonToExpression(jsonObject.rhs, false);
    const operator = getOperatorString(jsonObject.operator, 'compare');
    return {expression:`(${lhs.expression} ${operator} ${rhs.expression})`, expressionDesc:`(${lhs.expressionDesc} ${operator} ${rhs.expressionDesc})`};
  }

  // 处理函数调用
  const functionName = findFunctionNameByClassName(className);
  if (functionName) {
    return buildFunctionCall(functionName, className, jsonObject, isRoot);
  }

  // 如果找不到对应的函数名，返回类名
  return {expression:className, expressionDesc:className};
}

/**
 * 根据类名查找函数名（使用缓存）
 */
function findFunctionNameByClassName(className: string): string | null {
  const metadata = DelegateFactory.getMetadataByDelegateName(className);
  return metadata?.funcName ?? null;
}

/**
 * 构建函数调用表达式
 */
function buildFunctionCall(functionName: string, className: string, jsonObject: any, isRoot: boolean): DeParseExpressonType {
  const ClassMetadata = DelegateFactory.getMetadataByFuncName(functionName);// FunctionNameToDelegate.get(functionName);
  if (!ClassMetadata) {
    return {expression:functionName, expressionDesc:functionName};
  }

  
  // 获取参数名称
  const fields = ClassMetadata.fields;//getConstructorParamNames(delegateClass);
  const params: DeParseExpressonType[] = [];

  // 为每个参数生成表达式
  for (const field of fields) {
    const paramValue = jsonObject[field.key];

    if (paramValue === undefined || paramValue === null) {
      continue;
    }

    if (Array.isArray(paramValue)) {
      // 处理数组参数
      const arrayElements = paramValue.map(item => deParseJsonToExpression(item, false));
      params.push(...arrayElements);
    } else if (typeof paramValue === 'object') {
      // 递归处理嵌套对象
      const nestedExpression = deParseJsonToExpression(paramValue, false);
      if (nestedExpression) {
        params.push(nestedExpression);
      }
    } else if (typeof paramValue === 'string') {
      // 字符串需要加引号
      params.push({expression:`"${paramValue}"`, expressionDesc:`${paramValue}`});
    } else {
      // 数字、布尔值等直接转换
      params.push({expression:String(paramValue), expressionDesc:`${paramValue}`});
    }
  }

  // 构建函数调用表达式
//   if (params.length === 0) {
//     return functionName;
//   }

  const paramExpressions = params.map(param => param.expression);

  if (isRoot && isCombineActionsFunction(functionName, className) && params.length > 1) {
    const combinedExpressionDesc = params.map(param => param.expressionDesc).join(';');
    return { expression: paramExpressions.join(';'), expressionDesc: combinedExpressionDesc };
  }

  const richDescription = ClassMetadata.richDescription;
  let expressionDesc = richDescription ?? `${functionName}(${paramExpressions.join(', ')})`;
  for (let i = 0; i < params.length; i++) {
    expressionDesc = expressionDesc.replace(`{${i}}`, `${params[i].expressionDesc}`);
  }
  
  return {expression:`${functionName}(${paramExpressions.join(', ')})`, expressionDesc:expressionDesc};
}

function isCombineActionsFunction(functionName: string, className: string): boolean {
  const normalized = (functionName || '').toLowerCase();
  if (normalized === 'combineactions' || normalized === 'combineaction') {
    return true;
  }
  return className === 'ActionTakeActionsExDelegate';
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
export function deParseJsonToExpressionOptimized(jsonObject: any): DeParseExpressonType {
  return deParseJsonToExpression(jsonObject);
}
