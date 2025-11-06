# De-Parse Function Examples

## 示例 1: 简单数字常量

### JSON 输入
```json
{
  "_ClassName": "NumberValueConstDelegate",
  "Constant": 100,
  "ConstantKey": ""
}
```

### 表达式输出
```
100
```

---

## 示例 2: 带 BuffKey 的数字常量

### JSON 输入
```json
{
  "_ClassName": "NumberValueConstDelegate",
  "Constant": 0,
  "ConstantKey": "MaxHealth"
}
```

### 表达式输出
```
{MaxHealth}
```

---

## 示例 3: 简单算术表达式

### JSON 输入
```json
{
  "_ClassName": "NumberValueBinaryOperatorDelegate",
  "Lhs": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 10,
    "ConstantKey": ""
  },
  "Rhs": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 20,
    "ConstantKey": ""
  },
  "Operator": 0
}
```

### 表达式输出
```
(10 + 20)
```

---

## 示例 4: 复杂算术表达式

### JSON 输入
```json
{
  "_ClassName": "NumberValueBinaryOperatorDelegate",
  "Lhs": {
    "_ClassName": "NumberValueBinaryOperatorDelegate",
    "Lhs": {
      "_ClassName": "NumberValueConstDelegate",
      "Constant": 10,
      "ConstantKey": ""
    },
    "Rhs": {
      "_ClassName": "NumberValueConstDelegate",
      "Constant": 5,
      "ConstantKey": ""
    },
    "Operator": 0
  },
  "Rhs": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 3,
    "ConstantKey": ""
  },
  "Operator": 2
}
```

### 表达式输出
```
((10 + 5) * 3)
```

---

## 示例 5: 比较表达式

### JSON 输入
```json
{
  "_ClassName": "BoolValueBinaryOperatorOnNumberDelegate",
  "Lhs": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 50,
    "ConstantKey": ""
  },
  "Rhs": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 30,
    "ConstantKey": ""
  },
  "Operator": 1
}
```

### 表达式输出
```
(50 > 30)
```

---

## 示例 6: 布尔逻辑表达式

### JSON 输入
```json
{
  "_ClassName": "BoolValueBinaryOperatorOnBoolDelegate",
  "Lhs": {
    "_ClassName": "BoolValueBinaryOperatorOnNumberDelegate",
    "Lhs": {
      "_ClassName": "NumberValueConstDelegate",
      "Constant": 100,
      "ConstantKey": ""
    },
    "Rhs": {
      "_ClassName": "NumberValueConstDelegate",
      "Constant": 50,
      "ConstantKey": ""
    },
    "Operator": 1
  },
  "Rhs": {
    "_ClassName": "BoolValueConstDelegate",
    "BoolConst": true
  },
  "Operator": 0
}
```

### 表达式输出
```
((100 > 50) && true)
```

---

## 示例 7: 函数调用 - Min

### JSON 输入
```json
{
  "_ClassName": "NumberValueMinimumOperator",
  "A": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 50,
    "ConstantKey": ""
  },
  "B": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 100,
    "ConstantKey": ""
  }
}
```

### 表达式输出
```
Min(50, 100)
```

---

## 示例 8: 函数调用 - Max

### JSON 输入
```json
{
  "_ClassName": "NumberValueMaximumOperator",
  "A": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 50,
    "ConstantKey": ""
  },
  "B": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 100,
    "ConstantKey": ""
  }
}
```

### 表达式输出
```
Max(50, 100)
```

---

## 示例 9: 嵌套函数调用

### JSON 输入
```json
{
  "_ClassName": "NumberValueMaximumOperator",
  "A": {
    "_ClassName": "NumberValueMinimumOperator",
    "A": {
      "_ClassName": "NumberValueConstDelegate",
      "Constant": 10,
      "ConstantKey": ""
    },
    "B": {
      "_ClassName": "NumberValueConstDelegate",
      "Constant": 20,
      "ConstantKey": ""
    }
  },
  "B": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 30,
    "ConstantKey": ""
  }
}
```

