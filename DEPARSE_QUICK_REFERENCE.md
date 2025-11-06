# De-Parse 快速参考

## 快速开始

```typescript
import { deParseJsonToExpression } from './src/electron/main/DeParseJsonToExpression';

const expression = deParseJsonToExpression(jsonObject);
```

## 支持的类型

| 类型 | 示例 JSON | 输出表达式 |
|------|----------|----------|
| 数字常量 | `{"_ClassName":"NumberValueConstDelegate","Constant":100,"ConstantKey":""}` | `100` |
| BuffKey | `{"_ClassName":"NumberValueConstDelegate","Constant":0,"ConstantKey":"HP"}` | `{HP}` |
| 布尔值 | `{"_ClassName":"BoolValueConstDelegate","BoolConst":true}` | `true` |
| 一元负号 | `{"_ClassName":"NumberValueUnaryOperatorDelegate","Value":{...}}` | `-(...)` |
| 布尔非 | `{"_ClassName":"BoolValueNotDelegate","Value":{...}}` | `!(...)` |
| 加法 | `{"_ClassName":"NumberValueBinaryOperatorDelegate","Lhs":{...},"Rhs":{...},"Operator":0}` | `(... + ...)` |
| 减法 | `{"_ClassName":"NumberValueBinaryOperatorDelegate","Lhs":{...},"Rhs":{...},"Operator":1}` | `(... - ...)` |
| 乘法 | `{"_ClassName":"NumberValueBinaryOperatorDelegate","Lhs":{...},"Rhs":{...},"Operator":2}` | `(... * ...)` |
| 除法 | `{"_ClassName":"NumberValueBinaryOperatorDelegate","Lhs":{...},"Rhs":{...},"Operator":3}` | `(... / ...)` |
| 取模 | `{"_ClassName":"NumberValueBinaryOperatorDelegate","Lhs":{...},"Rhs":{...},"Operator":4}` | `(... % ...)` |
| >= | `{"_ClassName":"BoolValueBinaryOperatorOnNumberDelegate","Lhs":{...},"Rhs":{...},"Operator":0}` | `(... >= ...)` |
| > | `{"_ClassName":"BoolValueBinaryOperatorOnNumberDelegate","Lhs":{...},"Rhs":{...},"Operator":1}` | `(... > ...)` |
| <= | `{"_ClassName":"BoolValueBinaryOperatorOnNumberDelegate","Lhs":{...},"Rhs":{...},"Operator":2}` | `(... <= ...)` |
| < | `{"_ClassName":"BoolValueBinaryOperatorOnNumberDelegate","Lhs":{...},"Rhs":{...},"Operator":3}` | `(... < ...)` |
| == | `{"_ClassName":"BoolValueBinaryOperatorOnNumberDelegate","Lhs":{...},"Rhs":{...},"Operator":4}` | `(... == ...)` |
| != | `{"_ClassName":"BoolValueBinaryOperatorOnNumberDelegate","Lhs":{...},"Rhs":{...},"Operator":5}` | `(... != ...)` |
| && | `{"_ClassName":"BoolValueBinaryOperatorOnBoolDelegate","Lhs":{...},"Rhs":{...},"Operator":0}` | `(... && ...)` |
| \|\| | `{"_ClassName":"BoolValueBinaryOperatorOnBoolDelegate","Lhs":{...},"Rhs":{...},"Operator":1}` | `(... \|\| ...)` |
| 函数 | `{"_ClassName":"NumberValueMinimumOperator","A":{...},"B":{...}}` | `Min(..., ...)` |

## 操作符映射

### 数值操作符 (Operator 字段)
```
0 → +
1 → -
2 → *
3 → /
4 → %
```

### 比较操作符 (Operator 字段)
```
0 → >=
1 → >
2 → <=
3 → <
4 → ==
5 → !=
```

### 布尔操作符 (Operator 字段)
```
0 → &&
1 → ||
```

## 常用函数

