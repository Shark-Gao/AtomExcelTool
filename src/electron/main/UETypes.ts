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
    EqualTo = 0,
    Greater = 1,
    GreaterEqual = 2,
    Less = 3,
    LessEqual = 4,
    NotEqualTo = 5,
  }

  export enum EMHNumberTriggerValueBinaryOperator {
    Plus = 0,
    Minus = 1,
    Multiplies = 2,
    Divides = 3,
    Modulus = 4,
    Min = 5,
    Max = 6,
  }

  export enum EMHPhysicType {
    None = 0,
    Slash = 1,
    Strike = 2,
    Projectile = 3,
  }

  export enum EMHAbilityTaskRealm {
    All = 0,
    ServerOnly = 1,
    ClientOnly = 2,
    LocalOnly = 3,
  }

  export enum ECombatResource {
    Stamina = 0,
    Health = 1,
    Focus = 2,
  }

  export enum ESummonMovementMode {
    Walking = 0,
    Flying = 1,
    Swimming = 2,
  }

  export enum EMHHealingType {
    Unknown = 0,
    NotHealing = 1,
    Healing = 2,
  }

  export enum EArashiAdventurerHealthClaimingType {
    None = 0,
    Claiming = 1,
  }

  // ============ 类定义 ============

  export class LinearColor {
    R: number;
    G: number;
    B: number;
    A: number;

    constructor(
      R: number = 1.0,
      G: number = 1.0,
      B: number = 1.0,
      A: number = 1.0
    ) {
      this.R = R;
      this.G = G;
      this.B = B;
      this.A = A;
    }
  }

  export class MHScriptIO {
    static GetProjectContentDir(): string {
      return "";
    }

    static ReadFileAsString(path: string): string {
      return "";
    }
  }
}

export enum EStatusEffect {
  None = 0,
  Burn = 1,
  Poison = 2,
  Paralysis = 3,
  Sleep = 4,
  Stun = 5,
  Bleed = 6,
}

export enum EElementalStatusEffect {
  None = 0,
  Fire = 1,
  Water = 2,
  Thunder = 3,
  Ice = 4,
  Dragon = 5,
}

export enum EMBuffStateStage {
  Start = 0,
  Loop = 1,
  End = 2,
}

export enum EStiffnessType {
  None = 0,
  Small = 1,
  Medium = 2,
  Large = 3,
}

export enum EAbilityType {
  Normal = 0,
  Special = 1,
  Ultimate = 2,
}

export enum EMAIStateType {
  Idle = 0,
  Chase = 1,
  Attack = 2,
  Retreat = 3,
}

export enum EMovementMode {
  Walking = 0,
  Running = 1,
  Sprinting = 2,
  Flying = 3,
  Swimming = 4,
}

export enum ESubTriggerOperate {
  And = 0,
  Or = 1,
}

export enum ETemperatureType {
  Normal = 0,
  Hot = 1,
  Cold = 2,
}

export enum EWAEndMethod {
  Complete = 0,
  Interrupt = 1,
  Cancel = 2,
}
// ============ 工具类型 ============

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export type Safe<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type $Ref<T> = { value: T };

export namespace api {
  export enum ENMAdventureAttributeType {
    ENMAdventureAttributeType_ATTACK = 0,
    ENMAdventureAttributeType_DEFENSE = 1,
    ENMAdventureAttributeType_SUPPORT = 2,
    ENMAdventureAttributeType_COLLAPSE = 3,
    ENMAdventureAttributeType_AUXILIARY = 4,
    ENMAdventureAttributeType_Invalid = 5,
  }

  export enum ENMWorldActivityType {
    ENMWorldActivityType_None = 0,
    ENMWorldActivityType_Quest = 1,
    ENMWorldActivityType_Expedition = 2,
  }

  export enum ENMWeaponType {
    ENMWeaponType_None = 0,
    ENMWeaponType_GreatSword = 1,
    ENMWeaponType_LongSword = 2,
    ENMWeaponType_SwordAndShield = 3,
    ENMWeaponType_DualBlades = 4,
    ENMWeaponType_Hammer = 5,
    ENMWeaponType_HuntingHorn = 6,
    ENMWeaponType_Lance = 7,
    ENMWeaponType_Gunlance = 8,
    ENMWeaponType_Axe = 9,
    ENMWeaponType_ChargeBlade = 10,
    ENMWeaponType_InsectGlaive = 11,
    ENMWeaponType_Bow = 12,
    ENMWeaponType_LightBowgun = 13,
    ENMWeaponType_HeavyBowgun = 14,
  }
}
// ============ 全局变量和函数 ============

export const AttackParamsOfCurrentAbility: any[] = [];
export const AtomSystemScriptMetaDataJsonPath =
  "/Content/AtomSystem/Metadata.json";

export function LoadTable(tableDef: any): any {
  return null;
}

export function GetBuffDebuffConstValueByKey(key: string): number | undefined {
  return undefined;
}

export function Assert(condition: any, message?: string): void {
  if (!condition) {
    console.error(`Assertion failed: ${message || "Unknown assertion"}`);
  }
}

export class AtkParamsInTermsOfJsObject {
  constructor(
    public bDoT: boolean,
    public bHPLoss: boolean,
    public bInterruptSleepStatusEffect: boolean,
    public HealingType: ue.EMHHealingType
  ) {}
}

export class ScriptTableDef {
  static AttributeScalingByPlayerSkillGroupLevel =
    "AttributeScalingByPlayerSkillGroupLevel";
}

export class MHTsNumberTriggerValue {
  constructor(public value: any) {}
}

// ============ 导出类型 ============

export class AIStrategyUGCOptionLine {}
export class AbilityDelegate {}
export class AdventurerAITransitionLine {}
export class MonsterSkillLine {}
export class PetSkillLine {}
