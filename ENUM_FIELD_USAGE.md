# 枚举字段使用指南

## 概述

现在支持将枚举类型字段自动转换为下拉选择框，而不是纯数字输入。

## 工作原理

### 1. 自动检测（推荐）

如果参数类型是一个枚举对象，系统会自动检测并提取枚举选项，生成 `select` 类型的字段。

**示例：**

```typescript
@AtomGenClass("值")
class BoolValueBinaryOperatorOnBoolDelegate extends BoolValueDelegate {
  public constructor(
    public readonly lhs: BoolValueDelegate,
    public readonly operator: ue.EMHBoolTriggerValueBinaryOperatorOnBool,  // 自动检测为枚举
    public readonly rhs: BoolValueDelegate
  ) {
    super("MHTsBoolTriggerValueBinaryOperatorOnBoolean_C");
  }
}
```

**结果：** `operator` 字段会自动显示为下拉框，选项为：
- LogicalAnd (0)
- LogicalOr (1)

### 2. 手动指定（自定义选项）

如果需要自定义选项的标签或值，可以在装饰器中指定 `options` 字段。

**示例：**

```typescript
@AtomGenClass("自定义操作")
class CustomActionDelegate extends ActionDelegate {
  public constructor(
    @AtomGenParam({
      label: "操作类型",
      type: String,
      options: [
        { label: "攻击", value: "attack" },
        { label: "防守", value: "defend" },
        { label: "逃跑", value: "escape" }
      ]
    })
    public readonly actionType: string
  ) {
    super("CustomAction_C");
  }
}
```

**结果：** `actionType` 字段显示为下拉框，选项为：
- 攻击
- 防守
- 逃跑

## 枚举类型支持

### 支持的枚举类型

- **数值枚举**：`enum E { A = 0, B = 1 }`
- **字符串枚举**：`enum E { A = "a", B = "b" }`
- **混合枚举**：`enum E { A = 0, B = "b" }`

### 枚举定义位置

枚举通常定义在 `UETypes.ts` 中：

```typescript
export namespace ue {
  export enum EMHBoolTriggerValueBinaryOperatorOnBool {
    LogicalAnd = 0,
    LogicalOr = 1,
  }
}
```

## 实现细节

### 自动检测流程

1. **参数类型检查** - 检查参数类型是否为对象
2. **属性提取** - 遍历对象的所有属性
3. **过滤** - 过滤出数值或字符串类型的属性（跳过函数和特殊属性）
4. **生成选项** - 将属性名作为 label，属性值作为 value

### 优先级

1. **装饰器中的 `options`** - 如果指定了，直接使用
2. **自动检测** - 如果参数类型是枚举，自动提取选项
3. **基本类型** - 如果都不是，按基本类型处理

## 修改的文件

- `src/types/DynamicObjectForm.ts` - 添加 `options` 字段到 `ParamMetadata`
- `src/electron/main/DelegateMetadataGenerator.ts` - 添加枚举检测和处理逻辑
- `src/electron/main/DelegateDecorators.ts` - 支持装饰器中的 `options` 字段

## 示例

### 完整示例

```typescript
@AtomGenClass("二元操作")
class BoolValueBinaryOperatorOnBoolDelegate extends BoolValueDelegate {
  public constructor(
    public readonly lhs: BoolValueDelegate,
    public readonly operator: ue.EMHBoolTriggerValueBinaryOperatorOnBool,
    public readonly rhs: BoolValueDelegate
  ) {
    super("MHTsBoolTriggerValueBinaryOperatorOnBoolean_C");
    return FConstantFoldingHelper.ReplaceBoolBinaryOperatorOnBool(this) as any;
  }
}
```

**UI 效果：**
- `lhs` - 对象选择器（BoolValueDelegate）
- `operator` - **下拉选择框**（自动生成）
  - LogicalAnd
  - LogicalOr
- `rhs` - 对象选择器（BoolValueDelegate）

## 常见问题

### Q: 为什么我的枚举没有显示为下拉框？

A: 检查以下几点：
1. 枚举是否正确导入？
2. 参数类型是否正确指定？
3. 枚举是否有有效的属性（不全是函数）？

### Q: 如何自定义选项的显示文本？

A: 使用装饰器中的 `options` 字段：

```typescript
@AtomGenParam({
  label: "操作",
  options: [
    { label: "自定义标签1", value: 0 },
    { label: "自定义标签2", value: 1 }
  ]
})
```

### Q: 支持嵌套枚举吗？

A: 目前不支持嵌套枚举。如果需要，可以使用装饰器手动指定 `options`。
