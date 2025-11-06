# De-Parse JSON to Expression Function Guide

## 概述

De-Parse 函数用于将 JSON 对象反向解析为表达式字符串。这是表达式解析的逆过程，允许用户查看 JSON 配置对应的表达式形式。

## 核心函数

### `deParseJsonToExpression(jsonObject: any): string`

主要的反向解析函数，支持以下类型的转换：

#### 1. 常量值
- **NumberValueConstDelegate**: 数字常量
  ```json
  {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 100,
    "ConstantKey": ""
  }
  ```
  解析为: `100`

- **NumberValueConstDelegate with Key**: 带 BuffKey 的数字常量
  ```json
  {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 0,
    "ConstantKey": "BuffKey"
  }
  ```
  解析为: `{BuffKey}`

- **BoolValueConstDelegate**: 布尔常量
  ```json
  {
    "_ClassName": "BoolValueConstDelegate",
    "BoolConst": true
  }
  ```
  解析为: `true`

#### 2. 一元操作符
- **NumberValueUnaryOperatorDelegate**: 一元负号
  ```json
  {
    "_ClassName": "NumberValueUnaryOperatorDelegate",
    "Value": { "_ClassName": "NumberValueConstDelegate", "Constant": 50, "ConstantKey": "" }
  }
  ```
  解析为: `-(50)`

- **BoolValueNotDelegate**: 布尔非
  ```json
  {
    "_ClassName": "BoolValueNotDelegate",
    "Value": { "_ClassName": "BoolValueConstDelegate", "BoolConst": true }
  }
  ```
  解析为: `!(true)`

#### 3. 二元操作符（数值）
- **NumberValueBinaryOperatorDelegate**: 支持 +, -, *, /, %
  ```json
  {
    "_ClassName": "NumberValueBinaryOperatorDelegate",
    "Lhs": { "_ClassName": "NumberValueConstDelegate", "Constant": 10, "ConstantKey": "" },
    "Rhs": { "_ClassName": "NumberValueConstDelegate", "Constant": 20, "ConstantKey": "" },
    "Operator": 0
  }
  ```
  解析为: `(10 + 20)`

  操作符映射：
  - 0: `+` (加法)
  - 1: `-` (减法)
  - 2: `*` (乘法)
  - 3: `/` (除法)
  - 4: `%` (取模)

#### 4. 比较操作符
- **BoolValueBinaryOperatorOnNumberDelegate**: 支持 >=, >, <=, <, ==, !=
  ```json
  {
    "_ClassName": "BoolValueBinaryOperatorOnNumberDelegate",
    "Lhs": { "_ClassName": "NumberValueConstDelegate", "Constant": 50, "ConstantKey": "" },
    "Rhs": { "_ClassName": "NumberValueConstDelegate", "Constant": 30, "ConstantKey": "" },
    "Operator": 0
  }
  ```
  解析为: `(50 >= 30)`

  操作符映射：
  - 0: `>=` (大于等于)
  - 1: `>` (大于)
  - 2: `<=` (小于等于)
  - 3: `<` (小于)
  - 4: `==` (等于)
  - 5: `!=` (不等于)

#### 5. 布尔操作符
- **BoolValueBinaryOperatorOnBoolDelegate**: 支持 &&, ||
  ```json
  {
    "_ClassName": "BoolValueBinaryOperatorOnBoolDelegate",
    "Lhs": { "_ClassName": "BoolValueConstDelegate", "BoolConst": true },
    "Rhs": { "_ClassName": "BoolValueConstDelegate", "BoolConst": false },
    "Operator": 0
  }
  ```
  解析为: `(true && false)`

  操作符映射：
  - 0: `&&` (逻辑与)
  - 1: `||` (逻辑或)

#### 6. 函数调用
- **Min/Max 函数**
  ```json
  {
    "_ClassName": "NumberValueMinimumOperator",
    "A": { "_ClassName": "NumberValueConstDelegate", "Constant": 50, "ConstantKey": "" },
    "B": { "_ClassName": "NumberValueConstDelegate", "Constant": 100, "ConstantKey": "" }
  }
  ```
  解析为: `Min(50, 100)`