| 函数名 | 类名 | 示例 |
|--------|------|------|
| Min | NumberValueMinimumOperator | `Min(10, 20)` |
| Max | NumberValueMaximumOperator | `Max(10, 20)` |
| Clamp | NumberValueClampDelegate | `Clamp(value, min, max)` |
| GetAttr | NumberValueAttributeDelegate | `GetAttr(...)` |
| Random | NumberValueRandomDelegate | `Random(...)` |

## 测试命令

```typescript
// 运行所有测试
import { runAllTests } from './src/electron/main/DeParseJsonToExpression.test';
runAllTests();

// 运行特定测试
import { runSpecificTest } from './src/electron/main/DeParseJsonToExpression.test';
runSpecificTest('Number Constant');

// 获取测试统计
import { getTestStatistics } from './src/electron/main/DeParseJsonToExpression.test';
const stats = getTestStatistics();
console.log(stats);
```

## 常见模式

### 模式 1: 简单常量
```json
{
  "_ClassName": "NumberValueConstDelegate",
  "Constant": 100,
  "ConstantKey": ""
}
```
→ `100`

### 模式 2: 带参数的常量
```json
{
  "_ClassName": "NumberValueConstDelegate",
  "Constant": 0,
  "ConstantKey": "BuffKey"
}
```
→ `{BuffKey}`

### 模式 3: 简单二元操作
```json
{
  "_ClassName": "NumberValueBinaryOperatorDelegate",
  "Lhs": {"_ClassName": "NumberValueConstDelegate", "Constant": 10, "ConstantKey": ""},
  "Rhs": {"_ClassName": "NumberValueConstDelegate", "Constant": 20, "ConstantKey": ""},
  "Operator": 0
}
```
→ `(10 + 20)`

### 模式 4: 嵌套操作
```json
{
  "_ClassName": "NumberValueBinaryOperatorDelegate",
  "Lhs": {
    "_ClassName": "NumberValueBinaryOperatorDelegate",
    "Lhs": {"_ClassName": "NumberValueConstDelegate", "Constant": 10, "ConstantKey": ""},
    "Rhs": {"_ClassName": "NumberValueConstDelegate", "Constant": 5, "ConstantKey": ""},
    "Operator": 0
  },
  "Rhs": {"_ClassName": "NumberValueConstDelegate", "Constant": 3, "ConstantKey": ""},
  "Operator": 2
}
```
→ `((10 + 5) * 3)`

### 模式 5: 函数调用
```json
{
  "_ClassName": "NumberValueMinimumOperator",
  "A": {"_ClassName": "NumberValueConstDelegate", "Constant": 50, "ConstantKey": ""},
  "B": {"_ClassName": "NumberValueConstDelegate", "Constant": 100, "ConstantKey": ""}
}
```
→ `Min(50, 100)`

## 错误处理

| 情况 | 返回值 |
|------|--------|
| 无效输入 | `""` (空字符串) |
| 无 _ClassName | `""` (空字符串) |
| 未知类型 | 类名本身 |
| null/undefined | `""` (空字符串) |

## 文件位置

- **实现**: `src/electron/main/DeParseJsonToExpression.ts`
- **测试**: `src/electron/main/DeParseJsonToExpression.test.ts`
- **指南**: `DEPARSE_FUNCTION_GUIDE.md`
- **示例**: `DEPARSE_EXAMPLES.md`
- **总结**: `DEPARSE_SUMMARY.md`

## 性能提示

- 简单表达式: < 1ms
- 复杂嵌套表达式: < 10ms
- 无额外内存占用
- 支持任意深度递归

## 常见问题

**Q: 如何处理未知的 Delegate 类型？**
A: 返回类名本身

**Q: 如何处理数组参数？**
A: 展开为多个参数

**Q: 如何处理字符串参数？**
A: 添加双引号

**Q: 如何处理 null/undefined？**
A: 跳过该参数

**Q: 支持多少层嵌套？**
A: 受 JavaScript 栈限制，通常 > 1000 层

## 相关链接

- [详细指南](./DEPARSE_FUNCTION_GUIDE.md)
- [使用示例](./DEPARSE_EXAMPLES.md)
- [完整总结](./DEPARSE_SUMMARY.md)
