/**
 * 动态对象表单类型定义
 */

import { ActionDelegate, ActorValueDelegate, BoolValueDelegate, EventDelegateEx, NumberValueDelegate, TaskDelegate } from "../electron/main/MHTsAtomSystemUtils";

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

export type BaseClassType = 'string' | 'number' | 'boolean' |
'NumberValueDelegate' | 'BoolValueDelegate' | 'ActorValueDelegate' | 'EventDelegateEx' | 'ActionDelegate' | 'TaskDelegate';
export type BaseClassNativeType = 'string' | 'number' | 'boolean';

export function isBaseClassNative(type: BaseClassType | undefined): boolean {
  return type === 'string' || type === 'number' || type === 'boolean';
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
      baseClass?: BaseClassType;
      isOptional?: boolean;
      isRest?: boolean;
    }
  | {
      key: string;
      label: string;
      type: 'select';
      baseClass?: BaseClassType;
      options: Array<{ label: string; value: any }>;
      description?: string;
      isOptional?: boolean;
      isRest?: boolean;
    }
  | {
      key: string;
      label: string;
      type: 'object';
      baseClass: BaseClassType;
      description?: string;
      isOptional?: boolean;
      isRest?: boolean;
    }
  | {
      key: string;
      label: string;
      type: 'array';
      baseClass?: BaseClassType;
      description?: string;
      isOptional?: boolean;
      isRest?: boolean;
    }
  | {
      key: string;
      label: string;
      type: string;
      baseClass?: BaseClassType;
      description?: string;
      options?: Array<{ label: string; value: any }>;
      isOptional?: boolean;
      isRest?: boolean;
    };

/**
 * 类元数据 - 包含类的完整信息
 */
export interface ClassMetadata {
  // // for editor
  // delegateKey: string;

  className: string;
  funcName:string;
  displayName: string;
  category?: string;
  richDescription?: string;
  isDelegate?: boolean;
  description?: string;
  baseClass: BaseClassType;
  fields: FieldMeta[];
}

/**
 * 类信息 - 用于编辑器UI
 */
export interface ClassInfo {
  displayName: string;
  baseClass: string;
  fields: Record<string, FieldMeta>;
  classMeta: ClassMetadata;
}

/**
 * 类注册表 - 映射类名到类信息
 */
export type ClassRegistry = Record<string, ClassInfo>;


export interface ScriptFunctionParameterMetaData {
  readonly ParentAtomClassName: string;
  readonly OrdinalIndex: number;
  readonly bRest: boolean;
  readonly bOptional: boolean;
  readonly bLastParameter: boolean;
  readonly ParameterName: string;
  readonly AtomType: FAtomTypeBase;
  readonly TypeString: string;
}

export interface ScriptFunctionMetaData {
  readonly AtomClassName: string;
  readonly FunctionName: string;
  readonly AtomType: AtomFunctionCallExpressionType;
  readonly ParameterList: readonly ScriptFunctionParameterMetaData[];
}

export enum EAtomType {
  Unknown,
  Any,
  Union,
  Tuple,
  Array,

  SpecificString,
  SpecificNumber,
  SpecificBoolean,

  LiteralString,
  LiteralNumber,
  LiteralBoolean,

  Number,
  Boolean,
  Action,
  Actor,
  Event,

  Task
}


// 从ts ast分析出的元信息结构

export interface FAtomTypeBase {
  readonly AtomType: EAtomType;
}

export interface FAtomTypeUnion extends FAtomTypeBase {
  readonly AtomType: EAtomType.Union;
  readonly UnionTypes: readonly FAtomTypeBase[];
}

interface FAtomTypeTuple extends FAtomTypeBase {
  readonly AtomType: EAtomType.Tuple;
  readonly TupleTypes: readonly FAtomTypeBase[];
}

export interface FAtomTypeArray extends FAtomTypeBase {
  readonly AtomType: EAtomType.Array;
  readonly ElementType: FAtomTypeBase;
}

// todo 考虑是否禁用这个
interface FAtomTypeLiteralString extends FAtomTypeBase {
  readonly AtomType: EAtomType.LiteralString;
}

interface FAtomTypeSpecificString extends FAtomTypeBase {
  readonly AtomType: EAtomType.SpecificString;
  readonly SpecificString: string;
}

interface FAtomTypeLiteralNumber extends FAtomTypeBase {
  readonly AtomType: EAtomType.LiteralNumber;
}

interface FAtomTypeSpecificNumber extends FAtomTypeBase {
  readonly AtomType: EAtomType.SpecificNumber;
  readonly SpecificNumber: number;
}

interface FAtomTypeLiteralBoolean extends FAtomTypeBase {
  readonly AtomType: EAtomType.LiteralBoolean;
}

const LiteralTrue: readonly string[] = ['true', 'True', 'TRUE'];
const LiteralFalse: readonly string[] = ['false', 'False', 'FALSE'];

function ExpressionIsLiteralTrue(expr: any): boolean {
  return LiteralTrue.includes(expr);
}

function ExpressionIsLiteralFalse(expr: any): boolean {
  return LiteralFalse.includes(expr);
}

function ExpressionIsLiteralBoolean(expr: any): boolean {
  return ExpressionIsLiteralFalse(expr) || ExpressionIsLiteralTrue(expr);
}

type AtomFunctionCallExpressionType =
  | EAtomType.Number
  | EAtomType.Boolean
  | EAtomType.Action
  | EAtomType.Actor
  | EAtomType.Event
  | EAtomType.Task;

interface FAtomTypeFunctionBase extends FAtomTypeBase {
  readonly AtomType: AtomFunctionCallExpressionType;
}

interface FAtomTypeActor extends FAtomTypeBase {
  readonly AtomType: EAtomType.Actor;
}

interface FAtomTypeBoolean extends FAtomTypeBase {
  readonly AtomType: EAtomType.Boolean;
}

interface FAtomTypeNumber extends FAtomTypeBase {
  readonly AtomType: EAtomType.Number;
}

interface FAtomTypeAction extends FAtomTypeBase {
  readonly AtomType: EAtomType.Action;
}

interface FAtomTypeEvent extends FAtomTypeBase {
  readonly AtomType: EAtomType.Event;
}

interface FAtomTypeAny extends FAtomTypeBase {
  readonly AtomType: EAtomType.Any;
}

interface FAtomTypeUnknown extends FAtomTypeBase {
  readonly AtomType: EAtomType.Unknown;
}

export type RawAtomTSMetaMap = Record<string, ScriptFunctionMetaData>;