- **其他函数**: 通过 `FunctionNameToDelegate` 映射自动查找函数名

## 使用方法

### 在代码中使用

```typescript
import { deParseJsonToExpression } from './src/electron/main/DeParseJsonToExpression';

const jsonObject = {
  _ClassName: 'NumberValueConstDelegate',
  Constant: 100,
  ConstantKey: ''
};

const expression = deParseJsonToExpression(jsonObject);
console.log(expression); // 输出: 100
```

### 在 UI 中使用

1. 在应用中打开 JSON 编辑区域
2. 输入或粘贴包含 `_ClassName` 的 JSON 对象
3. 点击"解析为表达式"按钮
4. 查看生成的表达式

## 测试

### 运行所有测试

```typescript
import { runAllTests } from './src/electron/main/DeParseJsonToExpression.test';

runAllTests();
```

### 运行特定测试

```typescript
import { runSpecificTest } from './src/electron/main/DeParseJsonToExpression.test';

runSpecificTest('Number Constant');
```

### 获取测试统计

```typescript
import { getTestStatistics } from './src/electron/main/DeParseJsonToExpression.test';

const stats = getTestStatistics();
console.log(stats);
// 输出:
// {
//   total: 30,
//   categories: {
//     'Constant': 4,
//     'Unary Operator': 2,
//     'Binary Operator': 5,
//     'Comparison': 6,
//     'Boolean Operator': 2,
//     'Complex Expression': 1,
//     'Function Call': 2
//   }
// }
```

## 测试用例

共包含 30+ 个测试用例，覆盖以下场景：

### 常量值测试 (4 个)
- 数字常量
- 带 BuffKey 的数字常量
- 布尔值 true
- 布尔值 false

### 一元操作符测试 (2 个)
- 一元负号
- 布尔非

### 二元操作符测试 (5 个)
- 加法
- 减法
- 乘法
- 除法
- 取模

### 比较操作符测试 (6 个)
- 大于等于
- 大于
- 小于等于
- 小于
- 等于
- 不等于

### 布尔操作符测试 (2 个)
- 逻辑与
- 逻辑或

### 复杂表达式测试 (1 个)
- 嵌套表达式

### 函数调用测试 (2 个)
- Min 函数
- Max 函数

## 实现细节

### 参数提取

函数使用 `getConstructorParamNames` 从构造函数中提取参数名称，确保参数顺序正确。

### 递归处理

支持嵌套对象的递归处理，允许复杂的表达式树结构。

### 数组处理

对于数组参数，函数会展开数组元素并作为多个参数传递。

### 错误处理

- 如果找不到对应的函数名，返回类名本身
- 如果 JSON 对象无效，返回空字符串
- 所有错误都会被捕获并记录到控制台

## 性能优化

- 使用缓存的反向映射提高查找效率
- 避免重复的字符串操作
- 支持优化版本 `deParseJsonToExpressionOptimized`

## 注意事项

1. 确保 JSON 对象包含有效的 `_ClassName` 字段
2. 类名必须在 `FunctionNameToDelegate` 映射中存在
3. 参数名称必须与构造函数参数名称匹配
4. 嵌套对象也必须包含有效的 `_ClassName` 字段
5. 操作符枚举值必须与 `OperatorStringToOperatorEnumInAtomSystem` 映射一致

## 扩展

要添加新的 Delegate 类型支持：

1. 在 `deParseJsonToExpression` 函数中添加新的 `if` 分支
2. 实现相应的解析逻辑
3. 添加对应的测试用例
4. 更新此文档

## 相关文件

- `DeParseJsonToExpression.ts`: 核心实现
- `DeParseJsonToExpression.test.ts`: 测试用例
- `DelegateDecorators.ts`: 参数提取工具
- `MHTsAtomSystemUtils.ts`: FunctionNameToDelegate 映射
