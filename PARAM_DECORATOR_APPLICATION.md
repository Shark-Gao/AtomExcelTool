# @Param 装饰器应用指南

## 概述

`@Param` 装饰器已成功应用到 `MHTsAtomSystemUtils.ts` 中的关键 Delegate 类。本指南说明如何继续为其他类添加参数装饰器。

## 已应用的类示例

### 1. BoolTriggerValueCheckContextAbilityGroupDelegate
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

### 2. EventHealthReductionWithinAPeriodOfTimeDelegate
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

### 3. EventComboAbilityTriggerDamageDelegate (可变参数)
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

### 4. EventTriggerRepeatedWithinDurationDelegate (多参数)
```typescript
@Delegate
class EventTriggerRepeatedWithinDurationDelegate extends EventDelegateEx {
  public Event: EventDelegateEx;
  public Duration: number;
  public RepeatedCount: number;
  public constructor(
    @Param('事件', '要重复检查的事件')
    Event: EventDelegateEx,
    @Param('持续时间', '检查时间窗口（秒）')
    Duration: number | NumberValueConstDelegate,
    @Param('重复次数', '事件需要触发的次数')
    RepeatedCount: number | NumberValueConstDelegate
  ) {
    super("MHTsTriggerEventRepeatedWithinDuration_C");
    this.Event = Event;
    if (typeof Duration === "number") {
      this.Duration = Duration;
    } else {
      this.Duration = Duration.Constant;
    }
    if (typeof RepeatedCount === "number") {
      this.RepeatedCount = RepeatedCount;
    } else {
      this.RepeatedCount = RepeatedCount.Constant;
    }
  }
}
```

## 参数名称到中文描述映射表

| 参数名 | 中文标签 | 描述 |
|-------|---------|------|
| AbilityGroup | 技能组 | 要检查的技能组ID |
| TargetQuestID | 任务ID | 要检查的任务ID |
| SelfOnly | 仅自身 | 是否仅检查自身 |
| StatusEffectType | 状态效果类型 | 要检查的状态效果类型 |
| HealthReductionThreshold | 生命值减少阈值 | 触发条件的生命值减少量 |
| TimeLimit | 时间限制 | 检查时间窗口（秒） |
| Candidates | 技能列表 | 要检查的技能ID列表 |
| CheckSkillGroupId | 技能组ID | 要检查的技能组ID |
| Event | 事件 | 要重复检查的事件 |
| Duration | 持续时间 | 检查时间窗口（秒） |
| RepeatedCount | 重复次数 | 事件需要触发的次数 |
| EventName | 事件名称 | 事件转发器的名称 |
| Target | 目标 | 要检查的目标对象 |
| BuffID | Buff ID | Buff的唯一标识 |
| BuffSource | Buff来源 | Buff的来源对象 |
| Who | 对象 | 要检查的对象 |
| Radius | 半径 | 检查范围的半径 |
| SurroundingWhom | 周围对象 | 要检查周围的对象 |
| MonsterID | 怪物ID | 要检查的怪物ID |
| Condition | 条件 | 要检查的条件 |
| Lhs | 左值 | 条件为真时的值 |
| Rhs | 右值 | 条件为假时的值 |
| BodyPartName | 部位名称 | 要检查的身体部位名称 |
| Operand | 操作数 | 一元操作的操作数 |
| operator | 操作符 | 二元操作符 |
| inp | 输入值 | 要限制的输入值 |
| min | 最小值 | 限制的最小值 |
| max | 最大值 | 限制的最大值 |
| bMin | 是否最小值 | 是否取最小值（true）或最大值（false） |
| PickMethod | 选择方法 | 队伍成员选择方法 |
| PetSkillID | 宠物技能ID | 宠物技能的ID |
| TrueWeight | 真权重 | 条件为真时的权重 |
| FalseWeight | 假权重 | 条件为假时的权重 |
| TargetType | 目标类型 | 要检查的目标类型 |
| LeftAttr | 左属性 | 左侧属性名称 |
| LeftThreshold | 左阈值 | 左侧属性的阈值 |
| RightAttr | 右属性 | 右侧属性名称 |
| RightThreshold | 右阈值 | 右侧属性的阈值 |
| Threshold | 阈值 | 生命值百分比阈值 |
| HelpType | 帮助类型 | 宠物帮助类型 |
| MasterHealthPercentage | 主人生命百分比 | 主人生命值百分比阈值 |
| TeamMateHealthPercentage | 队友生命百分比 | 队友生命值百分比阈值 |
| TargetDistThreshold | 目标距离阈值 | 目标距离阈值 |
| SkillID | 技能ID | 技能的唯一标识 |
| ActionType | 动作类型 | 宠物主人的动作类型 |
| DamageType | 伤害类型 | 伤害类型 |
| Count | 计数 | 命中次数 |
| GameplayTag | 游戏标签 | 要检查的游戏标签 |
| GameplayTagNameOrAbilityConfigID | 标签或技能ID | 游戏标签名称或技能配置ID |
| UniquestrID | 唯一ID | 对象的唯一字符串ID |
| BuffStateName | Buff状态名称 | Buff状态的名称 |
| BuffStateStage | Buff状态阶段 | Buff状态的阶段 |
| StiffnessType | 僵直类型 | 要检查的僵直类型 |
| AbilityConfigID | 技能配置ID | 技能的配置ID |
| ItemID | 物品ID | 消耗物品的ID |
| SettingRowNameVal | 设置行名 | 推荐设置的行名 |
| LevelVal | 等级 | 推荐等级 |
| StateName | 状态名称 | 温度或饱食度状态名称 |
| Weather | 天气 | 要检查的天气类型 |
| Filter | 过滤条件 | 怪物过滤条件 |
| Tags | 标签列表 | 要检查的标签列表 |
| Actor | 角色 | 要检查的角色对象 |
| Monster | 怪物 | 要检查的怪物对象 |
| TargetActor | 目标角色 | 目标角色对象 |
| SourceActor | 来源角色 | 来源角色对象 |
| Name0 | 名称0 | 第一个对象名称 |
| Name1 | 名称1 | 第二个对象名称 |
| Dimension | 维度 | 距离计算维度 |
| TaskType | 任务类型 | 特定任务类型 |
| Key | 键 | 属性键名 |
| AttributeName | 属性名称 | 属性的名称 |
| BulletType | 子弹类型 | 弓弩子弹类型 |
| FlagName | 标志名称 | 控制器标志名称 |
| WeaponType | 武器类型 | 要检查的武器类型 |
| WeaponState | 武器状态 | 武器的状态 |
| Cases | 情况列表 | 武器类型情况列表 |
| MaxTokenNumForThisAction | 最大令牌数 | 此动作的最大令牌数 |
| InStatusEffectName | 状态效果名称 | 状态效果的名称 |
| ThresholdNum | 阈值数量 | 状态效果数量阈值 |

