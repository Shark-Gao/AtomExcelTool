# Delegate 装饰器使用指南

## 概述

使用 `@Delegate` 和 `@Param` 装饰器为 Delegate 类的构造函数参数添加元数据，包括中文描述。这些元数据会被 `DelegateMetadataGenerator` 提取，最终用于编辑器UI的字段显示。

## 装饰器说明

### @Delegate
- **位置**：类定义前
- **作用**：标记该类为需要提取元数据的 Delegate 类
- **用法**：
```typescript
@Delegate
class MyDelegate extends BoolValueDelegate {
  // ...
}
```

### @Param
- **位置**：构造函数参数前
- **作用**：为参数添加中文标签和描述
- **参数**：
  - `label` (必需)：中文标签/描述
  - `description` (可选)：详细描述
- **用法**：
```typescript
@Delegate
class MyDelegate extends BoolValueDelegate {
  constructor(
    @Param('技能组', '要检查的技能组ID')
    public readonly AbilityGroup: string
  ) {
    super("MyDelegate_C");
  }
}
```

## 完整示例

### 单参数示例
```typescript
@Delegate
class BoolTriggerValueCheckContextAbilityGroupDelegate extends BoolValueDelegate {
  public constructor(
    @Param('技能组', '要检查的技能组ID')
    public readonly AbilityGroup: string
  ) {
    super("MHTsBoolTriggerValueCheckContextAbilityGroup_C");
  }
}
```

### 多参数示例
```typescript
@Delegate
class EventHealthReductionWithinAPeriodOfTimeDelegate extends EventDelegateEx {
  public readonly TimeLimit: number = undefined;
  public constructor(
    @Param('生命值减少阈值', '触发条件的生命值减少量')
    public readonly HealthReductionThreshold: NumberValueDelegate,
    @Param('时间限制', '检查时间窗口（秒）')
    TimeLimit: NumberValueConstDelegate
  ) {
    super("MHTsTriggerEventHealthReductionWithinAPeriodOfTime_C");
    this.TimeLimit = TimeLimit.Constant;
  }
}
```

### 可变参数示例
```typescript
@Delegate
class EventComboAbilityTriggerDamageDelegate extends EventDelegateEx {
  public SkillIdList: Readonly<Array<NumberValueDelegate>> = undefined;
  public constructor(
    @Param('技能列表', '要检查的技能ID列表')
    ...Candidates: ReadonlyArray<NumberValueDelegate>
  ) {
    super("MHTsTriggerEventComboAbilityTriggerDamageCondition_C");
    this.SkillIdList = Candidates;
  }
}
```

## 元数据提取流程

1. **编译时**：TypeScript 编译器在 `experimentalDecorators` 和 `emitDecoratorMetadata` 启用的情况下，生成 `design:paramtypes` 元数据

2. **装饰器执行**：`@Param` 装饰器在类加载时执行，将参数信息存储在 Symbol 中

3. **运行时提取**：`DelegateMetadataGenerator.generateMetadataFromDelegate()` 调用时：
   - 通过 `Reflect.getMetadata('design:paramtypes', delegateClass)` 获取参数类型
   - 通过 `getParamMetadata(delegateClass)` 获取装饰器元数据（包括中文标签）
   - 将两者结合生成完整的 `ClassMetadata`

4. **编辑器使用**：前端编辑器通过 `delegateBridge.getMetadata()` 获取元数据，使用中文标签显示字段

## 类型转换

参数类型会自动转换为编辑器支持的字段类型：

| 参数类型 | 字段类型 | 说明 |
|---------|---------|------|
| `string` | `string` | 文本输入 |
| `number` | `number` | 数字输入 |
| `boolean` | `boolean` | 布尔开关 |
| `NumberValueDelegate` | `object` | 对象选择器 |
| `BoolValueDelegate` | `object` | 对象选择器 |
| `ActorValueDelegate` | `object` | 对象选择器 |
| `Array<...>` | `array` | 数组编辑器 |

## 最佳实践

1. **始终使用装饰器**：为所有 Delegate 类添加 `@Delegate`，为所有参数添加 `@Param`

2. **中文标签简洁**：标签应该简短明了，通常 2-4 个字

3. **描述详细**：在 `description` 中提供更详细的说明，帮助用户理解参数含义

4. **参数顺序**：装饰器的顺序必须与构造函数参数顺序一致

5. **类型一致**：确保参数类型与预期的字段类型匹配

## 调试

### 查看生成的元数据
```typescript
import { getParamMetadata } from './DelegateDecorators';

const metadata = getParamMetadata(MyDelegateClass);
console.log(metadata);
// 输出: [
//   { name: 'param1', type: String, label: '参数1', description: '...' },
//   { name: 'param2', type: Number, label: '参数2', description: '...' }
// ]
```

### 检查编译配置
确保 `tsconfig.json` 包含：
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## 常见问题

**Q: 为什么参数标签没有显示？**
A: 检查是否：
1. 添加了 `@Param` 装饰器
2. 编译配置中启用了 `experimentalDecorators` 和 `emitDecoratorMetadata`
3. 参数顺序与装饰器顺序一致

**Q: 可以不使用装饰器吗？**
A: 可以，但会失去中文标签功能。系统会自动从参数名称生成标签（英文）。

**Q: 如何为没有参数的 Delegate 类添加装饰器？**
A: 只需添加 `@Delegate` 即可：
```typescript
@Delegate
class MyDelegate extends BoolValueDelegate {
  constructor() {
    super("MyDelegate_C");
  }
}
```
