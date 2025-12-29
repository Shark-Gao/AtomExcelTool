/**
 * UE类型定义和枚举
 * 用于解决TypeScript编译时的类型检查错误
 */

// ============ 枚举定义 ============
export namespace ue {
  export enum EMHBoolTriggerValueBinaryOperatorOnBool {
    LogicalAnd = 0,
    LogicalOr = 1,
  }

  export enum EMHBoolTriggerValueBinaryOperatorOnNumber {
    Greater=0,
    GreaterEqual=1,
    Less=2,
    LessEqual=3,
    EqualTo=4,
    NotEqualTo=5
  }

  export enum EMHNumberTriggerValueBinaryOperator {
    Plus=0,
    Minus=1,
    Multiplies=2,
    Divides=3,
    Modulus=4,
    Min=5,
    Max=6
  }

}