### 表达式输出
```
Max(Min(10, 20), 30)
```

---

## 示例 10: 一元操作符

### JSON 输入
```json
{
  "_ClassName": "NumberValueUnaryOperatorDelegate",
  "Value": {
    "_ClassName": "NumberValueConstDelegate",
    "Constant": 42,
    "ConstantKey": ""
  }
}
```

### 表达式输出
```
-(42)
```

---

## 示例 11: 布尔非操作符

### JSON 输入
```json
{
  "_ClassName": "BoolValueNotDelegate",
  "Value": {
    "_ClassName": "BoolValueConstDelegate",
    "BoolConst": true
  }
}
```

### 表达式输出
```
!(true)
```

---

## 示例 12: 复杂嵌套表达式

### JSON 输入
```json
{
  "_ClassName": "BoolValueBinaryOperatorOnBoolDelegate",
  "Lhs": {
    "_ClassName": "BoolValueBinaryOperatorOnNumberDelegate",
    "Lhs": {
      "_ClassName": "NumberValueBinaryOperatorDelegate",
      "Lhs": {
        "_ClassName": "NumberValueConstDelegate",
        "Constant": 10,
        "ConstantKey": ""
      },
      "Rhs": {
        "_ClassName": "NumberValueConstDelegate",
        "Constant": 5,
        "ConstantKey": ""
      },
      "Operator": 0
    },
    "Rhs": {
      "_ClassName": "NumberValueConstDelegate",
      "Constant": 15,
      "ConstantKey": ""
    },
    "Operator": 4
  },
  "Rhs": {
    "_ClassName": "BoolValueNotDelegate",
    "Value": {
      "_ClassName": "BoolValueConstDelegate",
      "BoolConst": false
    }
  },
  "Operator": 0
}
```

### 表达式输出
```
(((10 + 5) == 15) && !(false))
```

---

## 操作符参考

### 数值操作符 (NumberValueBinaryOperatorDelegate)
| Operator | 符号 | 说明 |
|----------|------|------|
| 0 | + | 加法 |
| 1 | - | 减法 |
| 2 | * | 乘法 |
| 3 | / | 除法 |
| 4 | % | 取模 |

### 比较操作符 (BoolValueBinaryOperatorOnNumberDelegate)
| Operator | 符号 | 说明 |
|----------|------|------|
| 0 | >= | 大于等于 |
| 1 | > | 大于 |
| 2 | <= | 小于等于 |
| 3 | < | 小于 |
| 4 | == | 等于 |
| 5 | != | 不等于 |

### 布尔操作符 (BoolValueBinaryOperatorOnBoolDelegate)
| Operator | 符号 | 说明 |
|----------|------|------|
| 0 | && | 逻辑与 |
| 1 | \|\| | 逻辑或 |

---

## 使用场景

### 场景 1: 调试配置
当需要验证 JSON 配置是否正确时，可以使用 De-Parse 函数将其转换为表达式形式，更容易理解配置的含义。

### 场景 2: 配置导出
在导出配置时，可以同时生成表达式形式的注释，帮助其他开发者理解配置。

### 场景 3: 配置验证
通过比较原始表达式和 De-Parse 后的表达式，可以验证解析和反向解析的正确性。

### 场景 4: 用户界面
在编辑器中显示 JSON 对应的表达式形式，提供更友好的用户体验。

---

## 常见问题

### Q: 如何处理未知的 Delegate 类型？
A: 如果找不到对应的函数名，函数会返回类名本身。

### Q: 如何处理数组参数？
A: 数组参数会被展开，每个元素作为一个单独的参数传递。

### Q: 如何处理可选参数？
A: 如果参数值为 undefined 或 null，会被跳过。

### Q: 如何处理字符串参数？
A: 字符串参数会被加上双引号。

### Q: 如何处理嵌套对象？
A: 嵌套对象会被递归处理，生成嵌套的表达式。