## 如何为其他类添加装饰器

### 步骤 1：识别需要装饰的类
查找所有有参数的 Delegate 类。

### 步骤 2：添加 @Delegate 装饰器
在类定义前添加 `@Delegate`：
```typescript
@Delegate
class MyDelegate extends BoolValueDelegate {
  // ...
}
```

### 步骤 3：为参数添加 @Param 装饰器
在构造函数参数前添加 `@Param`：
```typescript
public constructor(
  @Param('中文标签', '详细描述')
  public readonly paramName: Type
) {
  // ...
}
```

## 元数据提取流程

```
@Param 装饰器
    ↓
存储参数元数据（中文标签）
    ↓
DelegateMetadataGenerator.getParamLabel()
    ↓
getParamMetadata() 获取装饰器元数据
    ↓
生成 ClassMetadata（包含中文标签）
    ↓
前端编辑器显示中文字段名
```

## 验证装饰器是否生效

### 1. 编译检查
```bash
npx tsc --noEmit
```

### 2. 运行时检查
```typescript
import { getParamMetadata } from './DelegateDecorators';

const metadata = getParamMetadata(MyDelegateClass);
console.log(metadata);
// 输出应该包含 label 和 description
```

### 3. 编辑器验证
在前端编辑器中，应该能看到中文标签而不是英文参数名。

## 注意事项

1. **装饰器顺序**：`@Param` 装饰器的顺序必须与构造函数参数顺序一致
2. **参数名称**：参数名称必须与映射表中的名称完全匹配
3. **中文标签**：标签应该简洁明了，通常 2-4 个字
4. **详细描述**：在 `description` 中提供更多上下文信息

## 常见问题

**Q: 为什么参数标签没有显示？**
A: 检查：
1. 是否添加了 `@Param` 装饰器
2. 参数顺序是否正确
3. 编译是否成功

**Q: 如何添加新的参数映射？**
A: 在 `PARAM_DECORATOR_APPLICATION.md` 的映射表中添加新行，然后在相应的类中使用。

**Q: 可以为没有参数的类添加装饰器吗？**
A: 可以，只需添加 `@Delegate` 即可。
