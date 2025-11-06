import { AtomGenClass, AtomGenParam } from "./DelegateDecorators";
import {
  ue,
  api,
  Mutable,
  $Ref,
  AttackParamsOfCurrentAbility,
  LoadTable,
  GetBuffDebuffConstValueByKey,
  Assert,
  AtkParamsInTermsOfJsObject,
  ScriptTableDef,
  EStatusEffect,
  EElementalStatusEffect,
  EStiffnessType,
  EAbilityType,
  EMAIStateType,
  EMovementMode,
  ESubTriggerOperate,
  ETemperatureType,
  EWAEndMethod,
} from "./UETypes";

/** 当前正在组装哪个技能 */
export let CurrentAbilityConfigID: string;

function GetIntUniqueToAbility(): string {
  // const str = (IntUniqueToAbility + 1024).toString();
  // ++IntUniqueToAbility;
  return "";
}


/** 不要在 constructor 用 optional parameter 或者 parameter with a default value */
abstract class DelegateBase {
  public _OuterLinks: any = undefined;
  public _ClassName: string;
  public constructor(_lassName: string) {
    // 获取当前类名
    this._ClassName = this.constructor.name;
  }
}

abstract class NumberValueDelegate extends DelegateBase {}
abstract class BoolValueDelegate extends DelegateBase {}
abstract class ActorValueDelegate extends DelegateBase {}
abstract class EventDelegateEx extends DelegateBase {}

@AtomGenClass("值")
class NumberValueConstDelegate extends NumberValueDelegate {
  public _Constant: number;
  public Constant: number;
  private ConstantKey: string;
  // public Constant: number; // a getter/setter actually.
  public constructor(Constant: number, ConstantKey?: string) {
    super("MHTsNumberTriggerValueConst_C");
    console.log(
      // TODO 先不降成Log，监控一下改Constant getter后有无异常
      `[NumberValueConstDelegate]ctor called. Constant-[${Constant}]. ConstantKey-${ConstantKey}`
    );
    this.ConstantKey = ConstantKey;
    if (!this.ConstantKey) {
      this._Constant = Constant;
      this.Constant = Constant;
    } else {
      const Value = GetBuffDebuffConstValueByKey(this.ConstantKey) ?? 0;
      this._Constant = Value;
      this.Constant = Value;
    }
  }
}

@AtomGenClass("值")
class BoolValueConstDelegate extends BoolValueDelegate {
  public constructor(public readonly BoolConst: boolean) {
    super("MHTsBoolTriggerValueConst_C");
  }
}

@AtomGenClass("是否在副本中")
class BoolTriggerValueIsInFubenDelegate extends BoolValueDelegate {
  constructor() {
    super("MHTsBoolTriggerValueIsInFuben_C");
  }
}

@AtomGenClass("检查技能组信息")
class BoolTriggerValueCheckContextAbilityGroupDelegate extends BoolValueDelegate {
  public constructor(public readonly AbilityGroup: string) {
    super("MHTsBoolTriggerValueCheckContextAbilityGroup_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckIsQuestRunningDelegate extends BoolValueDelegate {
  public constructor(public readonly TargetQuestID: string) {
    super("MHTsBoolTriggerValueCheckIsQuestRunning_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckIsQuestFinishedDelegate extends BoolValueDelegate {
  public constructor(public readonly TargetQuestID: string) {
    super("MHTsBoolTriggerValueCheckIsQuestFinished_C");
  }
}

@AtomGenClass("角色")
class EventCharacterDeathClaimDelegate extends EventDelegateEx {
  public SelfOnly: boolean;
  public constructor(SelfOnly: boolean | BoolValueConstDelegate) {
    super("MHTsTriggerEventCharacterDeathClaim_C");
    if (typeof SelfOnly === "boolean") {
      this.SelfOnly = SelfOnly;
    } else {
      const bIsValid = true;
      this.SelfOnly = SelfOnly.BoolConst;
    }
  }
}

@AtomGenClass("角色")
class EventCharacterStatusEffectDispelledDelegate extends EventDelegateEx {
  public StatusEffectType: EStatusEffect;
  public constructor(StatusEffectType: number | NumberValueConstDelegate) {
    super("MHTsTriggerEventCharacterStatusEffectDispelled_C");
    if (typeof StatusEffectType === "number") {
      this.StatusEffectType = StatusEffectType;
    } else {
      this.StatusEffectType = StatusEffectType.Constant;
    }
  }
}

@AtomGenClass("生命值")
class EventHealthReductionWithinAPeriodOfTimeDelegate extends EventDelegateEx {
  public readonly TimeLimit: number = undefined;
  public constructor(
    public readonly HealthReductionThreshold: NumberValueDelegate,
    TimeLimit: NumberValueConstDelegate
  ) {
    super("MHTsTriggerEventHealthReductionWithinAPeriodOfTime_C");
    this.TimeLimit = TimeLimit.Constant;
  }
}

@AtomGenClass("技能")
class EventComboAbilityTriggerDamageDelegate extends EventDelegateEx {
  public SkillIdList: Readonly<Array<NumberValueDelegate>> = undefined;
  public constructor(...Candidates: ReadonlyArray<NumberValueDelegate>) {
    super("MHTsTriggerEventComboAbilityTriggerDamageCondition_C");
    this.SkillIdList = Candidates;
  }
}

@AtomGenClass("组")
class EventGroupSkillFirstTriggerDamageDelegate extends EventDelegateEx {
  public CheckSkillGroupId: number;

  public constructor(CheckSkillGroupId: NumberValueConstDelegate) {
    super("MHTsTriggerEventGroupSkillFirstTriggerDamageCondition_C");
    this.CheckSkillGroupId = CheckSkillGroupId.Constant;
  }
}

@AtomGenClass("持续时间")
class EventTriggerRepeatedWithinDurationDelegate extends EventDelegateEx {
  public Event: EventDelegateEx;
  public Duration: number;
  public RepeatedCount: number;
  public constructor(
    Event: EventDelegateEx,
    Duration: number | NumberValueConstDelegate,
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

@AtomGenClass("角色")
class EventCharacterUpdatedDelegate extends EventDelegateEx {
  public constructor() {
    super("MHTsTriggerEventCharacterUpdated_C");
  }
}

@AtomGenClass("EventCommonForwarderDelegate")
class EventCommonForwarderDelegate extends EventDelegateEx {
  public constructor(public readonly EventName: string) {
    super("MHTsTriggerEventForwarder_C");
  }
}
@AtomGenClass("EventCommonForwarderPreAffinity")
class EventCommonForwarderPreAffinity extends EventCommonForwarderDelegate {
  public constructor() {
    super("PreAffinity");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPostAffinity")
class EventCommonForwarderPostAffinity extends EventCommonForwarderDelegate {
  public constructor() {
    super("PostAffinity");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("状态")
class EventCommonForwarderPreStatusEffect extends EventCommonForwarderDelegate {
  public constructor() {
    super("PreStatusEffect");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("状态")
class EventCommonForwarderEveStatusEffect extends EventCommonForwarderDelegate {
  public constructor() {
    super("EveStatusEffect");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPlayerDefenseSuccessServer")
class EventCommonForwarderPlayerDefenseSuccessServer extends EventCommonForwarderDelegate {
  public constructor() {
    super("PlayerDefenseSuccessServer");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPlayerDefenseSuccess")
class EventCommonForwarderPlayerDefenseSuccess extends EventCommonForwarderDelegate {
  public constructor() {
    super("PlayerDefenseSuccess");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPlayerDefenseFailed")
class EventCommonForwarderPlayerDefenseFailed extends EventCommonForwarderDelegate {
  public constructor() {
    super("PlayerDefenseFailed");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPostReceiveDamageAsAttacker")
class EventCommonForwarderPostReceiveDamageAsAttacker extends EventCommonForwarderDelegate {
  public constructor() {
    super("PostReceiveDamageAsAttacker");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPreReceiveDamageAsAttacker")
class EventCommonForwarderPreReceiveDamageAsAttacker extends EventCommonForwarderDelegate {
  public constructor() {
    super("PreReceiveDamageAsAttacker");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPreReceiveDamageAsVictim")
class EventCommonForwarderPreReceiveDamageAsVictim extends EventCommonForwarderDelegate {
  public constructor() {
    super("PreReceiveDamageAsVictim");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPostReceiveDamageAsVictim")
class EventCommonForwarderPostReceiveDamageAsVictim extends EventCommonForwarderDelegate {
  public constructor() {
    super("PostReceiveDamageAsVictim");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("计数器")
class EventCommonForwarderCounterAttackSuccess extends EventCommonForwarderDelegate {
  public constructor() {
    super("CounterAttackSuccess");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("计数器")
class EventCommonForwarderCounterAttackSuccessServer extends EventCommonForwarderDelegate {
  public constructor() {
    super("CounterAttackSuccessServer");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderComboEnd")
class EventCommonForwarderComboEnd extends EventCommonForwarderDelegate {
  public constructor() {
    super("ComboEnd");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderHealingAsHealer")
class EventCommonForwarderHealingAsHealer extends EventCommonForwarderDelegate {
  public constructor() {
    super("HealingAsHealer");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderHealingAsTarget")
class EventCommonForwarderHealingAsTarget extends EventCommonForwarderDelegate {
  public constructor() {
    super("HealingAsTarget");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("技能")
class EventCommonForwarderPreBeginAbilityTag extends EventCommonForwarderDelegate {
  public constructor() {
    super("PreBeginAbilityTag");
  }
}
@AtomGenClass("技能")
class EventCommonForwarderBeginAbilityTag extends EventCommonForwarderDelegate {
  public constructor() {
    super("BeginAbilityTag");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("技能")
class EventCommonForwarderEndAbilityTag extends EventCommonForwarderDelegate {
  public constructor() {
    super("EndAbilityTag");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderFurinkazanAdvanced")
class EventCommonForwarderFurinkazanAdvanced extends EventCommonForwarderDelegate {
  public constructor() {
    super("FurinkazanAdvanced");
  }
} // eslint-disable-line prettier/prettier
@AtomGenClass("EventCommonForwarderPreAttack")
class EventCommonForwarderPreAttack extends EventCommonForwarderDelegate {
  public constructor() {
    super("PreAttack");
  }
} // eslint-disable-line prettier/prettier

@AtomGenClass("EventBeginToSatisfyTheConditionDelegate")
class EventBeginToSatisfyTheConditionDelegate extends EventDelegateEx {
  public readonly TimeRequired: number;

  public constructor(
    public readonly Condition: BoolValueDelegate,
    TimeRequired: NumberValueConstDelegate = ZeroConstNumberValue
  ) {
    super("MHTsTriggerEventBeginToSatisfyTheCondition_C");
    this.TimeRequired = TimeRequired.Constant;
  }
}

@AtomGenClass("硬直")
class EventMonsterEpicStiffnessChanged extends EventDelegateEx {
  public readonly IsStarted: boolean;
  public constructor(IsStarted: BoolValueConstDelegate) {
    super("MHTsTriggerEventMonsterEpicStiffness_C");
    this.IsStarted = IsStarted.BoolConst;
  }
}

@AtomGenClass("值")
class NumberValueBuffStack extends NumberValueDelegate {
  public readonly BuffID: string = undefined;

  public constructor(
    public readonly Target: ActorValueDelegate,
    BuffID: string | NumberValueConstDelegate,
    public readonly BuffSource: ActorValueDelegate
  ) {
    super("MHTsNumberTriggerValueBuffStack_C");
    this.BuffID =
      BuffID instanceof NumberValueConstDelegate
        ? BuffID.Constant.toString()
        : BuffID;
  }
}

@AtomGenClass("值")
class NumberValueAttackBowgunMagazineInfoDelegate extends NumberValueDelegate {
  public readonly Type: 1 | 2 | 3 | 4;

  public constructor(Type: NumberValueConstDelegate | number) {
    super("ArashiNumberTriggerValueAttackBowgunMagazineInfo_C");
    Type = typeof Type === "number" ? Type : Type.Constant;
    this.Type = Type as unknown as 1 | 2 | 3 | 4;
  }
}

@AtomGenClass("值")
class NumberValueBowgunAmmoType extends NumberValueDelegate {
  public readonly AmmoSource: -1 | 0 | 1;

  public constructor(AmmoSource: NumberValueConstDelegate | -1 | 0 | 1 = -1) {
    super("ArashiNumberTriggerValueBowgunAmmoType_C");
    this.AmmoSource =
      typeof AmmoSource === "number" ? AmmoSource : (AmmoSource.Constant as 0);
  }
}

@AtomGenClass("通过BuffID获取BuffStack")
class NumberValueBuffBuffStackByBuffId extends NumberValueDelegate {
  public readonly BuffID: string = undefined;

  public constructor(
    @AtomGenParam({ descName: "目标", type: "Actor" })
    public readonly Target: ActorValueDelegate,
    @AtomGenParam({ descName: "Buff配置Id" })
    BuffID: string | NumberValueConstDelegate
  ) {
    super("MHTsNumberTriggerValueBuffStackByBuffId_C");
    this.BuffID =
      BuffID instanceof NumberValueConstDelegate
        ? BuffID.Constant.toString()
        : BuffID;
  }
}
@AtomGenClass("值")
class NumberValueGetDistDelegate extends NumberValueDelegate {
  public constructor(
    public readonly lhs: ActorValueDelegate,
    public readonly rhs: ActorValueDelegate
  ) {
    super("MHTsNumberTriggerValueGetDist_C");
  }
}
@AtomGenClass("值")
class NumberValueGetDist2DDelegate extends NumberValueDelegate {
  public constructor(
    public readonly lhs: ActorValueDelegate,
    public readonly rhs: ActorValueDelegate
  ) {
    super("MHTsNumberTriggerValueGetDist2D_C");
  }
}
@AtomGenClass("值")
class NumberValueAttributeScalingByPlayerSkillGroupLevel extends NumberValueDelegate {
  public readonly key: string;

  public constructor(key: string | NumberValueConstDelegate) {
    super("MHTsNumberTriggerValueAttributeScalingByPlayerSkillGroupLevel_C");
    this.key = typeof key === "string" ? key : key.Constant.toString();

    const TableContent = LoadTable(
      ScriptTableDef.AttributeScalingByPlayerSkillGroupLevel
    );
    if (!TableContent || !TableContent.GetRow(this.key))
      console.warn(
        `[AtomSystem][ExportCheck][${
          NumberValueAttributeScalingByPlayerSkillGroupLevel.name
        }] [${TableContent.GetTableName()}] 里面没有配置列 [${this.key}]`
      ); // eslint-disable-line prettier/prettier
  }
}
@AtomGenClass("值")
class NumberValueAttributeScalingByCombatPetAscensionPhase extends NumberValueDelegate {
  public readonly key: string;

  public constructor(key: string | NumberValueConstDelegate) {
    super("MHTsNumberTriggerValueAttributeScalingByCombatPetAscensionPhase_C");
    this.key = typeof key === "string" ? key : key.Constant.toString();

    const TableContent = LoadTable(
      ScriptTableDef.AttributeScalingByPlayerSkillGroupLevel
    );
    if (!TableContent || !TableContent.GetRow(this.key))
      console.warn(
        `[AtomSystem][ExportCheck][${
          NumberValueAttributeScalingByCombatPetAscensionPhase.name
        }] [${TableContent.GetTableName()}] 里面没有配置列 [${this.key}]`
      ); // eslint-disable-line prettier/prettier
  }
}
@AtomGenClass("值")
class NumberValueGetDistZDelegate extends NumberValueDelegate {
  public constructor(
    public readonly lhs: ActorValueDelegate,
    public readonly rhs: ActorValueDelegate
  ) {
    super("MHTsNumberTriggerValueGetDistZ_C");
  }
}

@AtomGenClass("值")
class NumberValueMonsterBrokenBodyPartNumDelegate extends NumberValueDelegate {
  public constructor(public readonly Monster: ActorValueDelegate) {
    super("MHTsNumberTriggerValueBrokenBodyPartNum_C");
  }
}
@AtomGenClass("值")
class NumberValueCounterAttackValueDelegate extends NumberValueDelegate {
  public constructor(public readonly BodyPartName: string) {
    super("MHTsNumberTriggerValueGetCounterAttackValue_C");
  }
}
@AtomGenClass("值")
class NumberValueCounterAttackMaxValueDelegate extends NumberValueDelegate {
  public constructor(public readonly BodyPartName: string) {
    super("MHTsNumberTriggerValueGetCounterAttackMaxValue_C");
  }
}
@AtomGenClass("值")
class NumberValueQuadraticFunctionDelegate extends NumberValueDelegate {
  public constructor(
    public readonly x: NumberValueDelegate,
    public readonly a: NumberValueDelegate,
    public readonly b: NumberValueDelegate,
    public readonly c: NumberValueDelegate
  ) {
    super("MHTsNumberTriggerValueQuadraticFunction_C");
  }
}
@AtomGenClass("值")
class NumberValueBuffCustomValueDelegate extends NumberValueDelegate {
  public readonly idx: number = undefined;

  public constructor(idx: NumberValueConstDelegate) {
    super("MHTsNumberTriggerValueBuffCustomValue_C");
    this.idx = idx.Constant;
  }
}
@AtomGenClass("值")
class NumberValueSatiationDelegate extends NumberValueDelegate {
  public constructor(public readonly Who: ActorValueDelegate) {
    super("MHTsNumberTriggerValueSatiation_C");
  }
}
@AtomGenClass("值")
class NumberValueCombatPetTowerNumDelegate extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueCombatPetTowerNum_C");
  }
}
@AtomGenClass("值")
class NumberValueSkillGroupIDDelegate extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueSkillGroupID_C");
  }
}
@AtomGenClass("值")
class NumberValueMinMaxExDelegate extends NumberValueDelegate {
  public readonly Candidates: Readonly<Array<NumberValueDelegate>> = undefined;
  public constructor(
    public readonly bMin: boolean,
    ...Candidates: ReadonlyArray<NumberValueDelegate>
  ) {
    super("MHTsNumberTriggerValueMinMaxEx_C");
    this.Candidates = Candidates;
  }
}
@AtomGenClass("值")
class NumberValueMinEx extends NumberValueMinMaxExDelegate {
  public constructor(...Candidates: readonly NumberValueDelegate[]) {
    super(true, ...Candidates);
  }
}
@AtomGenClass("值")
class NumberValueMaxEx extends NumberValueMinMaxExDelegate {
  public constructor(...Candidates: readonly NumberValueDelegate[]) {
    super(false, ...Candidates);
  }
}
@AtomGenClass("值")
class NumberValueCountPartyAdventurerDelegate extends NumberValueDelegate {
  public constructor(public readonly PickMethod: BoolValueDelegate) {
    super("ArashiNumberTriggerValueCountPartyAdventurer_C");
  }
}
@AtomGenClass("值")
class NumberValueBuffTimeDelegate extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueAbilityContextTime_C");
  }
}
@AtomGenClass("值")
class NumberValueBuffRemainingTimeDelegate extends NumberValueDelegate {
  public readonly BuffId: string = undefined;
  public constructor(
    BuffId: string | NumberValueConstDelegate,
    public readonly TargetActor: ActorValueDelegate,
    public readonly SourceActor: ActorValueDelegate
  ) {
    super("ArashiNumberTriggerValueBuffRemainingTime_C");
    this.BuffId =
      typeof BuffId === "string" ? BuffId : BuffId.Constant.toString();
  }
}
@AtomGenClass("值")
class NumberValueSurroundingMonsterNumDelegate extends NumberValueDelegate {
  public readonly MonsterID: string = undefined;

  public constructor(
    MonsterID: string | NumberValueConstDelegate,
    public readonly Radius: NumberValueDelegate,
    public readonly SurroundingWhom: ActorValueDelegate
  ) {
    super("MHTsNumberTriggerValueSurroundingMonsterNum_C");

    if (typeof MonsterID !== "string")
      MonsterID = MonsterID.Constant.toString();
    this.MonsterID = MonsterID;
  }
}
@AtomGenClass("值")
class NumberValueConditionalNumberDelegate extends NumberValueDelegate {
  public constructor(
    public readonly Condition: BoolValueDelegate,
    public readonly Lhs: NumberValueDelegate,
    public readonly Rhs: NumberValueDelegate
  ) {
    super("MHTsNumberTriggerValueConditionalNumber_C");
  }
}
@AtomGenClass("值")
class NumberValueGetHitzoneOrSharpnessDelegate extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueGetAttackSharpnessOrHitzone_C");
  }
}
@AtomGenClass("值")
class NumberValueGetHitzone extends NumberValueGetHitzoneOrSharpnessDelegate {
  public constructor() {
    super();
  }
}
@AtomGenClass("值")
class NumberValueAttributeDelegate extends NumberValueDelegate {
  public constructor(public readonly AttributeName: string) {
    super("MHTsNumberTriggerValueAttribute_C");
  }
}
@AtomGenClass("值")
class NumberValueGetActorAttributeDelegate extends NumberValueDelegate {
  public constructor(
    public readonly Actor: ActorValueDelegate,
    public readonly AttributeName: string
  ) {
    super("MHTsNumberTriggerValueGetActorAttribute_C");
  }
}
@AtomGenClass("值")
class NumberValueUnaryOperatorDelegate extends NumberValueDelegate {
  public constructor(public readonly Operand: NumberValueDelegate) {
    super("MHTsNumberTriggerValueUnaryOperator_C");

    return FConstantFoldingHelper.ReplaceNumberValueUnaryOperator(this) as any;
  }
}
@AtomGenClass("值")
class NumberValueBinaryOperatorDelegate extends NumberValueDelegate {
  public constructor(
    public readonly lhs: NumberValueDelegate,
    public readonly operator: ue.EMHNumberTriggerValueBinaryOperator,
    public readonly rhs: NumberValueDelegate
  ) {
    super("MHTsNumberTriggerValueBinaryOperator_C");

    return FConstantFoldingHelper.ReplaceNumberBinaryOperator(this) as any;
  }
}
@AtomGenClass("值")
class NumberValueMinimumOperator extends NumberValueBinaryOperatorDelegate {
  public constructor(lhs: NumberValueDelegate, rhs: NumberValueDelegate) {
    super(lhs, ue.EMHNumberTriggerValueBinaryOperator.Min, rhs);
  }
}
@AtomGenClass("值")
class NumberValueMaximumOperator extends NumberValueBinaryOperatorDelegate {
  public constructor(lhs: NumberValueDelegate, rhs: NumberValueDelegate) {
    super(lhs, ue.EMHNumberTriggerValueBinaryOperator.Max, rhs);
  }
}
@AtomGenClass("值")
class NumberValueClampDelegate extends NumberValueDelegate {
  public constructor(
    public readonly inp: NumberValueDelegate,
    public readonly min: NumberValueDelegate,
    public readonly max: NumberValueDelegate
  ) {
    super("MHTsNumberTriggerValueClamp_C");

    return FConstantFoldingHelper.ReplaceClamp(this) as any;
  }
}
@AtomGenClass("值")
class NumberValueGetActorHeightDelegate extends NumberValueDelegate {
  public constructor(public readonly Who: ActorValueDelegate) {
    super("MHTsNumberTriggerValueActorHeight_C");
  }
}
@AtomGenClass("值")
class NumberValuePetMasterJustAttackedDelegate extends NumberValueDelegate {
  public constructor(
    public readonly TrueWeight: NumberValueDelegate,
    public readonly FalseWeight: NumberValueDelegate
  ) {
    super("MHTsNumberTriggerValuePetMasterJustAttacked_C");
  }
}
@AtomGenClass("值")
class NumberValuePetTargetMonsterInDisadvantageTimes extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValuePetTargetMonsterInDisadvantageTimes_C");
  }
}
@AtomGenClass("值")
class NumberTriggerValueCoopCombatEnergyFullTime extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueCoopCombatEnergyFullTime_C");
  }
}
@AtomGenClass("值")
class NumberValueNextDamageTime extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueNextDamageTime_C");
  }
}
@AtomGenClass("值")
class NumberValueClosestMonsterAttackCollisionDistance extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueClosestMonsterAttackCollisionDistance_C");
  }
}
@AtomGenClass("值")
class NumberValueAAINextDamageTime extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueAAINextDamageTime_C");
  }
}
@AtomGenClass("值")
class NumberValueAAINextDamageTimeSpecificTaskType extends NumberValueDelegate {
  public constructor(public readonly TaskType: string) {
    super("MHTsNumberTriggerValueAAINextDamageTimeSpecificTaskType_C");
  }
}
@AtomGenClass("值")
class NumberValueAAIToughnessZeroRemainTime extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueAAIToughnessZeroRemainTime_C");
  }
}
@AtomGenClass("值")
class NumberValueAAIFurinkazanStageRemainTime extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueAAIFurinkazanStageRemainTime_C");
  }
}
@AtomGenClass("值")
class NumberValueGetHbgBulletMaxShotDistance extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueGetHbgBulletMaxShotDistance_C");
  }
}
@AtomGenClass("值")
class NumberValueGetKeyPressedTime extends NumberValueDelegate {
  public readonly Key: string = undefined;

  public constructor(Key: string | NumberValueConstDelegate) {
    super("MHTsNumberTriggerValueGetKeyPressedTime_C");
    if (Key instanceof NumberValueConstDelegate) {
      this.Key = Key.Constant.toString();
    } else {
      this.Key = Key;
    }
  }
}
@AtomGenClass("值")
class NumberValueGetAbilityCurrentTime extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueGetAbilityCurrentTime_C");
  }
}
@AtomGenClass("值")
class NumberValueGetFurinkazanStage extends NumberValueDelegate {
  public constructor(public readonly Who: ActorValueDelegate) {
    super("MHTsNumberTriggerValueFurinkazanStage_C");
  }
}
@AtomGenClass("值")
class NumberValueGetHbgCurrentBulletType extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueGetHbgCurrentBulletType_C");
  }
}
@AtomGenClass("值")
class NumberValueGetHbgCurrentBulletNum extends NumberValueDelegate {
  public constructor(public readonly BulletType: string) {
    super("MHTsNumberTriggerValueGetHbgCurrentBulletNum_C");
  }
}
@AtomGenClass("值")
class NumberValueGetHbgMaxBulletNum extends NumberValueDelegate {
  public constructor(public readonly BulletType: string) {
    super("MHTsNumberTriggerValueGetHbgMaxBulletNum_C");
  }
}
@AtomGenClass("值")
class NumberValueGetItsStrategyActionItemNum extends NumberValueDelegate {
  public constructor() {
    super("MHtsNumberTriggerValueGetItsStrategyActionItemNum_C");
  }
}
@AtomGenClass("值")
class NumberValueGetItsStrategyActionUsedCounts extends NumberValueDelegate {
  public constructor() {
    super("MHtsNumberTriggerValueGetItsStrategyActionUsedCounts_C");
  }
}
@AtomGenClass("值")
class NumberValueGetItsStrategyActionTeamUsedCounts extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueGetItsStrategyActionTeamUsedCounts_C");
  }
}
@AtomGenClass("值")
class NumberValueAAIRandom extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueAAIRandom_C");
  }
}
@AtomGenClass("值")
class NumberValueAAIAbilityRandom extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueAAIAbilityRandom_C");
  }
}
@AtomGenClass("值")
class NumberValueAAIGetDist extends NumberValueDelegate {
  public constructor(
    public readonly Name0: string,
    public readonly Name1: string,
    public readonly Dimension: number
  ) {
    super("MHTsNumberTriggerValueAAIGetDist_C");
  }
}
@AtomGenClass("值")
class NumberValueGetAffinityDelegate extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueGetAffinity_C");
  }
}
@AtomGenClass("值")
class NumberTriggerValueAAIGetTimeSinceLastUseDelegate extends NumberValueDelegate {
  public constructor(private readonly AbilityName: string) {
    super("MHTsNumberTriggerValueAAIGetTimeSinceLastUse_C");
  }
}
@AtomGenClass("值")
class NumberTriggerValueAAIGetAngleDelegate extends NumberValueDelegate {
  public constructor(
    public readonly lhs: ActorValueDelegate,
    public readonly rhs: ActorValueDelegate
  ) {
    super("MHTsNumberTriggerValueAAIGetAngle_C");
  }
}
@AtomGenClass("值")
class NumberTriggerValueGetHitLockPointPart extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueGetHitLockPointPart_C");
  }
}
@AtomGenClass("值")
class NumberTriggerValueJoyStickAngle extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueJoyStickAngle_C");
  }
}
@AtomGenClass("值")
class BoolValueCheckAbilityCategory extends BoolValueDelegate {
  public constructor(public readonly SkillCategory: string) {
    super("MHTsBoolTriggerValueCheckAbilityCategory_C");
  }
}
@AtomGenClass("值")
class BoolValueCheckAbilityCategoryTimer extends BoolValueDelegate {
  public constructor(
    public readonly SkillCategory: string,
    public readonly TimeToCheck: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueCheckAbilityCategoryTimer_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckWeatherDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly Weather:
      | "Sunny"
      | "Cloudy"
      | "SmallRainy"
      | "LargeRainy"
      | "WindSandy"
      | "StormSandy"
      | "Turbulence"
      | "CoralWind"
      | "Miasma"
      | "AcidRain"
      | "HeatWave"
      | "VolcanicEruption"
  ) {
    super("MHTsBoolTriggerValueCheckWeather_C");
  }
}
@AtomGenClass("值")
class BoolValueAtLeastOneSurroundingMonster extends BoolValueDelegate {
  public constructor(
    public readonly SurroundingWhom: ActorValueDelegate,
    public readonly Radius: NumberValueDelegate,
    public readonly Filter: BoolValueDelegate
  ) {
    super("MHTsBoolTriggerValueAtLeastOneSurroundingMonster_C");
  }
}
@AtomGenClass("值")
class BoolValueActorHasTagsDelegate extends BoolValueDelegate {
  public readonly Tags: ReadonlyArray<string> = undefined;

  public constructor(
    public readonly Actor: ActorValueDelegate,
    ...Tags: readonly string[]
  ) {
    super("MHTsBoolTriggerValueActorHasTags_C");
    this.Tags = Tags;
  }
}
@AtomGenClass("值")
class BoolValueMonsterCanBeDeemedAsPostureDamageVulnerableDelegate extends BoolValueDelegate {
  public constructor(public readonly Who: ActorValueDelegate) {
    super("MHTsBoolTriggerValueMonsterCanBeDeemedAsPostureDamageVulnerable_C");
  }
}
@AtomGenClass("值")
class BoolValueCaptureNetRecommend extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCaptureNetRecommend_C");
  }
}
@AtomGenClass("值")
class BoolValueStoneRecommend extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueStoneRecommend_C");
  }
}
@AtomGenClass("值")
class BoolValueClutchClawRecommend extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueClutchClawRecommend_C");
  }
}
@AtomGenClass("值")
class BoolValueReinForcedBulletRecommend extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueReinForcedBulletRecommend_C");
  }
}
@AtomGenClass("值")
class BoolValueCheckRecommendTypeLevel extends BoolValueDelegate {
  private SettingRowName: string;
  private Level: string;
  public constructor(
    public readonly SettingRowNameVal: NumberValueConstDelegate,
    public readonly LevelVal: NumberValueConstDelegate
  ) {
    super("MHTsBoolTriggerValueCheckRecommendTypeLevel_C");
    this.SettingRowName = SettingRowNameVal.Constant.toString();
    this.Level = LevelVal.Constant.toString();
  }
}
@AtomGenClass("值")
class BoolValueCharacterTemperatureState extends BoolValueDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly StateName: string
  ) {
    super("MHTsBoolTriggerValueCharacterTemperatureState_C");
  }
}
@AtomGenClass("值")
class BoolValueCharacterSatiationState extends BoolValueDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly StateName: string
  ) {
    super("MHTsBoolTriggerValueCharacterSatiationState_C");
  }
}
@AtomGenClass("值")
class BoolValueCharacterHasEmitterFireBullet extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCharacterHasEmitterFireBullet_C");
  }
}

@AtomGenClass("值")
class BoolValueCharacterHasEmitterWaterBullet extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCharacterHasEmitterWaterBullet_C");
  }
}

@AtomGenClass("值")
class BoolValueCharacterHasEmitterCrystalBullet extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCharacterHasEmitterCrystalBullet_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckAdventureID extends BoolValueDelegate {
  AdventureID: number;
  public constructor(
    public readonly Who: ActorValueDelegate,
    @AtomGenParam({ descName: "冒险ID", type: Number, fildName: "AdventureID"})
    InAdventureID: NumberValueConstDelegate
  ) {
    super("MHTsBoolTriggerValueCheckAdventureID_C");
    this.AdventureID = InAdventureID.Constant;
  }
}

@AtomGenClass("值")
class BoolValueCheckAdventureType extends BoolValueDelegate {
  AdventureType: api.ENMAdventureAttributeType;
  public constructor(
    public readonly Who: ActorValueDelegate,
    AdventureType: string
  ) {
    super("MHTsBoolTriggerValueCheckAdventureType_C");
    if (AdventureType == `ATTACK`) {
      this.AdventureType =
        api.ENMAdventureAttributeType.ENMAdventureAttributeType_ATTACK;
    } else if (AdventureType == `COLLAPSE`) {
      this.AdventureType =
        api.ENMAdventureAttributeType.ENMAdventureAttributeType_COLLAPSE;
    } else if (AdventureType == `AUXILIARY`) {
      this.AdventureType =
        api.ENMAdventureAttributeType.ENMAdventureAttributeType_AUXILIARY;
    } else {
      this.AdventureType =
        api.ENMAdventureAttributeType.ENMAdventureAttributeType_Invalid;
    }
  }
}

@AtomGenClass("值")
class NumberTriggerValueTeamAdventureTypeNums extends NumberValueDelegate {
  /** 冒险家类型 */
  AdventureType: api.ENMAdventureAttributeType;
  public constructor(AdventureType: string) {
    super("MHTsNumberTriggerValueTeamAdventureTypeNums_C");
    if (AdventureType == `ATTACK`) {
      this.AdventureType =
        api.ENMAdventureAttributeType.ENMAdventureAttributeType_ATTACK;
    } else if (AdventureType == `COLLAPSE`) {
      this.AdventureType =
        api.ENMAdventureAttributeType.ENMAdventureAttributeType_COLLAPSE;
    } else if (AdventureType == `AUXILIARY`) {
      this.AdventureType =
        api.ENMAdventureAttributeType.ENMAdventureAttributeType_AUXILIARY;
    } else {
      this.AdventureType =
        api.ENMAdventureAttributeType.ENMAdventureAttributeType_Invalid;
    }
  }
}

@AtomGenClass("值")
class BoolTriggerValueCoopCombatSkillPerceptionBase extends BoolValueDelegate {
  public constructor() {
    super("BoolTriggerValueCoopCombatSkillPerceptionBase_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueMonsterHitTeammate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueMonsterHitTeammate_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueMonsterBeInBigStiffness extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueMonsterBeInBigStiffness_C");
  }
}
@AtomGenClass("值")
class BoolTriggerValueTeammateReleaseGP extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueTeammateReleaseGP_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueTeammateReleaseFinalSkill extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueTeammateReleaseFinalSkill_C");
  }
}
@AtomGenClass("值")
class BoolTriggerValuePetMasterAct extends BoolValueDelegate {
  public constructor(public readonly ActionType: string) {
    super("MHTsBoolTriggerValuePetMasterAct_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValuePetMasterHitMonster extends BoolValueDelegate {
  public Count: number;
  public constructor(
    public readonly DamageType: string,
    Count: NumberValueConstDelegate
  ) {
    super("MHTsBoolTriggerValuePetMasterHitMonster_C");
    this.Count = Count.Constant;
  }
}
@AtomGenClass("值")
class BoolValueCheckAttackTag extends BoolValueDelegate {
  public constructor(public readonly GameplayTag: string) {
    super("MHTsBoolTriggerValueCheckAttackTag_C");
  }
}

@AtomGenClass("值")
class BoolValueActorIsPerformingAbility extends BoolValueDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly GameplayTagNameOrAbilityConfigID: string
  ) {
    super("MHTsBoolTriggerValueActorIsPerformingAbility_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckActorUniquestrID extends BoolValueDelegate {
  public constructor(
    public readonly Target: ActorValueDelegate,
    public readonly UniquestrID: string
  ) {
    super("MHTsBoolTriggerValueCheckActorUniquestrID_C");
  }
}

@AtomGenClass("值")
class BoolValueActorIsInCertainMonsterBuffState extends BoolValueDelegate {
  public constructor(
    public readonly Actor: ActorValueDelegate,
    public readonly BuffStateName: string,
    public readonly BuffStateStage: any
  ) {
    super("MHTsBoolTriggerValueIsInCertainMonsterBuffState_C");
  }
}
@AtomGenClass("值")
class BoolTriggerValueMonsterInStiffnessStateDelegate extends BoolValueDelegate {
  public StiffnessType: EStiffnessType;
  public constructor(StiffnessType: string) {
    super("MHTsBoolTriggerValueMonsterInStiffnessState_C");
    this.StiffnessType = EStiffnessType[StiffnessType];
  }
}
@AtomGenClass("值")
class BoolValueActorIsConsumingItem extends BoolValueDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly AbilityConfigID: string,
    public readonly ItemID: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueActorIsConsumingItem_C");
  }
}

@AtomGenClass("值")
class BoolValueEMIsMaxComboDesire extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueEMIsMaxComboDesire_C");
  }
}

const FalseConstBoolValue = new BoolValueConstDelegate(false);
const TrueConstBoolValue = new BoolValueConstDelegate(true);
const ZeroConstNumberValue = new NumberValueConstDelegate(0);

@AtomGenClass("值")
class BoolValueBeOfDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly CheckCharacter: boolean,
    public readonly CheckPet: boolean,
    public readonly CheckMonster: boolean
  ) {
    super("MHTsBoolTriggerValueBeOf_C");
  }
}

@AtomGenClass("值")
class BoolValueIsCharacter extends BoolValueBeOfDelegate {
  public constructor(Who: ActorValueDelegate) {
    super(Who, true, false, false);
  }
}

@AtomGenClass("值")
class BoolValueIsPet extends BoolValueBeOfDelegate {
  public constructor(Who: ActorValueDelegate) {
    super(Who, false, true, false);
  }
}

@AtomGenClass("值")
class BoolValueIsMonster extends BoolValueBeOfDelegate {
  public constructor(Who: ActorValueDelegate) {
    super(Who, false, false, true);
  }
}

@AtomGenClass("值")
class BoolValueMonsterSleeping extends BoolValueDelegate {
  public constructor(public readonly Monster: ActorValueDelegate) {
    super("ArashiBoolTriggerValueMonsterIsSleeping_C");
  }
}

@AtomGenClass("值")
class BoolValueAttackingBrokenPart extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueIsBrokenPartAttacked_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckBrightMossAvilable extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolValueCheckBrightMossAvilable_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckPuddlePodAvilable extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolValueCheckPuddlePodAvilable_C");
  }
}

@AtomGenClass("值")
class BoolValueBinaryOperatorOnNumberDelegate extends BoolValueDelegate {
  public constructor(
    public readonly lhs: NumberValueDelegate,
    public readonly operator: ue.EMHBoolTriggerValueBinaryOperatorOnNumber,
    public readonly rhs: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueBinaryOperatorOnNumber_C");

    return FConstantFoldingHelper.ReplaceBoolBinaryOperatorOnNumber(
      this
    ) as any;
  }
}

const ConstantFoldingEnabled = true;
function ConstantFoldingSwitchDecorator(
  target: any,
  PropertyKey: string,
  descriptor: PropertyDescriptor
) {
  const Fn = descriptor.value;
  descriptor.value = function (this: any, ...args: any[]) {
    if (ConstantFoldingEnabled) return Fn.call(this, ...args);
    return undefined;
  };
}

abstract class FConstantFoldingHelper {
  public static ReplaceBoolBinaryOperatorOnBool(
    expr: BoolValueBinaryOperatorOnBoolDelegate
  ): BoolValueDelegate {
    return expr;
    // if (
    //   !(expr.lhs instanceof BoolValueConstDelegate) ||
    //   !(expr.rhs instanceof BoolValueConstDelegate)
    // )
    //   return undefined;

    // switch (expr.operator) {
    //   case ue.EMHBoolTriggerValueBinaryOperatorOnBool.LogicalAnd:
    //     return new BoolValueConstDelegate(
    //       expr.lhs.BoolConst && expr.rhs.BoolConst
    //     );

    //   case ue.EMHBoolTriggerValueBinaryOperatorOnBool.LogicalOr:
    //     return new BoolValueConstDelegate(
    //       expr.lhs.BoolConst || expr.rhs.BoolConst
    //     );
    // }

    // console.error(
    //   `[Atom][ConstantFolding] enum error: [${
    //     ue.EMHBoolTriggerValueBinaryOperatorOnBool[expr.operator]
    //   }]`
    // ); // eslint-disable-line prettier/prettier
    // return undefined;
  }

  public static ReplaceBoolBinaryOperatorOnNumber(
    expr: BoolValueBinaryOperatorOnNumberDelegate
  ): BoolValueDelegate {
    return expr;
    // if (
    //   !(expr.lhs instanceof NumberValueConstDelegate) ||
    //   !(expr.rhs instanceof NumberValueConstDelegate)
    // )
    //   return undefined;

    // switch (expr.operator) {
    //   case ue.EMHBoolTriggerValueBinaryOperatorOnNumber.EqualTo:
    //     return new BoolValueConstDelegate(
    //       expr.lhs.Constant === expr.rhs.Constant
    //     );

    //   case ue.EMHBoolTriggerValueBinaryOperatorOnNumber.Greater:
    //     return new BoolValueConstDelegate(
    //       expr.lhs.Constant > expr.rhs.Constant
    //     );

    //   case ue.EMHBoolTriggerValueBinaryOperatorOnNumber.GreaterEqual:
    //     return new BoolValueConstDelegate(
    //       expr.lhs.Constant >= expr.rhs.Constant
    //     );

    //   case ue.EMHBoolTriggerValueBinaryOperatorOnNumber.Less:
    //     return new BoolValueConstDelegate(
    //       expr.lhs.Constant < expr.rhs.Constant
    //     );

    //   case ue.EMHBoolTriggerValueBinaryOperatorOnNumber.LessEqual:
    //     return new BoolValueConstDelegate(
    //       expr.lhs.Constant <= expr.rhs.Constant
    //     );

    //   case ue.EMHBoolTriggerValueBinaryOperatorOnNumber.NotEqualTo:
    //     return new BoolValueConstDelegate(
    //       expr.lhs.Constant !== expr.rhs.Constant
    //     );
    // }

    // console.error(
    //   `[Atom][ConstantFolding] enum error: [${
    //     ue.EMHBoolTriggerValueBinaryOperatorOnNumber[expr.operator]
    //   }]`
    // ); // eslint-disable-line prettier/prettier
    // return undefined;
  }

  public static ReplaceNumberBinaryOperator(
    expr: NumberValueBinaryOperatorDelegate
  ): NumberValueDelegate {
    return expr;
    // if (
    //   !(expr.lhs instanceof NumberValueConstDelegate) ||
    //   !(expr.rhs instanceof NumberValueConstDelegate)
    // )
    //   return undefined;

    // switch (expr.operator) {
    //   case ue.EMHNumberTriggerValueBinaryOperator.Divides:
    //     return new NumberValueConstDelegate(
    //       expr.lhs.Constant / expr.rhs.Constant
    //     );

    //   case ue.EMHNumberTriggerValueBinaryOperator.Max:
    //     return new NumberValueConstDelegate(
    //       Math.max(expr.lhs.Constant, expr.rhs.Constant)
    //     );

    //   case ue.EMHNumberTriggerValueBinaryOperator.Min:
    //     return new NumberValueConstDelegate(
    //       Math.min(expr.lhs.Constant, expr.rhs.Constant)
    //     );

    //   case ue.EMHNumberTriggerValueBinaryOperator.Minus:
    //     return new NumberValueConstDelegate(
    //       expr.lhs.Constant - expr.rhs.Constant
    //     );

    //   case ue.EMHNumberTriggerValueBinaryOperator.Modulus:
    //     return new NumberValueConstDelegate(
    //       expr.lhs.Constant % expr.rhs.Constant
    //     );

    //   case ue.EMHNumberTriggerValueBinaryOperator.Multiplies:
    //     return new NumberValueConstDelegate(
    //       expr.lhs.Constant * expr.rhs.Constant
    //     );

    //   case ue.EMHNumberTriggerValueBinaryOperator.Plus:
    //     return new NumberValueConstDelegate(
    //       expr.lhs.Constant + expr.rhs.Constant
    //     );
    // }

    // console.error(
    //   `[Atom][ConstantFolding] enum error: [${
    //     ue.EMHNumberTriggerValueBinaryOperator[expr.operator]
    //   }]`
    // ); // eslint-disable-line prettier/prettier
    // return undefined;
  }

  public static ReplaceNumberValueUnaryOperator(
    expr: NumberValueUnaryOperatorDelegate
  ): NumberValueDelegate {
    return expr;
    // if (expr.Operand instanceof NumberValueConstDelegate)
    //   return new NumberValueConstDelegate(-expr.Operand.Constant) as any;

    // if (expr.Operand instanceof NumberValueUnaryOperatorDelegate)
    //   return expr.Operand.Operand as any;

    // return undefined;
  }

  public static ReplaceBoolValueUnaryOperator(
    expr: BoolValueNotDelegate
  ): BoolValueDelegate {
    return expr;
    // if (expr.Value instanceof BoolValueConstDelegate)
    //   return new BoolValueConstDelegate(!expr.Value.BoolConst) as any;
    // return undefined;
  }

  public static ReplaceClamp(
    expr: NumberValueClampDelegate
  ): NumberValueDelegate {
    return expr;
  //   if (
  //     !(expr.inp instanceof NumberValueConstDelegate) ||
  //     !(expr.max instanceof NumberValueConstDelegate) ||
  //     !(expr.min instanceof NumberValueConstDelegate)
  //   )
  //     return undefined;

  //   if (expr.inp.Constant < expr.min.Constant)
  //     return new NumberValueConstDelegate(expr.min.Constant);

  //   return new NumberValueConstDelegate(
  //     expr.max.Constant < expr.inp.Constant
  //       ? expr.max.Constant
  //       : expr.inp.Constant
  //   );
  }
}

@AtomGenClass("值")
class BoolValueFallingWithinTheIntervalDelegate extends BoolValueDelegate {
  public readonly LeftOpen: boolean = undefined;
  public readonly RightOpen: boolean = undefined;

  public constructor(
    public readonly TargetNumber: NumberValueDelegate,

    public readonly LeftEndPoint: NumberValueDelegate,
    LeftOpen: BoolValueConstDelegate,

    public readonly RightEndPoint: NumberValueDelegate,
    RightOpen: BoolValueConstDelegate
  ) {
    super("MHTsBoolTriggerValueFallingWithinTheInterval_C");

    this.LeftOpen = LeftOpen.BoolConst;
    this.RightOpen = RightOpen.BoolConst;
  }
}

@AtomGenClass("值")
class BoolValueFallingWithinTheClosedInterval extends BoolValueFallingWithinTheIntervalDelegate {
  public constructor(
    TargetNumber: NumberValueDelegate,
    LeftEndPoint: NumberValueDelegate,
    RightEndPoint: NumberValueDelegate
  ) {
    super(
      TargetNumber,
      LeftEndPoint,
      FalseConstBoolValue,
      RightEndPoint,
      FalseConstBoolValue
    );
  }
}

@AtomGenClass("值")
class BoolValueIsTheSameActorDelegate extends BoolValueDelegate {
  public constructor(
    public readonly lhs: ActorValueDelegate,
    public readonly rhs: ActorValueDelegate
  ) {
    super("MHTsBoolTriggerValueIsTheSameActor_C");
  }
}

@AtomGenClass("值")
class BoolValuePetSkillCDDelegate extends BoolValueDelegate {
  public constructor(public readonly PetSkillID: NumberValueDelegate) {
    super("MHTsBoolTriggerValuePetSkillCD_C");
  }
}

@AtomGenClass("值")
class BoolValuePetSkillEnergyDelegate extends BoolValueDelegate {
  public constructor(public readonly PetSkillID: NumberValueDelegate) {
    super("MHTsBoolTriggerValuePetSkillEnergy_C");
  }
}

@AtomGenClass("值")
class BoolValuePetSkillPriorityDelegate extends BoolValueDelegate {
  public constructor(public readonly PetSkillID: NumberValueDelegate) {
    super("MHTsBoolTriggerValuePetSkillPriority_C");
  }
}

@AtomGenClass("值")
class BoolValuePetCheckControllerFlagDelegate extends BoolValueDelegate {
  public constructor(public readonly FlagName: string) {
    super("MHTsBoolTriggerValuePetCheckControllerFlag_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckWeaponTypeDelegate extends BoolValueDelegate {
  public readonly WeaponType: api.ENMWeaponType;

  public constructor(
    public readonly Who: ActorValueDelegate,
    WeaponType: api.ENMWeaponType | NumberValueConstDelegate
  ) {
    super("ArashiBoolTriggerValueCheckWeaponType_C");
    this.WeaponType =
      typeof WeaponType === "number" ? WeaponType : WeaponType.Constant;
  }
}
@AtomGenClass("值")
class BoolValueCheckWeaponStateDelegate extends BoolValueDelegate {
  public readonly WeaponState: number;
  public constructor(WeaponState: NumberValueConstDelegate) {
    super("MHTsBoolTriggerValueCheckWeaponState_C");
    this.WeaponState = WeaponState.Constant;
  }
}

@AtomGenClass("值")
class BoolValuePetMasterWeaponTypeDelegate extends BoolValueDelegate {
  public readonly Cases = new Array<NumberValueDelegate>();
  public constructor(...Cases: readonly NumberValueDelegate[]) {
    super("MHTsBoolTriggerValuePetMasterWeaponType_C");
    for (const Case of Cases)
      if (Case instanceof NumberValueDelegate) {
        this.Cases.push(Case);
      } else {
        console.error(
          "[AtomSystem][Parser] BoolValuePetMasterWeaponTypeDelegate switch case type error encountered"
        );
      }
  }
}

@AtomGenClass("值")
class BoolValuePetIsFreeDelegate extends BoolValueDelegate {
  public constructor(public readonly PetSkillID: NumberValueDelegate) {
    super("MHTsBoolTriggerValuePetIsFree_C");
  }
}

@AtomGenClass("值")
class BoolValuePetIsFlyingDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValuePetIsFlying_C");
  }
}

@AtomGenClass("值")
class BoolValueAnyAdventurerHealthPercentLowerThan extends BoolValueDelegate {
  public constructor(public readonly Threshold: NumberValueDelegate) {
    super("MHTsBoolTriggerValueAnyAdventurerHealthPercentLowerThan_C");
  }
}
@AtomGenClass("值")
class BoolValueAnyActorAttributeLowerThan extends BoolValueDelegate {
  public constructor(
    public readonly TargetType: string,
    public readonly LeftAttr: string,
    public readonly LeftThreshold: NumberValueDelegate,
    public readonly RightAttr: string,
    public readonly RightThreshold: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueAnyActorAttributeLowerThan_C");
  }
}

@AtomGenClass("值")
class BoolValuePetHasHelpTargetDelegate extends BoolValueDelegate {
  public constructor(public readonly HelpType: string) {
    super("MHTsBoolTriggerValuePetHasHelpTarget_C");
  }
}

@AtomGenClass("值")
class BoolValuePetCheckAndSetHealTargetDelegate extends BoolValueDelegate {
  public constructor(
    public readonly MasterHealthPercentage: number,
    public readonly TeamMateHealthPercentage: number,
    public readonly TargetDistThreshold: number
  ) {
    super("MHTsBoolTriggerValuePetCheckAndSetHealTarget_C");
  }
}

@AtomGenClass("值")
class BoolValuePetHasSkillDelegate extends BoolValueDelegate {
  public constructor(public readonly SkillID: NumberValueDelegate) {
    super("MHTsBoolTriggerValuePetHasSkill_C");
  }
}

@AtomGenClass("值")
class BoolValuePetMasterCanBird extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValuePetMasterCanBird_C");
  }
}

@AtomGenClass("值")
class BoolValueCharacterSufferingFromDelegate extends BoolValueDelegate {
  public readonly StatusEffectNames: ReadonlyArray<string> = undefined;

  public constructor(...InStatusEffectName: readonly string[]) {
    super("MHTsBoolTriggerValueCharacterSufferingFrom_C");
    this.StatusEffectNames = InStatusEffectName;
  }
}

@AtomGenClass("值")
class BoolValueCharacterSufferingFromStatusEffectDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCharacterSufferingFromStatusEffect_C");
  }
}

@AtomGenClass("值")
class BoolValueAnyActorSufferingFromStatusEffectDelegate extends BoolValueDelegate {
  // eslint-disable-next-line prettier/prettier
  public constructor(
    public readonly TargetType: string,
    public readonly ThresholdNum: NumberValueDelegate
  ) {
    super("MHtsBoolTriggerValueAnyActorSufferingFromStatusEffect_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueTryGetTeamActionTokenDelegate extends BoolValueDelegate {
  public constructor(
    public readonly MaxTokenNumForThisAction: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueTryGetTeamActionToken_C");
  }
}

@AtomGenClass("值")
class BoolValueAffinityHitDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueAffinityHit_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckAttackPhysicalTypeDelegate extends BoolValueDelegate {
  public readonly PhysicalType: ue.EMHPhysicType;
  public constructor(PhysicalType: keyof typeof ue.EMHPhysicType) {
    super("ArashiBoolTriggerValueCheckAttackPhysicalType_C");
    this.PhysicalType = ue.EMHPhysicType[PhysicalType];
  }
}

@AtomGenClass("值")
class BoolValueCheckAttackIsBySkillHitId extends BoolValueDelegate {
  public constructor(public readonly SkillHitId: string) {
    super("ArashiBoolTriggerValueCheckAttackIsBySkillHitId_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckAttackIsBySkillSlot extends BoolValueDelegate {
  public constructor(public readonly SkillSlotName: string) {
    super("ArashiBoolTriggerValueCheckAttackIsBySkillSlot_C");
  }
}

@AtomGenClass("值")
class BoolValueIsDamageOverTimeDelegate extends BoolValueDelegate {
  public constructor() {
    super("ArashiBoolTriggerValueIsDamageOverTime_C");
  }
}

@AtomGenClass("值")
class BoolValueElementalCriticalHitDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueElementalCriticalHit_C");
  }
}

@AtomGenClass("值")
class BoolValueAttackFromCertainAmmo extends BoolValueDelegate {
  public readonly AmmoConfigID: string = undefined;

  public constructor(
    @AtomGenParam({ descName: "AmmoConfigID", type: String })
    AmmoConfigID: string | NumberValueConstDelegate) {
    super("MHTsBoolTriggerValueAttackFromCertainAmmo_C");

    this.AmmoConfigID =
      typeof AmmoConfigID === "string"
        ? AmmoConfigID
        : AmmoConfigID.Constant.toString(); // eslint-disable-line
  }
}

@AtomGenClass("值")
class NumberValueCharacterCombatTimeDelegate extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueCharacterCombatTime_C");
  }
}

@AtomGenClass("值")
class NumberValueRandomDelegate extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueRandom_C");
  }
}

@AtomGenClass("值")
class BoolValueBinaryOperatorOnBoolDelegate extends BoolValueDelegate {
  public constructor(
    public readonly lhs: BoolValueDelegate,
    @AtomGenParam({ descName: "操作符", type: ue.EMHBoolTriggerValueBinaryOperatorOnBool})
    public readonly operator: ue.EMHBoolTriggerValueBinaryOperatorOnBool,
    public readonly rhs: BoolValueDelegate
  ) {
    super("MHTsBoolTriggerValueBinaryOperatorOnBoolean_C");

    return FConstantFoldingHelper.ReplaceBoolBinaryOperatorOnBool(this) as any;
  }
}

@AtomGenClass("值")
class BoolValueNotDelegate extends BoolValueDelegate {
  public constructor(public readonly Value: BoolValueDelegate) {
    super("MHTsBoolTriggerValueNot_C");

    return FConstantFoldingHelper.ReplaceBoolValueUnaryOperator(this) as any;
  }
}

@AtomGenClass("值")
class BoolValueCheckContextAbilityHasTagDelegate extends BoolValueDelegate {
  public constructor(
    public readonly TagName: string,
    @AtomGenParam({ descName: "技能槽位", type: EAbilityType })
    public readonly SkillSlotName: EAbilityType | ""
  ) {
    super("MHTsBoolTriggerValueCheckContextAbilityHasTag_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckContextAbilityHasTag extends BoolValueCheckContextAbilityHasTagDelegate {
  public constructor(TagName: string) {
    super(TagName, "");
  }
}

@AtomGenClass("值")
class BoolValueCheckContextAbilityIsFromSkillSlot extends BoolValueCheckContextAbilityHasTagDelegate {
  public constructor(SkillSlotName: EAbilityType) {
    super("", SkillSlotName);
  }
}

@AtomGenClass("值")
class BoolValueCheckDefenseSuccess extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCheckDefenseSuccess_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckFieldConfigIDDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Target: ActorValueDelegate,
    public readonly FieldConfigID: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueCheckFieldConfigID_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckPrecisionDefense extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCheckPrecisionDefense_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckCharacterMotionModeDelegate extends BoolValueDelegate {
  public constructor(public readonly MotionModeName: string) {
    super("MHTsBoolTriggerValueCheckCharacterMotionMode_C");
  }
}

@AtomGenClass("值")
class BoolValueIsActorInAirDelegate extends BoolValueDelegate {
  public constructor(public readonly ActorToCheck: ActorValueDelegate) {
    super("MHTsBoolTriggerValueIsActorInAir_C");
  }
}

@AtomGenClass("值")
class BoolValueAttackFromSocket extends BoolValueDelegate {
  public constructor(public readonly SocketName: string) {
    super("MHTsBoolTriggerValueAttackFromSocket_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMCreatureStateDelegate extends BoolValueDelegate {
  public constructor(public readonly TagName: string) {
    super("MHTsBoolTriggerValueCheckEMCreatureState_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMTeamIndexDelegate extends BoolValueDelegate {
  public constructor(
    public readonly TeamIndex: number | NumberValueConstDelegate
  ) {
    super("MHTsBoolTriggerValueCheckEMTeamIndex_C");
    if (TeamIndex instanceof NumberValueConstDelegate) {
      this.TeamIndex = TeamIndex.Constant;
    } else {
      this.TeamIndex = TeamIndex;
    }
  }
}

@AtomGenClass("值")
class BoolValueCheckEMStageIdDelegate extends BoolValueDelegate {
  public constructor(
    public readonly StageId: number | NumberValueConstDelegate
  ) {
    super("MHTsBoolTriggerValueCheckEMStageId_C");
    if (StageId instanceof NumberValueConstDelegate) {
      this.StageId = StageId.Constant;
    } else {
      this.StageId = StageId;
    }
  }
}

@AtomGenClass("值")
class BoolValueAAIMonsterInStiffnessTypeDelegate extends BoolValueDelegate {
  public constructor(public readonly StiffnessType: string) {
    super("MHTsBoolTriggerValueAAIMonsterInStiffnessType_C");
  }
}
@AtomGenClass("值")
class BoolValueCheckPilotModeWithDodgeBtnDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCheckPilotModeWithDodgeBtn_C");
  }
}
@AtomGenClass("值")
class BoolValueCheckPilotModeWithSheatheBtnDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCheckPilotModeWithSheatheBtn_C");
  }
}

@AtomGenClass("值")
class BoolValueAAICheckInUnfriendlyFieldDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueAAICheckInUnfriendlyField_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckEMTargetHealDelegate extends BoolValueDelegate {
  public constructor(public readonly BackTraceTime: NumberValueDelegate) {
    super("MHTsBoolTriggerValueCheckEMTargetHeal_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckEMTargetSufferingFromDelegate extends BoolValueDelegate {
  public readonly StatusEffectNames: ReadonlyArray<string> = undefined;

  public constructor(...InStatusEffectName: readonly string[]) {
    super("MHTsBoolTriggerValueCheckEMTargetSufferingFrom_C");
    this.StatusEffectNames = InStatusEffectName;
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckEMTargetHelplessDelegate extends BoolValueDelegate {
  public constructor(public readonly Level: string) {
    super("MHTsBoolTriggerValueCheckEMTargetHelpless_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckEMLostHpInSpanDelegate extends BoolValueDelegate {
  public constructor(
    public readonly BackTraceTime: NumberValueDelegate,
    public readonly HpPercent: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueCheckEMLostHpInSpan_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckEMTargetHpPercentDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Op: string,
    public readonly HpPercent: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueCheckEMTargetHpPercent_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckEMTargetAngleDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Op: string,
    public readonly Angle: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueCheckEMTargetAngle_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckEMTargetDistanceDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Op: string,
    public readonly Distance: NumberValueDelegate,
    public readonly Check2D: boolean
  ) {
    super("MHTsBoolTriggerValueCheckEMTargetDistance_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckDistanceBetweenActorsDelegate extends BoolValueDelegate {
  public constructor(
    public readonly SourceActor: ActorValueDelegate,
    public readonly TargetActor: ActorValueDelegate,
    public readonly Op: string,
    public readonly Distance: NumberValueDelegate,
    private readonly Check2D: boolean
  ) {
    super("MHTsBoolTriggerValueCheckDistanceBetweenActors_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueCheckEMTargetDamageCountDelegate extends BoolValueDelegate {
  public constructor(
    public readonly BackTraceTime: NumberValueDelegate,
    public readonly DamageCount: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueCheckEMTargetDamageCount_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMCreatureStateByActorDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Target: ActorValueDelegate,
    public readonly TagName: string
  ) {
    super("MHTsBoolTriggerValueCheckEMCreatureStateByActor_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMAbilityHasTagByActorDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Target: ActorValueDelegate,
    public readonly TagName: string
  ) {
    super("MHTsBoolTriggerValueCheckEMAbilityHasTagByActor_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMAIStateByActorDelegate extends BoolValueDelegate {
  public Target: ActorValueDelegate;
  public TargetAIState: EMAIStateType;
  public constructor(
    Target: ActorValueDelegate,
    TargetAIState: number | NumberValueConstDelegate
  ) {
    super("MHTsBoolTriggerValueCheckEMAIStateByActor_C");
    this.Target = Target;
    if (typeof TargetAIState === "number") {
      this.TargetAIState = TargetAIState;
    } else {
      this.TargetAIState = TargetAIState.Constant;
    }
  }
}

@AtomGenClass("值")
class BoolValueCheckEMIsBossMonsterDelegate extends BoolValueDelegate {
  public constructor(public readonly Target: ActorValueDelegate) {
    super("MHTsBoolTriggerValueCheckEMIsBossMonster_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMIsInTurfWarDelegate extends BoolValueDelegate {
  public constructor(public readonly Target: ActorValueDelegate) {
    super("MHTsBoolTriggerValueCheckEMIsInTurfWar_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMStiffnessTypeByActorDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Target: ActorValueDelegate,
    public readonly StiffnessType: string
  ) {
    super("MHTsBoolTriggerValueCheckEMStiffnessTypeByActor_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMIsTargetMonsterByArchetypeIDDelegate extends BoolValueDelegate {
  public constructor(
    public readonly Monster: ActorValueDelegate,
    public readonly TargetArchetypeID: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueCheckEMIsTargetMonsterByArchetypeID_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckIsTargetEnvMonsterByRowNameDelegate extends BoolValueDelegate {
  public constructor(
    public readonly EnvMonster: ActorValueDelegate,
    public readonly TargetRowName: NumberValueDelegate
  ) {
    super("MHTsBoolTriggerValueCheckIsTargetEnvMonsterByRowName_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckHasSkillSplineDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCheckHasSkillSpline_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMInClimbArea extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCheckEMInClimbArea_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckEMInFoodState extends BoolValueDelegate {
  public constructor(public readonly FoodID: string) {
    super("MHTsBoolTriggerValueCheckEMInFoodState_C");
  }
}

@AtomGenClass("值")
class BoolTriggerValueAAICheckIsSpecAIDelegate extends BoolValueDelegate {
  public constructor(public readonly OfWhom: ActorValueDelegate) {
    super("MHTsBoolTriggerValueAAICheckIsSpecAI_C");
  }
}

@AtomGenClass("值")
class BoolValueAAINeedDodge extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueAAINeedDodge_C");
  }
}

@AtomGenClass("值")
class BoolValueAAINeedCounterDamage extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueAAINeedCounterDamage_C");
  }
}

@AtomGenClass("值")
class BoolValueAAIHasSkillGroup extends BoolValueDelegate {
  public constructor(public readonly SkillGroup: NumberValueDelegate) {
    super("MHTsBoolTriggerValueAAIHasSkillGroup_C");
  }
}

@AtomGenClass("值")
class BoolValueAAIHasCommand extends BoolValueDelegate {
  public constructor(public readonly Command: string) {
    super("MHTsBoolTriggerValueAAIHasCommand_C");
  }
}

@AtomGenClass("值")
class BoolValueNeedDodge extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueNeedDodge_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckPlayerInMonsterAggro extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerVlaueCheckPlayerInMonsterAggro_C");
  }
}

abstract class TaskDelegate extends DelegateBase {
  // fixed
  public readonly Name = "";
  public readonly bIsEnableOverride = false;
  public readonly bEnableOverride = false;
  public readonly bIsEnableByCustomValue = false;
  public readonly EnableCustomValueKey = "";
  public readonly bToEnd = true;
  public readonly bSingleFrame = false;
  public readonly BeginTime = 0;
  public readonly bDisabled = false;
  public readonly DebugString = "";
  public readonly bIsEndTimeOverrideByCustomValue = false;
  public readonly EndTimeOverrideCustomValueKey = "";

  // variables

  public constructor(
    ClassName: string,
    public readonly EndTime: number,
    public readonly TaskPath: string,
    public readonly TaskConfigID: string,
    public readonly Realm: ue.EMHAbilityTaskRealm = ue.EMHAbilityTaskRealm.All,
    public readonly bImportant = false,
    public readonly bNoNeedResource = false,
    public readonly bUpdateSignificant = false,
    public readonly bAbilityFrequencyInHighPriorityActorOverride = false,
    public readonly AbilityFrequencyInHighPriorityActorOverrideInterval = 0,
    public readonly bAbilityFrequencyInLowPriorityActorOverride = false,
    public readonly AbilityFrequencyInLowPriorityActorOverrideInterval = 0,
    public readonly AbilityFrequencyOverride = 0
  ) {
    super(ClassName);
  }
}

@AtomGenClass("技能")
class ModifyAbilitySpeedTaskDelegate extends TaskDelegate {
  public readonly SpeedModification: number;

  public constructor(
    public readonly AbilityTag: string,
    SpeedModification: number | NumberValueConstDelegate
  ) {
    super(
      "ArashiAbilityTaskModifyAbilitySpeed_C",
      1048576,
      "AbilityTasks/Character/Ability/ArashiAbilityTaskModifyAbilitySpeed",
      "ArashiAbilityTaskModifyAbilitySpeed",
      ue.EMHAbilityTaskRealm.All
    );

    this.SpeedModification =
      typeof SpeedModification === "number"
        ? SpeedModification
        : SpeedModification.Constant;
  }
}

@AtomGenClass("速度")
class ModifyMonsterMotionSpeedTaskDelegate extends TaskDelegate {
  public readonly AbilityMotionModifying: number;
  public readonly OtherMotionModifying: number;

  public constructor(
    AbilityMotionModifying: number | NumberValueConstDelegate,
    OtherMotionModifying: number | NumberValueConstDelegate
  ) {
    super(
      "ArashiAbilityTaskModifyMonsterMotionSpeed_C",
      1048576,
      "AbilityTasks/Monster/Motion/ArashiAbilityTaskModifyMonsterMotionSpeed",
      "ArashiAbilityTaskModifyMonsterMotionSpeed",
      ue.EMHAbilityTaskRealm.All
    );

    this.AbilityMotionModifying =
      typeof AbilityMotionModifying === "number"
        ? AbilityMotionModifying
        : AbilityMotionModifying.Constant; // eslint-disable-line prettier/prettier
    this.OtherMotionModifying =
      typeof OtherMotionModifying === "number"
        ? OtherMotionModifying
        : OtherMotionModifying.Constant; // eslint-disable-line prettier/prettier
  }
}

@AtomGenClass("开")
class ReviveTeamAdventurerOnLifeClaimTaskDelegate extends TaskDelegate {
  public readonly HealthRatioAfterRevive: number = undefined;
  public readonly CoolDown: number = undefined;
  public readonly CoolDownId: string = undefined;

  public constructor(
    HealthRatioAfterRevive: NumberValueConstDelegate,
    CoolDown: NumberValueConstDelegate
  ) {
    super(
      "MHTsTaskReviveTeamAdventurerOnLifeClaim_C",
      1048576,
      "AbilityTasks/Attribute/MHTsTaskReviveTeamAdventurerOnLifeClaim",
      "MHTsTaskReviveTeamAdventurerOnLifeClaim",
      ue.EMHAbilityTaskRealm.ServerOnly
    );

    this.HealthRatioAfterRevive = HealthRatioAfterRevive.Constant;
    this.CoolDown = CoolDown.Constant;
    this.CoolDownId = GetIntUniqueToAbility();
  }
}

@AtomGenClass("耐力值")
class PauseStaminaRegenerationTaskDelegate extends TaskDelegate {
  public constructor() {
    super(
      "ArashiAbilityTaskPauseStaminaRegeneration_C",
      1048576,
      "AbilityTasks/Character/Attribute/ArashiAbilityTaskPauseStaminaRegeneration",
      "ArashiAbilityTaskPauseStaminaRegeneration",
      ue.EMHAbilityTaskRealm.LocalOnly,
      undefined,
      true
    );
  }
}

@AtomGenClass("PartyBuffTaskDelegate")
class PartyBuffTaskDelegate extends TaskDelegate {
  public readonly BuffId: string = undefined;
  public readonly IgnoreBuffSource: boolean = false;

  public constructor(
    BuffId: NumberValueConstDelegate,
    IgnoreBuffSource: boolean | BoolValueConstDelegate = false
  ) {
    super(
      "MHTsAbilityTaskPartyBuff_C",
      1048576,
      "AbilityTasks/Common/Buff/MHTsAbilityTaskPartyBuff",
      "MHTsAbilityTaskPartyBuff",
      ue.EMHAbilityTaskRealm.ServerOnly
    );

    this.BuffId = BuffId.Constant.toString();
    if (typeof IgnoreBuffSource == "boolean") {
      this.IgnoreBuffSource = IgnoreBuffSource;
    } else {
      this.IgnoreBuffSource = IgnoreBuffSource.BoolConst;
    }
  }
}

@AtomGenClass("技能")
class CoopCombatPursuitSkillSwitchTaskDelegate extends TaskDelegate {
  public constructor() {
    super(
      "MHTsCoopCombatPursuitSkillSwitch_C",
      1048576,
      "AbilityTasks/Common/Buff/MHTsCoopCombatPursuitSkillSwitch",
      "MHTsCoopCombatPursuitSkillSwitch",
      ue.EMHAbilityTaskRealm.LocalOnly
    );
  }
}

@AtomGenClass("DuyaoniaoSpecialShootTaskDelegate")
class DuyaoniaoSpecialShootTaskDelegate extends TaskDelegate {
  bDot: boolean;
  bHPLoss: boolean;
  DamageBase: number;
  BuffHitConfigID: string;
  bInterruptSleepStatusEffect: boolean;
  SpecifiedBoneNames = new Array<string>();
  TimePoints = new Array<number>();
  public constructor(
    bDoT: BoolValueConstDelegate,
    bHPLoss: BoolValueConstDelegate,
    DamageBase: NumberValueConstDelegate,
    BuffHitConfigID: string | NumberValueConstDelegate,
    TimePoints: string,
    SpecifiedBoneName: string,
    bInterruptSleepStatusEffect = true
  ) {
    super(
      "MHAbilityTask_DuyaoniaoSpecialShoot_C",
      1048576,
      "AbilityTasks/Character/Bow/MHAbilityTask_DuyaoniaoSpecialShoot",
      "MHAbilityTask_DuyaoniaoSpecialShoot",
      ue.EMHAbilityTaskRealm.All
    );
    this.bDot = bDoT.BoolConst;
    this.bHPLoss = bHPLoss.BoolConst;
    this.DamageBase = DamageBase.Constant;
    if (BuffHitConfigID instanceof NumberValueConstDelegate)
      BuffHitConfigID = BuffHitConfigID.Constant.toString();
    (this as Mutable<DuyaoniaoSpecialShootTaskDelegate>).BuffHitConfigID =
      BuffHitConfigID;
    this.bInterruptSleepStatusEffect = bInterruptSleepStatusEffect;
    const SpecifiedBoneNames = SpecifiedBoneName.slice(1, -1).split("|");
    for (const BoneName of SpecifiedBoneNames) {
      this.SpecifiedBoneNames.push(BoneName);
    }
    const TimePointss = TimePoints.slice(1, -1).split("|");
    for (const TimePoint of TimePointss) {
      this.TimePoints.push(Number(TimePoint) / 1000.0);
    }
  }
}

@AtomGenClass("TmpIncreaseMonsterToughnessTaskDelegate")
class TmpIncreaseMonsterToughnessTaskDelegate extends TaskDelegate {
  public constructor(public readonly Increase: NumberValueDelegate) {
    super(
      "MHTsTaskMonsterIncreaseInitToughnessMaxValue_C",
      1048576,
      "AbilityTasks/Monster/MHTsTaskMonsterIncreaseInitToughnessMaxValue",
      "MHTsTaskMonsterIncreaseInitToughnessMaxValue",
      ue.EMHAbilityTaskRealm.ServerOnly
    );
  }
}

@AtomGenClass("角色")
class CharacterMovementSpeedModificationTaskDelegate extends TaskDelegate {
  public constructor(
    public readonly Category: string,
    public readonly MainModi: NumberValueDelegate,
    public readonly AcceModi: NumberValueDelegate
  ) {
    super(
      "MHTsAbilityTaskMovementSpeedModification_C",
      1048576,
      "AbilityTasks/Character/Motion/MHTsAbilityTaskMovementSpeedModification",
      "MHTsAbilityTaskMovementSpeedModification",
      ue.EMHAbilityTaskRealm.All,
      false,
      true,
      false
    );
  }
}

@AtomGenClass("EMModificationSightPerceptionDelegate")
class EMModificationSightPerceptionDelegate extends TaskDelegate {
  public readonly DistanceScale: number = undefined;
  public readonly AngleScale: number = undefined;
  public constructor(
    public readonly ConfigDistanceScale: NumberValueConstDelegate,
    public readonly ConfigAngleScale: NumberValueConstDelegate
  ) {
    super(
      "MHAbilityTask_EM_AdjustSightPerception_C",
      1048576,
      "AbilityTasks/Monster/GamePlay/MHAbilityTask_EM_AdjustSightPerception",
      "EMModificationSightPerceptionDelegate",
      ue.EMHAbilityTaskRealm.ServerOnly
    );
    this.DistanceScale = ConfigDistanceScale.Constant;
    this.AngleScale = ConfigAngleScale.Constant;
  }
}

@AtomGenClass("设置")
class EMSetBreakPartbLockTaskDelegate extends TaskDelegate {
  public readonly BodypartName: string = undefined;
  public readonly RevertOnEnd: boolean = true;
  public readonly bLock: boolean = true;
  public constructor(
    public readonly ConfigBodypartName: string,
    public readonly ConfigRevertOnEnd: BoolValueConstDelegate
  ) {
    super(
      "MHAbilityTask_EM_SetBreakPartbLock_C",
      1048576,
      "AbilityTasks/Monster/GamePlay/MHAbilityTask_EM_SetBreakPartbLock",
      "EMSetBreakPartbLockTaskDelegate",
      ue.EMHAbilityTaskRealm.ServerOnly
    );
    this.BodypartName = ConfigBodypartName;
    this.RevertOnEnd = ConfigRevertOnEnd.BoolConst;
    this.bLock = true;
  }
}

@AtomGenClass("修饰符")
class AddModifierTaskDelegate extends TaskDelegate {
  public ModifierId: number;

  public constructor(ModifierId: NumberValueConstDelegate) {
    super(
      "MHTsModifier_C",
      1048576,
      "AbilityTasks/Character/Ability/MHTsModifier",
      "MHTsModifier",
      ue.EMHAbilityTaskRealm.All,
      true,
      true,
      false
    );
    this.ModifierId = ModifierId.Constant;
  }
}

@AtomGenClass("ConditionControlledBuffTaskDelegate")
class ConditionControlledBuffTaskDelegate extends TaskDelegate {
  public readonly ThresholdTime: number = undefined;
  public readonly BuffId: string = undefined;

  public constructor(
    BuffId: NumberValueConstDelegate | string,
    public readonly Condition: BoolValueDelegate,
    ThresholdTime: NumberValueConstDelegate
  ) {
    super(
      "MHTsAbilityTaskConditionControlledBuff_C",
      1048576,
      "AbilityTasks/Common/Buff/MHTsAbilityTaskConditionControlledBuff",
      "MHTsAbilityTaskConditionControlledBuff",
      ue.EMHAbilityTaskRealm.ServerOnly,
      undefined,
      undefined,
      undefined,
      true,
      0.3333333333333333,
      true,
      0.3333333333333333
    );

    this.BuffId =
      typeof BuffId === "string" ? BuffId : BuffId.Constant.toString();
    this.ThresholdTime = ThresholdTime.Constant;
  }
}

@AtomGenClass("动态")
class DynamicDurationTaskDelegate extends TaskDelegate {
  public readonly bFixed: boolean;

  public constructor(
    public readonly Duration: NumberValueDelegate,
    bFixed: BoolValueConstDelegate = FalseConstBoolValue
  ) {
    super(
      "ArashiAbilityTaskDynamicDuration_C",
      1048576,
      "AbilityTasks/Common/Buff/ArashiAbilityTaskDynamicDuration",
      "ArashiAbilityTaskDynamicDuration",
      ue.EMHAbilityTaskRealm.ServerOnly,
      undefined,
      true
    );

    this.bFixed = bFixed.BoolConst;
  }
}

@AtomGenClass("事件")
class ButtonStrengthEventTaskDelegate extends TaskDelegate {
  public readonly SkillGroupID: string = undefined;

  public constructor(SkillGroupID: NumberValueConstDelegate | string) {
    super(
      "MHTsTaskButtonStrengthEvent_C",
      1048576,
      "AbilityTasks/AbilityEvents/MHTsTaskButtonStrengthEvent",
      "MHTsTaskButtonStrengthEvent",
      ue.EMHAbilityTaskRealm.LocalOnly,
      undefined,
      undefined,
      undefined,
      true,
      0.3333333333333333,
      true,
      0.3333333333333333
    );

    this.SkillGroupID =
      typeof SkillGroupID === "string"
        ? SkillGroupID
        : SkillGroupID.Constant.toString();
  }
}

@AtomGenClass("ShadowCloneBuffsTaskDelegate")
class ShadowCloneBuffsTaskDelegate extends TaskDelegate {
  public readonly BuffIds: ReadonlyArray<string> = undefined;

  public constructor(...BuffIds: (NumberValueConstDelegate | string)[]) {
    super(
      "MHTsAbilityTaskShadowCloneBuffs_C",
      1048576,
      "AbilityTasks/Common/Buff/MHTsAbilityTaskShadowCloneBuffs",
      "MHTsAbilityTaskShadowCloneBuffs",
      ue.EMHAbilityTaskRealm.ServerOnly
    );

    for (let i = 0; i < BuffIds.length; ++i) {
      const BuffId =
        typeof BuffIds[i] === "string"
          ? BuffIds[i]
          : (BuffIds[i] as NumberValueConstDelegate).Constant.toString();
      BuffIds[i] = BuffId;
    }
    this.BuffIds = BuffIds as Array<string>;
  }
}

abstract class ActionDelegate extends DelegateBase {
  public constructor(ClassName: string) {
    super(ClassName);
  }

  // todo
  public Execute(ArgLhs: any, ArgRhs: any, bIsValid: $Ref<boolean>): boolean {
    return false;
  }
}

@AtomGenClass("角色")
class ActionReviveCharacterDeathDelegate extends ActionDelegate {
  constructor(
    public readonly PostHealth: NumberValueDelegate,
    public readonly Priority: NumberValueDelegate
  ) {
    super("MHTsTriggerActionReviveCharacterDeath_C");
  }
}

@AtomGenClass("技能")
class NotifyOfSkillEffectActivatedActionDelegate extends ActionDelegate {
  public readonly NotificationId: number;
  public constructor(NotificationId: number | NumberValueConstDelegate) {
    super("ArashiTriggerActionNotifyOfSkillEffectActivated_C");
    this.NotificationId =
      typeof NotificationId === "number"
        ? NotificationId
        : NotificationId.Constant;
  }
}

@AtomGenClass("设置")
class ActionSetAbilityBoolCustomValueDelegate extends ActionDelegate {
  public readonly bTransformInCombo: boolean;
  public constructor(
    public readonly Key: string,
    public readonly Value: BoolValueDelegate,
    bTransformInCombo: BoolValueConstDelegate
  ) {
    super("MHTsTriggerActionSetContextAbilityBoolCustomValue_C");
    this.bTransformInCombo = bTransformInCombo.BoolConst;
  }
}

@AtomGenClass("设置")
class ActionSetAbilityNumberCustomValueDelegate extends ActionDelegate {
  public constructor(
    public readonly Key: string,
    public readonly Value: NumberValueDelegate
  ) {
    super("MHTsTriggerActionSetContextAbilityNumberCustomValue_C");
  }
}

@AtomGenClass("技能")
class ActionModifyAbilityPlayRateInAbilityGroupDelegate extends ActionDelegate {
  public constructor(
    public readonly AbilityGroup: string,
    public readonly OverridePlayRate: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAbilityRateByAbilityGroup_C");
  }
}

@AtomGenClass("配额")
class ActionQuotaAndCoolDownActionDelegate extends ActionDelegate {
  public readonly QuotaID: string = undefined;
  public readonly CoolDownID: string = undefined;

  public constructor(
    public readonly Quota: number,
    public readonly ActionOnQuotaReached: ActionDelegate,

    public readonly CoolDown: number,
    public readonly bCooledDownOnBegin: boolean,

    ID: string,

    public readonly Action: ActionDelegate
  ) {
    super("MHTsTriggerActionQuotaAndCoolDownAction_C");

    this.QuotaID = ID;
    this.CoolDownID = ID;
  }
}

@AtomGenClass("配额")
class ActionQuotaAction extends ActionQuotaAndCoolDownActionDelegate {
  public constructor(
    Quota: NumberValueConstDelegate,
    ActionOnQuotaReached: ActionDelegate,
    Action: ActionDelegate
  ) {
    super(
      Quota.Constant,
      ActionOnQuotaReached,
      -1,
      false,
      GetIntUniqueToAbility(),
      Action
    );
  }
}

@AtomGenClass("配额")
class ActionQuotaActionWithSpecifiedID extends ActionQuotaAndCoolDownActionDelegate {
  public constructor(
    Quota: NumberValueConstDelegate,
    ActionOnQuotaReached: ActionDelegate,
    Action: ActionDelegate,
    QuotaID: string | NumberValueConstDelegate
  ) {
    const ID =
      typeof QuotaID === "string" ? QuotaID : QuotaID.Constant.toString();
    super(Quota.Constant, ActionOnQuotaReached, -1, false, ID, Action);
  }
}

@AtomGenClass("凉爽")
class ActionCoolDownAction extends ActionQuotaAndCoolDownActionDelegate {
  public constructor(
    CoolDown: NumberValueConstDelegate,
    bCooledDownOnBegin: BoolValueConstDelegate,
    Action: ActionDelegate
  ) {
    super(
      -1,
      NopActionValue,
      CoolDown.Constant,
      bCooledDownOnBegin.BoolConst,
      GetIntUniqueToAbility(),
      Action
    ); // eslint-disable-line
  }
}

@AtomGenClass("凉爽")
class ActionCoolDownActionWithSpecifiedID extends ActionQuotaAndCoolDownActionDelegate {
  public constructor(
    CoolDown: NumberValueConstDelegate,
    bCooledDownOnBegin: BoolValueConstDelegate,
    Action: ActionDelegate,
    CoolDownID: string | NumberValueConstDelegate
  ) {
    const ID =
      typeof CoolDownID === "string"
        ? CoolDownID
        : CoolDownID.Constant.toString();
    super(
      -1,
      NopActionValue,
      CoolDown.Constant,
      bCooledDownOnBegin.BoolConst,
      ID,
      Action
    );
  }
}

@AtomGenClass("配额")
class ActionQuotaAndCoolDownAction extends ActionQuotaAndCoolDownActionDelegate {
  public constructor(
    Quota: NumberValueConstDelegate,
    ActionOnQuotaReached: ActionDelegate,
    CoolDown: NumberValueConstDelegate,
    bCooledDownOnBegin: BoolValueConstDelegate,
    Action: ActionDelegate
  ) {
    super(
      Quota.Constant,
      ActionOnQuotaReached,
      CoolDown.Constant,
      bCooledDownOnBegin.BoolConst,
      GetIntUniqueToAbility(),
      Action
    ); // eslint-disable-line
  }
}

@AtomGenClass("配额")
class ActionQuotaAndCoolDownActionWithSpecifiedID extends ActionQuotaAndCoolDownActionDelegate {
  public constructor(
    Quota: NumberValueConstDelegate,
    ActionOnQuotaReached: ActionDelegate,
    CoolDown: NumberValueConstDelegate,
    bCooledDownOnBegin: BoolValueConstDelegate,
    Action: ActionDelegate,
    ID: string | NumberValueConstDelegate
  ) {
    const id = typeof ID === "string" ? ID : ID.Constant.toString();
    super(
      Quota.Constant,
      ActionOnQuotaReached,
      CoolDown.Constant,
      bCooledDownOnBegin.BoolConst,
      id,
      Action
    ); // eslint-disable-line
  }
}

@AtomGenClass("ActionNOPDelegate")
class ActionNOPDelegate extends ActionDelegate {
  public constructor() {
    super("MHTsTriggerActionNOP_C");
  }
}

const NopActionValue = new ActionNOPDelegate();

@AtomGenClass("开")
class ActionLootDropOnAttackDelegate extends ActionDelegate {
  public readonly DropLifeSpan: number = undefined;
  public readonly DropRadius: number = undefined;
  public readonly SpaceOccupationSphereRadius: number = undefined;

  public constructor(
    DropLifeSpan: NumberValueConstDelegate,
    DropRadius: NumberValueConstDelegate,
    SpaceOccupationSphereRadius: NumberValueConstDelegate
  ) {
    super("MHTsTriggerActionLootDropOnAttack_C");
    this.DropLifeSpan = DropLifeSpan.Constant;
    this.DropRadius = DropRadius.Constant;
    this.SpaceOccupationSphereRadius = SpaceOccupationSphereRadius.Constant;
  }
}

@AtomGenClass("设置")
class ActionSystemSetAttributeDelegate extends ActionDelegate {
  public constructor(
    public readonly AttrName: string,
    public readonly NewValue: NumberValueDelegate
  ) {
    super("MHTsTriggerActionSystemSetAttribute_C");
  }
}

@AtomGenClass("开")
class ActionWithLimitationOnTheNumberOfTimesForEachCombinationOfAbilityInstanceAndHitTargetDelegate extends ActionDelegate {
  public readonly QuotaId: string = undefined;
  public readonly Quota: number = undefined;

  public constructor(
    public readonly Action: ActionDelegate,
    Quota: NumberValueConstDelegate
  ) {
    super(
      "MHTsTriggerActionWithQuotaForEachCombinationOfAbilityInstanceAndHitTarget_C"
    ); // eslint-disable-line prettier/prettier
    this.QuotaId = GetIntUniqueToAbility();
    this.Quota = Quota.Constant;
  }
}
@AtomGenClass("PetMasterActConsumeDelegate")
class PetMasterActConsumeDelegate extends ActionDelegate {
  public readonly ActionType: string;
  public constructor(ActionType: string) {
    super("MHTsTriggerPetMasterActConsume_C");
    this.ActionType = ActionType;
  }
}
@AtomGenClass("PetMasterHitMonsterConsumeDelegate")
class PetMasterHitMonsterConsumeDelegate extends ActionDelegate {
  public readonly DamageType: string;
  public constructor(DamageType: string) {
    super("MHTsTriggerPetMasterHitMonsterConsume_C");
    this.DamageType = DamageType;
  }
}
@AtomGenClass("构建")
class ActionConsumeBuildUpOrRestoreCombatResource extends ActionDelegate {
  public readonly Tags: readonly string[];
  public constructor(
    public readonly CombatResourceName: keyof typeof ue.ECombatResource,
    public readonly Value: NumberValueDelegate,
    ...Tags: readonly string[]
  ) {
    super("ArashiTriggerActionCombatResourceConsumptionBuildUpOrRestoration_C");
    this.Tags = Tags;
  }
}

@AtomGenClass("刷新")
class ActionRefreshBuffFromMeDelegate extends ActionDelegate {
  public readonly BuffId: string = undefined;

  public constructor(
    BuffId: string | NumberValueConstDelegate,
    public readonly Target: ActorValueDelegate
  ) {
    super("MHTsTriggerActionRefreshBuffFromMe_C");
    this.BuffId =
      BuffId instanceof NumberValueConstDelegate
        ? BuffId.Constant.toString()
        : BuffId;
  }
}

@AtomGenClass("ActionRemoveBuffFromMeDelegate")
class ActionRemoveBuffFromMeDelegate extends ActionDelegate {
  public readonly BuffId: string = undefined;

  public constructor(
    BuffId: string | NumberValueConstDelegate,
    public readonly Target: ActorValueDelegate
  ) {
    super("MHTsTriggerActionRemoveBuffFromMe_C");
    this.BuffId =
      BuffId instanceof NumberValueConstDelegate
        ? BuffId.Constant.toString()
        : BuffId;
  }
}

@AtomGenClass("确定")
class ActionDispelCertainCharacterStatusEffectDelegate extends ActionDelegate {
  public readonly bReset: boolean = undefined;

  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly StatusEffect: string,
    bReset: BoolValueConstDelegate = FalseConstBoolValue
  ) {
    super("MHTsTriggerActionDispelCertainCharacterStatusEffect_C");
    this.bReset = bReset ? bReset.BoolConst : false;
  }
}

@AtomGenClass("ActionAddCombatPetEnergyDelegate")
class ActionAddCombatPetEnergyDelegate extends ActionDelegate {
  public constructor(
    public readonly OnWhom: ActorValueDelegate,
    public readonly Addend: NumberValueDelegate
  ) {
    super("MHTsTriggerActionAddCombatPetEnergy_C");
  }
}

@AtomGenClass("编号")
class ActionRemoveBuffsByBuffIDDelegate extends ActionDelegate {
  public readonly BuffID: string = undefined;

  public constructor(BuffID: string | NumberValueConstDelegate) {
    super("MHTsTriggerActionRemoveBuffsByBuffID_C");
    this.BuffID =
      typeof BuffID === "string" ? BuffID : BuffID.Constant.toString();
  }
}

@AtomGenClass("重置")
class ActionResetAbilityCategoryTimerDelegate extends ActionDelegate {
  public constructor(public readonly SkillCategory: string) {
    super("MHTsTriggerActionResetAbilityCategoryTimer_C");
  }
}

@AtomGenClass("值")
class BoolValueCanItemRecommendByGuideDelegate extends BoolValueDelegate {
  public readonly ItemID: number;
  public readonly GuideID: string;
  public constructor(
    ItemID: number | NumberValueConstDelegate,
    GuideID: string | NumberValueConstDelegate
  ) {
    super("MHTsBoolTriggerValueCanItemRecommendByGuide_C");
    if (typeof ItemID === "number") {
      this.ItemID = ItemID;
    } else {
      this.ItemID = ItemID.Constant;
    }
    if (typeof GuideID === "string") {
      this.GuideID = GuideID;
    } else {
      this.GuideID = GuideID.Constant.toString();
    }
  }
}

@AtomGenClass("值")
class BoolValueCheckBuffDelegate extends BoolValueDelegate {
  public readonly BuffID: string = undefined;

  public constructor(BuffID: string | NumberValueConstDelegate) {
    super("MHTsBoolTriggerValueCheckBuff_C");
    this.BuffID =
      typeof BuffID === "string" ? BuffID : BuffID.Constant.toString();
  }
}

@AtomGenClass("值")
class BoolValueCheckBuffStateDelegate extends BoolValueDelegate {
  private readonly InvertCondition: boolean = false;
  private readonly StateName: string = undefined;

  public constructor(StateName: string | NumberValueConstDelegate) {
    super("MHTsBoolTriggerValueCheckBuffState_C");
    this.StateName =
      typeof StateName === "string" ? StateName : StateName.Constant.toString();
  }
}

@AtomGenClass("值")
class BoolValueWAProjectileUsableDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueWAProjectileUsable_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckCurrentWAIDDelegate extends BoolValueDelegate {
  public readonly WAID: string = undefined;

  public constructor(WAID: string | NumberValueConstDelegate) {
    super("MHTsBoolTriggerValueCheckCurrentWAID_C");
    this.WAID = typeof WAID === "string" ? WAID : WAID.Constant.toString();
  }
}

@AtomGenClass("ActionSpawnSoapDelegate")
class ActionSpawnSoapDelegate extends ActionDelegate {
  public readonly ConfigId: string = undefined;

  public constructor(ConfigId: string | NumberValueConstDelegate) {
    super("MHTsTriggerActionSpawnSoap_C");
    this.ConfigId =
      typeof ConfigId === "string" ? ConfigId : ConfigId.Constant.toString();
  }
}

@AtomGenClass("字段")
class ActionSpawnFieldDelegate extends ActionDelegate {
  public readonly FieldConfigID: string = undefined;
  public readonly bFollowSelf: boolean = undefined;
  public readonly BuildFromType: number = undefined;
  public readonly bSpawnInServerFromServerRequest: boolean = undefined;
  public readonly CustomValues: ReadonlyArray<NumberValueDelegate> = undefined;

  public constructor(
    FieldConfigID: string | NumberValueConstDelegate,
    bFollowSelf: boolean,
    BuildFromType: NumberValueConstDelegate = new NumberValueConstDelegate(0),
    bSpawnInServerFromServerRequest: BoolValueConstDelegate = new BoolValueConstDelegate(
      false
    ),
    ...CustomValues: readonly NumberValueDelegate[]
  ) {
    super("MHTsTriggerActionSpawnField_C");
    this.FieldConfigID =
      typeof FieldConfigID === "string"
        ? FieldConfigID
        : FieldConfigID.Constant.toString();
    this.bFollowSelf = bFollowSelf;
    this.BuildFromType = BuildFromType.Constant;
    this.bSpawnInServerFromServerRequest =
      bSpawnInServerFromServerRequest.BoolConst;
    this.CustomValues = CustomValues;
  }
}

@AtomGenClass("计数器")
class ActionStartCounterAttackDelegate extends ActionDelegate {
  public readonly BodyPartName: string;
  public readonly bReset: boolean;

  public constructor(BodyPartName: string, bReset = false) {
    super("MHTsTriggerActionStartCounterAttack_C");
    this.BodyPartName = BodyPartName;
    this.bReset = bReset;
  }
}

@AtomGenClass("ActionTriggerEMAIRespondDelegate")
class ActionTriggerEMAIRespondDelegate extends ActionDelegate {
  private readonly RespondID: string;

  public constructor(RespondID: string) {
    super("MHTsTriggerActionEMAIRespond_C");
    this.RespondID = RespondID;
  }
}

@AtomGenClass("重置")
class ActionResetCounterAttackDelegate extends ActionDelegate {
  public readonly BodyPartName: string;
  public constructor(BodyPartName: string) {
    super("MHTsTriggerActionResetCounterAttack_C");
    this.BodyPartName = BodyPartName;
  }
}

@AtomGenClass("计数器")
class ActionPauseCounterAttackDelegate extends ActionDelegate {
  public readonly BodyPartName: string;
  public constructor(BodyPartName: string, bReset = false) {
    super("MHTsTriggerActionPauseCounterAttack_C");
    this.BodyPartName = BodyPartName;
  }
}

@AtomGenClass("设置")
class ActionSetSummonMoveModeDelegate extends ActionDelegate {
  public readonly NewMovementMode: ue.ESummonMovementMode = undefined;

  public constructor(
    @AtomGenParam({ descName: "NewMovementMode", type: String })
    NewMovementMode: string | NumberValueConstDelegate
  ) {
    super("MHTsTriggerActionSetSummonMoveMode_C");
    this.NewMovementMode =
      typeof NewMovementMode === "string"
        ? ue.ESummonMovementMode[NewMovementMode]
        : NewMovementMode.Constant;
  }
}

@AtomGenClass("设置")
class ActionSetSummonWalkingSpeedDelegate extends ActionDelegate {
  public readonly Speed: number = undefined;
  public readonly Roll: number = undefined;
  public readonly Pitch: number = undefined;
  public readonly Yaw: number = undefined;

  public constructor(
    Speed: NumberValueConstDelegate,
    Roll: NumberValueConstDelegate,
    Pitch: NumberValueConstDelegate,
    Yaw: NumberValueConstDelegate
  ) {
    super("MHTsTriggerActionSetSummonWalkingSpeed_C");
    this.Speed = Speed.Constant;
    this.Roll = Roll.Constant;
    this.Pitch = Pitch.Constant;
    this.Yaw = Yaw.Constant;
  }
}

@AtomGenClass("ActionDispelAffiliatedBuffDelegate")
class ActionDispelAffiliatedBuffDelegate extends ActionDelegate {
  public constructor() {
    super("MHTsTriggerActionDispelAffiliatedBuff_C");
  }
}

@AtomGenClass("ActionSwitchCaseDelegate")
class ActionSwitchCaseDelegate extends ActionDelegate {
  public readonly Cases = new Array<NumberValueDelegate>();
  public readonly Actions = new Array<ActionDelegate>();
  public readonly CaseIndexToActionIndex = new Array<number>();

  public constructor(
    @AtomGenParam({ descName: "ControlExpression" })
    public readonly ControlExpression: NumberValueDelegate,
    @AtomGenParam({ descName: "Cases", type: Array, subType: "ActionDelegate" })
    ...Cases: readonly (NumberValueDelegate | ActionDelegate)[]
  ) {
    super("MHTsTriggerActionSwitchCase_C");

    for (const i of Cases)
      if (i instanceof NumberValueDelegate) {
        this.Cases.push(i);
        this.CaseIndexToActionIndex.push(this.Actions.length);
      } else if (i instanceof ActionDelegate) {
        this.Actions.push(i);
      } else {
        console.error(
          "[AtomSystem][Parser] switch case type error encountered"
        );
      }
  }
}

@AtomGenClass("技能")
class ActionChangeAbilityCoolDownDelegate extends ActionDelegate {
  public constructor(
    public readonly AbilityName: string,
    public readonly Value: NumberValueDelegate,
    public readonly CoolDownOperation: number
  ) {
    super("MHTsTriggerActionChangeAbilityCoolDown_C");
  }
}

@AtomGenClass("技能")
class ActionAddAbilityCoolDown extends ActionChangeAbilityCoolDownDelegate {
  public constructor(
    AbilityName: string,
    Value: NumberValueDelegate,
    bPercentage: BoolValueConstDelegate
  ) {
    super(AbilityName, Value, bPercentage.BoolConst ? 2 : 1);
  }
}

@AtomGenClass("设置")
class ActionSetAbilityCoolDown extends ActionChangeAbilityCoolDownDelegate {
  public constructor(AbilityName: string, Value: NumberValueDelegate) {
    super(AbilityName, Value, 0);
  }
}

@AtomGenClass("条件")
class ActionTakeConditionalActionExDelegate extends ActionDelegate {
  public constructor(
    public readonly Condition: BoolValueDelegate,
    public readonly ActionLhs: ActionDelegate,
    public readonly ActionRhs: ActionDelegate = NopActionValue
  ) {
    super("MHTsTriggerActionTakeConditionalActionEx_C");
    if (Condition instanceof BoolValueConstDelegate)
      return (Condition.BoolConst ? ActionLhs : ActionRhs) as any;
  }
}

@AtomGenClass("ActionTakeActionsExDelegate")
class ActionTakeActionsExDelegate extends ActionDelegate {
  public readonly Actions: ReadonlyArray<ActionDelegate> = undefined;

  public constructor(...Actions: readonly ActionDelegate[]) {
    super("MHTsTriggerActionTakeActionsEx_C");
    const CheckedActions = new Array();
    for (const i of Actions)
      if (i instanceof ActionDelegate) CheckedActions.push(i);
    this.Actions = CheckedActions;

    switch (CheckedActions.length) {
      case 0:
        return NopActionValue as unknown as ActionTakeActionsExDelegate;

      case 1:
        return CheckedActions[0];
    }
  }
}

@AtomGenClass("ActionApplyBuffWithSourceDelegate")
class ActionApplyBuffWithSourceDelegate extends ActionDelegate {
  public readonly BuffID: string = undefined;
  public constructor(
    BuffID: string | NumberValueConstDelegate,
    public readonly OnWhom: ActorValueDelegate,
    public readonly FromWhom: ActorValueDelegate
  ) {
    super("MHTsTriggerActionAddBuff_C");
    if (typeof BuffID !== "string" && !BuffID.Constant)
      console.error(
        `Failed to translate Atom [ApplyBuffWithSource/ApplyBuffOn]! Please check your Atom Params. BuffID: ${CurrentAbilityConfigID}`
      );
    this.BuffID =
      typeof BuffID === "string" ? BuffID : BuffID.Constant.toString();
  }
}

@AtomGenClass("ActionAddFireForceFX")
class ActionAddFireForceFX extends ActionDelegate {
  public readonly Radius: number;
  public readonly AngleOffset: number;
  public readonly RangeAngle: number;
  public constructor(
    InRadius: NumberValueConstDelegate,
    InAngleOffset: NumberValueConstDelegate,
    InRangeAngle: NumberValueConstDelegate
  ) {
    super("MHTsTriggerActionAddFireForceFX_C");
    this.Radius = InRadius.Constant;
    this.AngleOffset = InAngleOffset.Constant;
    this.RangeAngle = InRangeAngle.Constant;
  }
}

@AtomGenClass("值")
class ActionApplyBuffWithCustomValueDelegate extends ActionDelegate {
  public readonly BuffId: string = undefined;
  public readonly CustomValues: ReadonlyArray<NumberValueDelegate> = undefined;

  public constructor(
    BuffId: string | NumberValueConstDelegate,
    public readonly OnWhom: ActorValueDelegate,
    public readonly FromWhom: ActorValueDelegate,
    ...CustomValues: readonly NumberValueDelegate[]
  ) {
    super("MHTsTriggerActionApplyBuffWithCustomValue_C");
    this.BuffId =
      typeof BuffId === "string" ? BuffId : BuffId.Constant.toString();
    this.CustomValues = CustomValues;
  }
}

@AtomGenClass("ActionApplyBuff")
class ActionApplyBuff extends ActionApplyBuffWithSourceDelegate {
  public constructor(
    BuffID: string | NumberValueConstDelegate,
    OnWhom: ActorValueDelegate
  ) {
    super(BuffID, OnWhom, undefined);
  }
}

@AtomGenClass("开")
class ActionApplyBuffUnderThisBuffOn extends ActionDelegate {
  public readonly BuffId: string = undefined;
  public readonly OnWhom: ActorValueDelegate = undefined;
  public constructor(
    BuffId: string | NumberValueConstDelegate,
    OnWhom: ActorValueDelegate
  ) {
    super("MHTsTriggerActionApplyBuffUnderBuff_C");
    this.BuffId =
      typeof BuffId === "string" ? BuffId : BuffId.Constant.toString();
    this.OnWhom = OnWhom;
  }
}

@AtomGenClass("ActionHealDelegate")
class ActionHealDelegate extends ActionDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly Healing: NumberValueDelegate
  ) {
    super("MHTsTriggerActionHeal_C");
    AttackParamsOfCurrentAbility.push(
      new AtkParamsInTermsOfJsObject(
        false,
        false,
        false,
        ue.EMHHealingType.Unknown
      )
    ); // eslint-disable-line
  }
}

@AtomGenClass("角色")
class ActionDispelCharacterStatusEffectDelegate extends ActionDelegate {
  public constructor(public readonly Who: ActorValueDelegate) {
    super("MHTsTriggerActionDispelStatusEffectOfCharacter_C");
  }
}

@AtomGenClass("角色")
class ActionChangeCharacterStaminaMax extends ActionDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly Change: NumberValueDelegate
  ) {
    super("MHTsTriggerActionChangeCharacterStaminaMax_C");
  }
}

@AtomGenClass("角色")
class ActionChangeCharacterStamina extends ActionDelegate {
  public constructor(
    public readonly Who: ActorValueDelegate,
    public readonly Change: NumberValueDelegate
  ) {
    super("MHTsTriggerActionChangeCharacterStamina_C");
  }
}

@AtomGenClass("ActionAAIBowMoveArcShotMarkLocation")
class ActionAAIBowMoveArcShotMarkLocation extends ActionDelegate {
  public constructor(public readonly MoveSpeed: NumberValueDelegate) {
    super("MHTsTriggerActionAAIBowMoveArcShotMarkLocation_C");
  }
}

@AtomGenClass("ActionAAIPetFollow")
class ActionAAIPetFollow extends ActionDelegate {
  public constructor(
    public readonly TargetType: string,
    public readonly IsIncludePetOwner: BoolValueDelegate
  ) {
    super("MHTsTriggerActionAAIPetFollow_C");
  }
}
@AtomGenClass("ActionAAIBowMoveAimPointLocation")
class ActionAAIBowMoveAimPointLocation extends ActionDelegate {
  public constructor() {
    super("MHTsTriggerActionAAIBowMoveAimPointLocation_C");
  }
}

@AtomGenClass("值")
class ActorValueAttackTargetOrSourceDelegate extends ActorValueDelegate {
  public constructor(public Target: boolean) {
    super("MHTsActorTriggerValueAttackTarget_C");
  }
}

@AtomGenClass("值")
class ActorValueAttackSource extends ActorValueAttackTargetOrSourceDelegate {
  public constructor() {
    super(false);
  }
}

@AtomGenClass("值")
class ActorValueLockTarget extends ActorValueDelegate {
  public constructor() {
    super("MHTsActorTriggerValueLockTarget_C");
  }
}
@AtomGenClass("获取")
class ActionGetNearestMonsterInRadio extends ActorValueDelegate {
  public readonly Radio: number;
  public constructor(Radio: NumberValueConstDelegate) {
    super("MHTsActorTriggerValueGetNearestMonsterInRadio_C");
    this.Radio = Radio.Constant;
  }
}

@AtomGenClass("测试")
class MetaDataTestDummyDelegate extends NumberValueDelegate {
  public constructor(
    First: "xxx" | "yyy",
    Second: keyof typeof EStatusEffect,
    Third: [number, NumberValueDelegate, [number, ActorValueDelegate]],
    Fourth?: BoolValueDelegate,
    Sixth?: readonly number[],
    Seventh?: number[][],
    Eighth?: ReadonlyArray<number>,
    Ninth?: Array<number>,
    Tenth?: readonly (keyof typeof EStatusEffect)[],
    ...Last: readonly number[]
  ) {
    super("");
  }
}

@AtomGenClass("值")
class ActorValueCurrentlyVisitedDelegate extends ActorValueDelegate {
  public constructor() {
    super("ArashiActorTriggerValueCurrentlyVisited_C");
  }
}

@AtomGenClass("值")
class ActorValueAttackTarget extends ActorValueAttackTargetOrSourceDelegate {
  public constructor() {
    super(true);
  }
}

@AtomGenClass("值")
class ActorValueTriggerOwnerDelegate extends ActorValueDelegate {
  public constructor() {
    super("MHTsActorTriggerValueTriggerOwner_C");
  }
}

@AtomGenClass("值")
class ActorValueGetTargetActorDelegate extends ActorValueDelegate {
  public constructor() {
    super("MHTsActorTriggerValueGetTargetActor_C");
  }
}

@AtomGenClass("值")
class ActorValueGetPetTargetDelegate extends ActorValueDelegate {
  public constructor() {
    super("MHTsActorTriggerValueGetPetTarget_C");
  }
}
@AtomGenClass("值")
class ActorValueGetPetDelegate extends ActorValueDelegate {
  public constructor() {
    super("MHTsActorTriggerValueGetPet_C");
  }
}
@AtomGenClass("值")
class ActorValueGetPlayerCharacterDelegate extends ActorValueDelegate {
  public constructor() {
    super("MHTsActorTriggerValueGetPlayerCharacter_C");
  }
}

@AtomGenClass("值")
class ActorValueBuffSource extends ActorValueDelegate {
  public constructor() {
    super("MHTsActorTriggerValueBuffSource_C");
  }
}

@AtomGenClass("值")
class ActorValueMaster extends ActorValueDelegate {
  public constructor(public readonly OfWhom: ActorValueDelegate) {
    super("MHTsActorTriggerValueGetMasterActor_C");
  }
}

@AtomGenClass("值")
class ActorValueAAIGetEnemy extends ActorValueDelegate {
  public constructor() {
    super("MHTsActorTriggerValueAAIGetEnemy_C");
  }
}

@AtomGenClass("CustomActionDelegate")
class CustomActionDelegate extends ActionDelegate {
  public constructor(ClassName: string) {
    super(ClassName);
  }
}

@AtomGenClass("ActionAddPetStaminDelegate")
class ActionAddPetStaminDelegate extends ActionDelegate {
  public constructor(public readonly Addend: NumberValueDelegate) {
    super("MHTsTriggerActionAddPetStamina_C");
  }
}

@AtomGenClass("延迟")
class ActionDelayMonsterStiffnessTimeDelegate extends ActionDelegate {
  public DelayTimePercent: number;
  public DelayTime: number;
  public constructor(
    DelayTimePercent: NumberValueConstDelegate,
    DelayTime: NumberValueConstDelegate
  ) {
    super("MHTsTriggerActionDelayMonsterStiffnessTime_C");
    this.DelayTimePercent = DelayTimePercent.Constant;
    this.DelayTime = DelayTime.Constant;
  }
}

@AtomGenClass("硬直")
class ActionChangeMonsterCurStiffnessTimeDelegate extends ActionDelegate {
  public constructor(
    public readonly DelayTimePercent: NumberValueDelegate,
    public readonly DelayTime: NumberValueDelegate
  ) {
    super("MHTsTriggerActionChangeMonsterCurStiffnessTime_C");
  }
}

@AtomGenClass("延迟")
class ActionDelayBuffDurationDelegate extends ActionDelegate {
  public readonly BuffId: string;
  public readonly DelayTime: number;
  public constructor(
    BuffId: string | NumberValueConstDelegate,
    DelayTimeDelegate: NumberValueConstDelegate
  ) {
    super("MHTsTriggerActionDelayBuffDuration_C");
    this.BuffId =
      BuffId instanceof NumberValueConstDelegate
        ? BuffId.Constant.toString()
        : BuffId;
    this.DelayTime = DelayTimeDelegate.Constant;
  }
}

@AtomGenClass("CustomActionDealDamageDelegate")
class CustomActionDealDamageDelegate extends ActionDelegate {
  public readonly AtkArgs: AtkParamsInTermsOfJsObject;
  public readonly BuffHitConfigID: string = undefined;

  public constructor(
    bDoT: BoolValueConstDelegate,
    bHPLoss: BoolValueConstDelegate,
    public readonly DamageBase: NumberValueDelegate,
    public readonly SpecifiedBoneName = "",
    bInterruptSleepStatusEffect = true,
    AdventurerHealthClaimingType:
      | NumberValueConstDelegate
      | ue.EArashiAdventurerHealthClaimingType = ue
      .EArashiAdventurerHealthClaimingType.None
  ) {
    super("MHTsTriggerActionDealDamage_C");
    // this.AtkArgs = new AtkParamsInTermsOfJsObject(
    //   bDoT.BoolConst,
    //   bHPLoss.BoolConst,
    //   !bDoT.BoolConst && bInterruptSleepStatusEffect,
    //   ue.EMHHealingType.NotHealing,
    //   typeof AdventurerHealthClaimingType === 'number'
    //     ? AdventurerHealthClaimingType
    //     : AdventurerHealthClaimingType.Constant
    // );
    // AttackParamsOfCurrentAbility.push(this.AtkArgs);
  }

  protected GetAttackParam(): AtkParamsInTermsOfJsObject {
    return this.AtkArgs;
  }
}

@AtomGenClass("编号")
class CustomActionDealDamageByBuffHitConfigID extends CustomActionDealDamageDelegate {
  public constructor(
    bDoT: BoolValueConstDelegate,
    bHPLoss: BoolValueConstDelegate,
    DamageBase: NumberValueDelegate,
    BuffHitConfigID: string | NumberValueConstDelegate,
    SpecifiedBoneName = "",
    bInterruptSleepStatusEffect = true
  ) {
    super(
      bDoT,
      bHPLoss,
      DamageBase,
      SpecifiedBoneName,
      bInterruptSleepStatusEffect
    );

    if (BuffHitConfigID instanceof NumberValueConstDelegate)
      BuffHitConfigID = BuffHitConfigID.Constant.toString();

    (this as Mutable<CustomActionDealDamageByBuffHitConfigID>).BuffHitConfigID =
      BuffHitConfigID; // eslint-disable-line
  }
}

@AtomGenClass("CustomActionMonsterDealDamage")
class CustomActionMonsterDealDamage extends CustomActionDealDamageDelegate {
  public constructor(MonsterAttackConfigID: string) {
    super(
      FalseConstBoolValue,
      FalseConstBoolValue,
      new NumberValueConstDelegate(0),
      ""
    );
    this.SetAttackParam(MonsterAttackConfigID);
  }

  private SetAttackParam(MonsterAttackConfigID: string): void {
    // const AttackParam = this.GetAttackParam();
    // AttackParam.ConfigID = MonsterAttackConfigID;
  }
}

@AtomGenClass("硬直")
class CustomActionEMTriggerStiffnessDelegate extends ActionDelegate {
  public constructor(
    public readonly StiffnessType: string,
    public readonly Duration: number | NumberValueConstDelegate
  ) {
    super("MHTsTriggerActionEMTriggerStiffness_C");
    this.Duration =
      Duration instanceof NumberValueConstDelegate
        ? Duration.Constant
        : Duration;
  }
}

@AtomGenClass("CustomActionEMHitBySpecialAmmoDelegate")
class CustomActionEMHitBySpecialAmmoDelegate extends ActionDelegate {
  public constructor(public readonly AmmoType: string) {
    super("MHTsTriggerActionEMHitBySpecialAmmo_C");
  }
}

@AtomGenClass("值")
class BoolValueEMIsSpecialAmmoBuffStackFullDelegate extends BoolValueDelegate {
  public constructor(
    public readonly AmmoType: string,
    public readonly BuffID: string | NumberValueConstDelegate
  ) {
    super("MHTsBoolTriggerValueEMIsSpecialAmmoBuffStackFull_C");
    this.BuffID =
      BuffID instanceof NumberValueConstDelegate
        ? BuffID.Constant.toString()
        : BuffID;
  }
}

@AtomGenClass("ActionModifyHealingDelegate")
class ActionModifyHealingDelegate extends ActionDelegate {
  public constructor(
    public readonly AdditionalFlt: NumberValueDelegate,
    public readonly AdditionalPct: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyHealing_C");
  }
}

@AtomGenClass("修饰符")
class CustomActionModifyAttackAtkNumAttModifierDelegate extends CustomActionDelegate {
  public constructor(
    public readonly AtkNumStyleType: NumberValueDelegate,
    public readonly AtkNumStyleValue: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackAtkNumAttModifier_C");
  }
}

@AtomGenClass("属性")
class CustomActionModifyAttackAttributeModifierDelegate extends CustomActionDelegate {
  public constructor(
    public readonly AttackerOrVictim: BoolValueDelegate,
    public readonly FactorName: string,
    public readonly DeltaValue: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackAttributeModifier_C");
  }
}

@AtomGenClass("值")
class CustomActionModifyAttackMotionValueDelegate extends CustomActionDelegate {
  public constructor(
    public readonly PhysicalPercentageBonus: NumberValueDelegate,
    public readonly StatusEffectPercentageBonus: NumberValueDelegate,
    public readonly ElementalPercentageBonus: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackMotionValue_C");
  }
}

@AtomGenClass("物理")
class CustomActionModifyAttackPhysicalMotionValue extends CustomActionModifyAttackMotionValueDelegate {
  public constructor(PercentageBonus: NumberValueDelegate) {
    super(PercentageBonus, ZeroConstNumberValue, ZeroConstNumberValue);
  }
}

@AtomGenClass("状态")
class CustomActionModifyAttackStatusEffectMotionValue extends CustomActionModifyAttackMotionValueDelegate {
  public constructor(PercentageBonus: NumberValueDelegate) {
    super(ZeroConstNumberValue, PercentageBonus, ZeroConstNumberValue);
  }
}

@AtomGenClass("值")
class CustomActionModifyAttackElementalMotionValue extends CustomActionModifyAttackMotionValueDelegate {
  public constructor(PercentageBonus: NumberValueDelegate) {
    super(ZeroConstNumberValue, ZeroConstNumberValue, PercentageBonus);
  }
}

@AtomGenClass("CustomActionModifyAttackOverrideElementalDamageDelegate")
class CustomActionModifyAttackOverrideElementalDamageDelegate extends CustomActionDelegate {
  public constructor(
    public readonly Element: keyof typeof EElementalStatusEffect,
    public readonly ElementDamage: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackOverrideElementalDamage_C");
  }
}

@AtomGenClass("CustomActionModifyAttackPostureDamageDelegate")
class CustomActionModifyAttackPostureDamageDelegate extends CustomActionDelegate {
  public constructor(
    public readonly Addend: NumberValueDelegate,
    public readonly Multiplier: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackAdditionalPostureDamage_C");
  }
}

@AtomGenClass("真实")
class CustomActionModifyAttackRealStatusEffectInflictions extends CustomActionDelegate {
  public constructor(
    public readonly StatusEffect: keyof typeof EStatusEffect,
    public readonly Value: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackRealStatusEffectInflictions_C");
  }
}

@AtomGenClass("CustomActionModifyAttackIncreaseThreatGeneration")
class CustomActionModifyAttackIncreaseThreatGeneration extends CustomActionDelegate {
  public constructor(
    public readonly Addend: NumberValueDelegate,
    public readonly Multiplier: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackIncreaseThreatGeneration_C");
  }
}

@AtomGenClass("属性")
class CustomActionModifyAttackerAttributeFactor extends CustomActionModifyAttackAttributeModifierDelegate {
  public constructor(FactorName: string, DeltaValue: NumberValueDelegate) {
    super(TrueConstBoolValue, FactorName, DeltaValue);
  }
}

@AtomGenClass("属性")
class CustomActionModifyVictimAttributeFactor extends CustomActionModifyAttackAttributeModifierDelegate {
  public constructor(FactorName: string, DeltaValue: NumberValueDelegate) {
    super(FalseConstBoolValue, FactorName, DeltaValue);
  }
}

@AtomGenClass("角色")
class CustomActionModifyCharacterAttributeDelegate extends CustomActionDelegate {
  public constructor(
    public readonly AttributeName: string,
    public readonly AttributeChange: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyCharacterAttribute_C");
  }
}

@AtomGenClass("属性")
class CustomActionModifyMonsterAttributeDelegate extends CustomActionDelegate {
  public constructor(
    public readonly AttributeName: string,
    public readonly AttributeChange: NumberValueDelegate,
    public readonly InAdditionToBase: boolean
  ) {
    super("MHTsTriggerActionModifyMonsterAttribute_C");
  }
}

@AtomGenClass("状态")
class CustomActionRemoveEMBuffState extends CustomActionDelegate {
  public constructor(public readonly BuffStateName: string) {
    super("MHTsTriggerActionEMRemoveBuffState_C");
  }
}

@AtomGenClass("状态")
class CustomActionAddEMBuffState extends CustomActionDelegate {
  public constructor(public readonly BuffStateName: string) {
    super("MHTsTriggerActionEMAddBuffState_C");
  }
}

@AtomGenClass("CustomActionModifyAttackAddPartBreakDelegate")
class CustomActionModifyAttackAddPartBreakDelegate extends CustomActionDelegate {
  public constructor(
    public readonly AdditionalPartBreak: NumberValueDelegate,
    public readonly AdditionalPartBreakMultiplier: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackAddPartBreak_C");
  }
}

@AtomGenClass("属性")
class CustomActionModifyAttackChangeAttributeAfterwardsDelegate extends CustomActionDelegate {
  public constructor(
    public readonly AttackerOrVictim: boolean,
    public readonly AttributeName: string,
    public readonly AttributeChange: NumberValueDelegate
  ) {
    super("MHTsTriggerActionModifyAttackChangeAttributeAfterwards_C");
  }
}

@AtomGenClass("属性")
class ChangeAttributeByMultiplierTaskDelegate extends TaskDelegate {
  public readonly AttributeKey: string;
  public readonly Multiplier: number;

  public constructor(
    AttributeKey: string,
    Multiplier: number | NumberValueConstDelegate
  ) {
    super(
      "ArashiAbilityTaskChangeAttributeByMultiplier_C",
      1048576,
      "AbilityTasks/Monster/Monster/ArashiAbilityTaskChangeAttributeByMultiplier",
      "ArashiAbilityTaskChangeAttributeByMultiplier",
      ue.EMHAbilityTaskRealm.All
    );

    this.AttributeKey = AttributeKey; // eslint-disable-line prettier/prettier
    this.Multiplier =
      typeof Multiplier === "number" ? Multiplier : Multiplier.Constant; // eslint-disable-line prettier/prettier
  }
}

@AtomGenClass("SetFuBenSpecialPartTaskDelegate")
class SetFuBenSpecialPartTaskDelegate extends TaskDelegate {
  public readonly BreakablePartName: string;

  public constructor(BreakablePartName: string) {
    super(
      "ArashiAbilityTaskSetFuBenSpecialPart_C",
      1048576,
      "AbilityTasks/Monster/ArashiAbilityTaskSetFuBenSpecialPart",
      "ArashiAbilityTaskSetFuBenSpecialPart",
      ue.EMHAbilityTaskRealm.All
    );

    this.BreakablePartName = BreakablePartName; // eslint-disable-line prettier/prettier
  }
}

@AtomGenClass("生命值")
class CustomActionModifyHealthPointLoss extends CustomActionDelegate {
  public constructor(public readonly HealthPointLoss: NumberValueDelegate) {
    super("MHTsTriggerActionModifyHealthPointLoss_C");
  }
}

@AtomGenClass("名称")
class CustomActionModifyHitBoneName extends CustomActionDelegate {
  public constructor(public readonly BoneName: string) {
    super("MHTsTriggerActionModifyHitBoneName_C");
  }
}

@AtomGenClass("属性")
class CustomActionModifyVictimAttributeAfterwards extends CustomActionModifyAttackChangeAttributeAfterwardsDelegate {
  public constructor(
    AttributeName: string,
    AttributeChange: NumberValueDelegate
  ) {
    super(false, AttributeName, AttributeChange);
  }
}

@AtomGenClass("属性")
class CustomActionModifyAttackerAttributeAfterwards extends CustomActionModifyAttackChangeAttributeAfterwardsDelegate {
  public constructor(
    AttributeName: string,
    AttributeChange: NumberValueDelegate
  ) {
    super(true, AttributeName, AttributeChange);
  }
}

@AtomGenClass("技能")
class ActivateAbilityAction extends CustomActionDelegate {
  public readonly AbilityConfigID: string;

  public constructor(AbilityConfigID: string) {
    super("MHTsTriggerActionActivateAbilityByConfigID_C");
    this.AbilityConfigID = AbilityConfigID;
  }
}

@AtomGenClass("字段")
class FieldDisableNextDestroyAction extends CustomActionDelegate {
  public constructor() {
    super("MHTsTriggerActionFieldDisableNextDestroy_C");
  }
}

@AtomGenClass("字段")
class FieldCustomDestroyAction extends CustomActionDelegate {
  public constructor() {
    super("MHTsTriggerActionFieldExecuteCustomDestory_C");
  }
}

abstract class StatusEffectInflictionOnMonsterAction extends ActionDelegate {
  public constructor(
    public readonly StatusEffect: keyof typeof EStatusEffect,
    public readonly Target: ActorValueDelegate,
    public readonly BuildUp: NumberValueDelegate,
    public readonly DebuffDuration: NumberValueDelegate,
    public readonly DamageOrDamagePerTick: NumberValueDelegate,
    public readonly TickFrequency: NumberValueDelegate
  ) {
    super("ArashiTriggerActionInflictStatusEffectOnMonster_C");
  }
}
@AtomGenClass("状态")
class PoisonStatusEffectInflictionOnMonsterAction extends StatusEffectInflictionOnMonsterAction {
  public constructor(
    Target: ActorValueDelegate,
    BuildUp: NumberValueDelegate,
    DebuffDuration: NumberValueDelegate,
    DamageOrDamagePerTick: NumberValueDelegate,
    TickFrequency: NumberValueDelegate
  ) {
    super(
      "Poison",
      Target,
      BuildUp,
      DebuffDuration,
      DamageOrDamagePerTick,
      TickFrequency
    );
  }
}
@AtomGenClass("状态")
class ParalysisStatusEffectInflictionOnMonsterAction extends StatusEffectInflictionOnMonsterAction {
  public constructor(
    Target: ActorValueDelegate,
    BuildUp: NumberValueDelegate,
    DebuffDuration: NumberValueDelegate
  ) {
    super(
      "Paralysis",
      Target,
      BuildUp,
      DebuffDuration,
      ZeroConstNumberValue,
      ZeroConstNumberValue
    );
  }
}
@AtomGenClass("状态")
class SleepStatusEffectInflictionOnMonsterAction extends StatusEffectInflictionOnMonsterAction {
  public constructor(
    Target: ActorValueDelegate,
    BuildUp: NumberValueDelegate,
    DebuffDuration: NumberValueDelegate
  ) {
    super(
      "Sleep",
      Target,
      BuildUp,
      DebuffDuration,
      ZeroConstNumberValue,
      ZeroConstNumberValue
    );
  }
}
@AtomGenClass("状态")
class StunStatusEffectInflictionOnMonsterAction extends StatusEffectInflictionOnMonsterAction {
  public constructor(
    Target: ActorValueDelegate,
    BuildUp: NumberValueDelegate,
    DebuffDuration: NumberValueDelegate
  ) {
    super(
      "Stun",
      Target,
      BuildUp,
      DebuffDuration,
      ZeroConstNumberValue,
      ZeroConstNumberValue
    );
  }
}

@AtomGenClass("值")
class SummonCustomValueNumberDelegate extends NumberValueDelegate {
  public constructor(public readonly Index: number) {
    super("MHTsNumberTriggerValueSummonCustomValue_C");
  }
}

@AtomGenClass("副本")
class FubenTimeNumbleDelegate extends NumberValueDelegate {
  public constructor() {
    super("MHTsNumberTriggerValueFubenTime_C");
  }
}

@AtomGenClass("物品")
class HaveItemBoolValueDelegate extends NumberValueDelegate {
  public constructor(public readonly ItemID: NumberValueDelegate) {
    super("MHTsBoolTriggerValueHaveItem_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckIsInBattleDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTsBoolTriggerValueCheckIsInBattle_C");
  }
}

@AtomGenClass("粒子")
class ParticleEffectTaskDelegate extends TaskDelegate {
  public readonly AttachToComponent = false;
  public readonly ComponentName = "";
  public readonly AttachToVisibleComp = false;

  public constructor(
    public readonly Effect: string,
    public readonly AttachToSocket: boolean,
    public readonly SocketName: string,
    public readonly SpawnLocation: {
      readonly X: number;
      readonly Y: number;
      readonly Z: number;
    },
    public readonly SpawnRotation: {
      readonly Pitch: number;
      readonly Yaw: number;
      readonly Roll: number;
    }, // eslint-disable-line prettier/prettier
    public readonly Scale: number,
    public readonly StopAtEnd: boolean,
    public readonly NiagaraEffect: string,
    public readonly RelativeTransformToCaster: boolean,
    public readonly Duration: number,
    public readonly bAbsoluteRotation: boolean
  ) {
    super(
      "MHTsTaskParticleEffect_C",
      1048576,
      "AbilityTasks/Common/Effect/MHTsTaskParticleEffect",
      "MHTsTaskParticleEffect",
      ue.EMHAbilityTaskRealm.ClientOnly
    );
  }
}
@AtomGenClass("连续")
class ContinuousSpikeTalentDelegate extends TaskDelegate {
  public ModifierIds: Array<number> = [];
  public constructor(
    public AbilityConfigIdCfg: string,
    ...ModifierIds: Array<NumberValueConstDelegate>
  ) {
    super(
      "MHTsAbilityTaskContinuousSpikeTalent_C",
      1048576,
      "AbilityTasks/Common/Buff/MHTsAbilityTaskContinuousSpikeTalent",
      "MHTsAbilityTaskContinuousSpikeTalent",
      ue.EMHAbilityTaskRealm.LocalOnly
    );
    this.ModifierIds = ModifierIds.map((ModifierId) => ModifierId.Constant);
  }
}

@AtomGenClass("EventControlledBuffTaskDelegate")
class EventControlledBuffTaskDelegate extends TaskDelegate {
  public readonly ThresholdTime: number = undefined;

  public readonly BuffId: string;

  public constructor(
    BuffId: NumberValueConstDelegate,
    public readonly Event: EventDelegateEx,
    ThresholdTime: NumberValueConstDelegate
  ) {
    super(
      "ArashiAbilityTaskEventControlledBuff_C",
      1048576,
      "AbilityTasks/Common/Buff/ArashiAbilityTaskEventControlledBuff",
      "ArashiAbilityTaskEventControlledBuff",
      ue.EMHAbilityTaskRealm.ServerOnly
    );

    this.ThresholdTime = ThresholdTime.Constant;
    Assert(Number.isFinite(this.ThresholdTime) && this.ThresholdTime >= 0);
    this.BuffId = BuffId.Constant.toString();
  }
}

@AtomGenClass("生命值")
class RedHealthRelievingPausingTaskDelegate extends TaskDelegate {
  public constructor() {
    super(
      "MHTsTaskPauseRedHealthRegeneration_C",
      1048576,
      "AbilityTasks/Common/Buff/ArashiAbilityTaskEventControlledBuff",
      "MHTsTaskPauseRedHealthRegeneration",
      ue.EMHAbilityTaskRealm.ServerOnly
    );
  }
}

@AtomGenClass("粒子")
class MonsterParticleEffectTaskDelegate extends TaskDelegate {
  public readonly EffectTag = { TagName: undefined };
  public readonly EffectStopOnTaskEnd: boolean = undefined;

  public constructor(TagName: string, EffectStopOnTaskEnd: boolean) {
    super(
      "MHAbilityTask_EMParticleEffectWithTag_C",
      1048576,
      "AbilityTasks/Monster/Effect/MHAbilityTask_EMParticleEffectWithTag",
      "MHAbilityTask_EMParticleEffectWithTag",
      ue.EMHAbilityTaskRealm.ClientOnly
    );

    this.EffectTag.TagName = TagName;
    this.EffectStopOnTaskEnd = !!EffectStopOnTaskEnd;
  }
}

@AtomGenClass("事件")
class ActivateAkEventTaskDelegate extends TaskDelegate {
  public readonly AkEventName: string = undefined;

  public constructor(AkEventName: string) {
    super(
      "MHTsActivateAkEventTask_C",
      1048576,
      "AbilityTasks/Common/Audio/MHTsActivateAkEventTask",
      "MHTsActivateAkEventTask",
      ue.EMHAbilityTaskRealm.ClientOnly
    );
    this.AkEventName = AkEventName;
  }
}

@AtomGenClass("TaskTakeActionExDelegate")
class TaskTakeActionExDelegate extends TaskDelegate {
  public constructor(
    public readonly BeginAction: ActionDelegate,
    public readonly TickAction: ActionDelegate,
    public readonly EndAction: ActionDelegate
  ) {
    super(
      "MHTsTaskTakeActionEx_C",
      1048576,
      "AbilityTasks/Common/Action/MHTsTaskTakeActionEx",
      "MHTsTaskTakeActionEx"
    );
  }
}

@AtomGenClass("ActionOverTimeTaskDelegate")
class ActionOverTimeTaskDelegate extends TaskDelegate {
  public constructor(
    public readonly Interval: number,
    public readonly Action: ActionDelegate
  ) {
    super(
      "MHTsAbilityTaskActionOverTime_C",
      1048576,
      "AbilityTasks/Common/Buff/MHTsAbilityTaskActionOverTime",
      "MHTsAbilityTaskActionOverTime"
    );
  }
}

@AtomGenClass("速度")
class BowgunModifyAmmoRechargeSpeedTaskDelegate extends TaskDelegate {
  public readonly WyvernheartSpeedUp: number;
  public readonly PowerfulAmmoSpeedUp: number;

  public constructor(
    WyvernheartSpeedUp: number | NumberValueConstDelegate,
    PowerfulAmmoSpeedUp: number | NumberValueConstDelegate
  ) {
    super(
      "ArashiAbilityTaskBowgunModifyAmmoRechargeSpeed_C",
      1048576,
      "AbilityTasks/Character/Bowgun/ArashiAbilityTaskBowgunModifyAmmoRechargeSpeed",
      "ArashiAbilityTaskBowgunModifyAmmoRechargeSpeed",
      ue.EMHAbilityTaskRealm.LocalOnly,
      false,
      true
    );

    this.WyvernheartSpeedUp =
      typeof WyvernheartSpeedUp === "number"
        ? WyvernheartSpeedUp
        : WyvernheartSpeedUp.Constant; // eslint-disable-line prettier/prettier
    this.PowerfulAmmoSpeedUp =
      typeof PowerfulAmmoSpeedUp === "number"
        ? PowerfulAmmoSpeedUp
        : PowerfulAmmoSpeedUp.Constant; // eslint-disable-line prettier/prettier
  }
}

@AtomGenClass("EventActionExTaskDelegate")
class EventActionExTaskDelegate extends TaskDelegate {
  public constructor(
    public readonly Event: EventDelegateEx,
    public readonly Action: ActionDelegate
  ) {
    super(
      "MHTsTaskTriggerEventActionEx_C",
      1048576,
      "AbilityTasks/Common/Action/MHTsTaskTriggerEventActionEx",
      "MHTsTaskTriggerEventActionEx"
    );
  }
}

@AtomGenClass("开")
class ApplyBuffOnMasterCharacterTaskDelegate extends TaskDelegate {
  public readonly BuffId: string = undefined;

  public constructor(BuffId: NumberValueConstDelegate) {
    super(
      "MHTsAbilityTaskApplyBuffOnMasterCharacter_C",
      1,
      "AbilityTasks/Common/Buff/MHTsAbilityTaskApplyBuffOnMasterCharacter",
      "MHTsAbilityTaskApplyBuffOnMasterCharacter",
      ue.EMHAbilityTaskRealm.ServerOnly,
      false,
      false
    );
    this.BuffId = BuffId.Constant.toString();
  }
}

@AtomGenClass("CombatResourceChangeModificationTaskDelegate")
class CombatResourceChangeModificationTaskDelegate extends TaskDelegate {
  public readonly Tags: ReadonlyArray<string> = undefined;

  public constructor(
    public readonly CombatResourceName: string,
    public readonly AddendOrSubtrahend: NumberValueDelegate,
    public readonly Multiplier: NumberValueDelegate,
    ...Tags: readonly string[]
  ) {
    super(
      "MHTsTaskCombatResourceChangeModification_C",
      1,
      "AbilityTasks/Attribute/MHTsTaskCombatResourceChangeModification",
      "MHTsTaskCombatResourceChangeModification",
      ue.EMHAbilityTaskRealm.LocalOnly,
      false,
      false
    );

    this.Tags = Tags;
  }
}

@AtomGenClass("属性")
class AddAttributeTaskDelegate extends TaskDelegate {
  public constructor(
    public readonly FactorName: string,
    public readonly AttributeChange: NumberValueDelegate,
    public readonly SpecifiedModifierInfo = "",
    bImportant: boolean
  ) {
    super(
      "MHTsTaskAddAttributeModifierEx_C",
      1,
      "AbilityTasks/Attribute/MHTsTaskAddAttributeModifierEx",
      "MHTsTaskAddAttributeModifierEx",
      undefined,
      bImportant,
      false
    );
  }
}

@AtomGenClass("属性")
class AddAttributeTaskFixedAtBeginning extends AddAttributeTaskDelegate {
  public constructor(FactorName: string, AttributeChange: NumberValueDelegate) {
    super(FactorName, AttributeChange, "", false);
  }
}

@AtomGenClass("字段")
class AddFieldDurationModifierTaskDelegate extends TaskDelegate {
  public readonly FieldConfigID: string = undefined;
  public readonly FieldDurationToAdd: number = undefined;

  public constructor(
    FieldConfigID: NumberValueConstDelegate,
    FieldDurationToAdd: NumberValueConstDelegate
  ) {
    super(
      "MHAbilityTask_AddFieldDurationModifier_C",
      1048576,
      "AbilityTasks/Character/MHAbilityTask_AddFieldDurationModifier",
      "MHAbilityTask_AddFieldDurationModifier"
    );
    this.FieldConfigID = FieldConfigID.Constant.toString();
    this.FieldDurationToAdd = FieldDurationToAdd.Constant;
  }
}

@AtomGenClass("构建")
class CombatResourceConsumptionBuildUpOrRestorationTaskDelegate extends TaskDelegate {
  public readonly CombatResource: ue.ECombatResource;

  public readonly ConsumptionBuildUpOrRestoration: number;
  public readonly ConsumptionBuildUpOrRestorationInterval: number;

  public readonly ConsumptionBuildUpOrRestorationOnBegin: number;
  public readonly ConsumptionBuildUpOrRestorationOnEnd: number;

  public constructor(
    CombatResourceName: keyof typeof ue.ECombatResource,
    ConsumptionBuildUpOrRestoration: NumberValueConstDelegate,
    ConsumptionBuildUpOrRestorationInterval: NumberValueConstDelegate,
    ConsumptionBuildUpOrRestorationOnBegin: NumberValueConstDelegate,
    ConsumptionBuildUpOrRestorationOnEnd: NumberValueConstDelegate
  ) {
    super(
      "ArashiAbilityTaskCombatResourceConsumptionBuildUpOrRestoration_C",
      1048576,
      "AbilityTasks/Character/Attribute/ArashiAbilityTaskCombatResourceConsumptionBuildUpOrRestoration",
      "ArashiAbilityTaskCombatResourceConsumptionBuildUpOrRestoration",
      ue.EMHAbilityTaskRealm.ClientOnly
    );
    this.CombatResource = ue.ECombatResource[CombatResourceName];
    this.ConsumptionBuildUpOrRestoration =
      ConsumptionBuildUpOrRestoration.Constant;
    this.ConsumptionBuildUpOrRestorationInterval =
      ConsumptionBuildUpOrRestorationInterval.Constant;
    this.ConsumptionBuildUpOrRestorationOnBegin =
      ConsumptionBuildUpOrRestorationOnBegin.Constant;
    this.ConsumptionBuildUpOrRestorationOnEnd =
      ConsumptionBuildUpOrRestorationOnEnd.Constant;
  }
}

@AtomGenClass("默认")
class HandleDefaultSuccActionDelegate extends ActionDelegate {
  public constructor() {
    super("MHTsCT_HandleDefaultSuccAction_C");
  }
}

@AtomGenClass("教程")
class SendTutorialTipsUnlockEventActionDelegate extends ActionDelegate {
  public constructor(
    public readonly TutorialID: NumberValueDelegate,
    public readonly DelayTime: NumberValueDelegate = ZeroConstNumberValue
  ) {
    super("MHTsCT_SendTutorialTipsUnlockEventAction_C");
  }
}

@AtomGenClass("CheckConditionTickActionDelegate")
class CheckConditionTickActionDelegate extends ActionDelegate {
  public constructor(
    public readonly SuccessAction: ActionDelegate,
    public readonly CheckSuccessCondition: BoolValueDelegate,
    public readonly CheckFailCondition: BoolValueDelegate,
    public readonly TickInterval: NumberValueDelegate = new NumberValueConstDelegate(
      1
    ),
    public readonly MaxTickTime: NumberValueDelegate = new NumberValueConstDelegate(
      120
    )
  ) {
    super("MHTsCT_CheckConditionTickAction_C");
  }
}

@AtomGenClass("值")
class BoolValueCheckAttackerAdventureDelegate extends BoolValueDelegate {
  public constructor(
    public readonly AdventureId: NumberValueDelegate,
    public readonly WeaponType: NumberValueDelegate
  ) {
    super("MHTsCT_CheckAttackerAdventure_C");
  }
}
@AtomGenClass("值")
class BoolValueCheckAttackerHitTargetBodyPartDelegate extends BoolValueDelegate {
  public constructor(public readonly HitBodyPart: string) {
    super("MHTsCT_CheckAttackerHitTargetBodyPart_C");
  }
}

// 下面这行不能删，用于自动生成代码
// Auto Gen Atom Delegate Implement

@AtomGenClass("当前")
class CheckCurrentFubenFinishTypeIs_BoolValueDelegate extends BoolValueDelegate {
  public constructor(public readonly FinishType: NumberValueDelegate) {
    super("MHTS_CheckCurrentFubenFinishTypeIs_C");
  }
}

@AtomGenClass("是否")
class CheckBuffSourceIsSelf_BoolValueDelegate extends BoolValueDelegate {
  public constructor() {
    super("MHTS_CheckBuffSourceIsSelf_C");
  }
}

@AtomGenClass("值")
class CheckWAEndMethodOnlySuccessOrFailed_BoolValueDelegate extends BoolValueDelegate {
  public constructor(
    readonly WAType: api.ENMWorldActivityType,
    readonly IsSuccess: boolean
  ) {
    super("MHTS_CheckWAEndMethodOnlySuccessOrFailed_C");
  }
}

@AtomGenClass("值")
class CheckWAEndMethod_BoolValueDelegate extends BoolValueDelegate {
  public constructor(
    readonly WAType: api.ENMWorldActivityType,
    readonly EndMethod: EWAEndMethod
  ) {
    super("MHTS_CheckWAEndMethod_C");
  }
}

@AtomGenClass("等级")
class CheckEntryLevel_BoolValueDelegate extends BoolValueDelegate {
  public constructor(
    public readonly EntryType: string,
    public readonly CheckLevel: NumberValueDelegate
  ) {
    super("MHTSCT_CheckEntryLevel_C");
  }
}

@AtomGenClass("类型")
class CheckInteractActionType_BoolValueDelegate extends BoolValueDelegate {
  public ActionType: number | NumberValueConstDelegate;
  public constructor(ActionType: number | NumberValueConstDelegate) {
    super("MHTS_CheckInteractActionType_C");
    this.ActionType =
      typeof ActionType === "number" ? ActionType : ActionType.Constant;
  }
}

@AtomGenClass("是否")
class CheckBagCapacityIsFull_BoolValueDelegate extends BoolValueDelegate {
  public BagCategoryID: number | NumberValueConstDelegate;
  public IsReal: boolean | BoolValueConstDelegate;
  public constructor(
    BagCategoryID: number | NumberValueConstDelegate,
    IsReal: boolean | BoolValueConstDelegate
  ) {
    super("MHTS_CheckBagCapacityIsFull_C");
    this.BagCategoryID =
      typeof BagCategoryID === "number"
        ? BagCategoryID
        : BagCategoryID.Constant;
    this.IsReal = typeof IsReal === "boolean" ? IsReal : IsReal.BoolConst;
  }
}

@AtomGenClass("值")
class CheckBagCapacityNumChangeID_BoolValueDelegate extends BoolValueDelegate {
  public ID: number | NumberValueConstDelegate;
  public constructor(ID: number | NumberValueConstDelegate) {
    super("MHTS_CheckBagCapacityNumChangeID_C");
    this.ID = typeof ID === "number" ? ID : ID.Constant;
  }
}

@AtomGenClass("数量")
class CheckBuildingCountChangedID_BoolValueDelegate extends BoolValueDelegate {
  public ID: number | NumberValueConstDelegate;

  public constructor(ID: number | NumberValueConstDelegate) {
    super("MHTS_CheckBuildingCountChangedID_C");
    this.ID = typeof ID === "number" ? ID : ID.Constant;
  }
}

@AtomGenClass("数量")
class CheckBuildingRemainCountLessThan_BoolValueDelegate extends BoolValueDelegate {
  public ID: number | NumberValueConstDelegate;
  public Count: number | NumberValueConstDelegate;
  public constructor(
    ID: number | NumberValueConstDelegate,
    Count: number | NumberValueConstDelegate
  ) {
    super("MHTS_CheckBuildingRemainCountLessThan_C");
    this.ID = typeof ID === "number" ? ID : ID.Constant;
    this.Count = typeof Count === "number" ? Count : Count.Constant;
  }
}

@AtomGenClass("节点")
class CheckStudyNodeCost_BoolValueDelegate extends BoolValueDelegate {
  public NodeID: number | NumberValueConstDelegate;

  public constructor(NodeID: number | NumberValueConstDelegate) {
    super("MHTS_CheckStudyNodeCost_C");
    this.NodeID = typeof NodeID === "number" ? NodeID : NodeID.Constant;
  }
}

@AtomGenClass("节点")
class CheckStudyNodeLevel_BoolValueDelegate extends BoolValueDelegate {
  public NodeID: number | NumberValueConstDelegate;
  public CheckType: string;
  public CheckLevel: number | NumberValueConstDelegate;

  public constructor(
    NodeID: number | NumberValueConstDelegate,
    CheckType: string,
    CheckLevel: number | NumberValueConstDelegate
  ) {
    super("MHTS_CheckStudyNodeLevel_C");
    this.NodeID = typeof NodeID === "number" ? NodeID : NodeID.Constant;
    this.CheckType = CheckType;
    this.CheckLevel =
      typeof CheckLevel === "number" ? CheckLevel : CheckLevel.Constant;
  }
}

@AtomGenClass("StudyTreeTriggerTips_ActionDelegate")
class StudyTreeTriggerTips_ActionDelegate extends ActionDelegate {
  public constructor(public readonly NodeID: NumberValueDelegate) {
    super("MHTS_StudyTreeTriggerTips_C");
  }
}

@AtomGenClass("移动")
class CheckMovementMode_BoolValueDelegate extends BoolValueDelegate {
  public PrevMovementMode: EMovementMode;
  public PrevCustomMovementMode: number;
  public NewMovementMode: EMovementMode;
  public NewCustomMovementMode: number;

  public constructor(
    PrevMovementMode: number | NumberValueConstDelegate,
    PrevCustomMovementMode: number | NumberValueConstDelegate,
    NewMovementMode: number | NumberValueConstDelegate,
    NewCustomMovementMode: number | NumberValueConstDelegate
  ) {
    super("MHTS_CheckMovementMode_C");
    this.PrevMovementMode =
      typeof PrevMovementMode === "number"
        ? PrevMovementMode
        : PrevMovementMode.Constant;

    this.PrevCustomMovementMode =
      typeof PrevCustomMovementMode === "number"
        ? PrevCustomMovementMode
        : PrevCustomMovementMode.Constant;

    this.NewMovementMode =
      typeof NewMovementMode === "number"
        ? NewMovementMode
        : NewMovementMode.Constant;

    this.NewCustomMovementMode =
      typeof NewCustomMovementMode === "number"
        ? NewCustomMovementMode
        : NewCustomMovementMode.Constant;
  }
}

@AtomGenClass("名称")
class CheckMonsterBodyBrokenPartName_BoolValueDelegate extends BoolValueDelegate {
  public constructor(
    public readonly PartName: string,
    public readonly bIsCut: BoolValueDelegate
  ) {
    super("MHTS_CheckMonsterBodyBrokenPartName_C");
  }
}

@AtomGenClass("值")
class CheckAddedSidetalkID_BoolValueDelegate extends BoolValueDelegate {
  public constructor(public readonly SidetalkID: NumberValueDelegate) {
    super("MHTS_CheckAddedSidetalkID_C");
  }
}

@AtomGenClass("教程")
class CheckTutorialIsUnlock_BoolValueDelegate extends BoolValueDelegate {
  public constructor(public readonly TutorialID: NumberValueDelegate) {
    super("MHTS_CheckTutorialIsUnlock_C");
  }
}

@AtomGenClass("武器")
class CheckActorWeaponType_BoolValueDelegate extends BoolValueDelegate {
  public constructor(public readonly WeaponType: NumberValueDelegate) {
    super("MHTS_CheckActorWeaponType_C");
  }
}

@AtomGenClass("当前")
class CheckCurrentAbility_BoolValueDelegate extends BoolValueDelegate {
  public constructor(public readonly AbilitySkillGroupId: NumberValueDelegate) {
    super("MHTSCT_CheckCurrentAbility_C");
  }
}

@AtomGenClass("AddSubTriggerList_ActionDelegate")
class AddSubTriggerList_ActionDelegate extends ActionDelegate {
  private readonly SubTriggerRelation: ESubTriggerOperate;
  public readonly SubTriggerConfigIds: ReadonlyArray<NumberValueDelegate> =
    undefined;
  public constructor(
    SubTriggerRelation: NumberValueConstDelegate,
    ...SubTriggerConfigIds: readonly NumberValueDelegate[]
  ) {
    super("MHTSCT_AddSubTriggerList_C");
    this.SubTriggerRelation = SubTriggerRelation.Constant as ESubTriggerOperate;
    this.SubTriggerConfigIds = SubTriggerConfigIds;
  }
}

@AtomGenClass("键")
class CheckInputKey_BoolValueDelegate extends BoolValueDelegate {
  public constructor(public readonly InputKey: string) {
    super("MHTSCT_CheckInputKey_C");
  }
}

@AtomGenClass("值")
class CheckBuffID_BoolValueDelegate extends BoolValueDelegate {
  public constructor(public readonly BuffID: NumberValueDelegate) {
    super("MHTSCT_CheckBuffID_C");
  }
}

@AtomGenClass("技能")
class AttSkillDefaultSuccAction_ActionDelegate extends ActionDelegate {
  public constructor(public readonly IsCheckDiffSkill: BoolValueDelegate) {
    super("MHTsCT_AttSkillDefaultSuccAction_C");
  }
}

@AtomGenClass("AddSubTrigger_ActionDelegate")
class AddSubTrigger_ActionDelegate extends ActionDelegate {
  public readonly SubTriggerIdStr: string;
  public constructor(SubTriggerId: NumberValueConstDelegate) {
    super("MHTsCT_AddSubTrigger_C");
    this.SubTriggerIdStr = SubTriggerId.Constant.toString();
  }
}

@AtomGenClass("构建")
class CombatResourceConsumptionBuildUpOrRestorationTickTask extends CombatResourceConsumptionBuildUpOrRestorationTaskDelegate {
  public constructor(
    CombatResourceName: keyof typeof ue.ECombatResource,
    ConsumptionBuildUpOrRestoration: NumberValueConstDelegate
  ) {
    super(
      CombatResourceName,
      ConsumptionBuildUpOrRestoration,
      ZeroConstNumberValue,
      ZeroConstNumberValue,
      ZeroConstNumberValue
    );
  }
}

@AtomGenClass("生命值")
class AdventurerHealthLockTaskDelegate extends TaskDelegate {
  public readonly HealthPointLock: number;
  public readonly HealthRatioLock: number;

  public constructor(
    HealthPointLock: number | NumberValueConstDelegate,
    HealthRatioLock: number | NumberValueConstDelegate
  ) {
    super(
      "ArashiAbilityTaskAdventurerHealthLock_C",
      1048576,
      "AbilityTasks/Character/Attribute/ArashiAbilityTaskAdventurerHealthLock",
      "ArashiAbilityTaskAdventurerHealthLock",
      ue.EMHAbilityTaskRealm.ServerOnly,
      false,
      true
    );

    this.HealthPointLock =
      typeof HealthPointLock === "number"
        ? HealthPointLock
        : HealthPointLock.Constant; // eslint-disable-line prettier/prettier
    this.HealthRatioLock =
      typeof HealthRatioLock === "number"
        ? HealthRatioLock
        : HealthRatioLock.Constant; // eslint-disable-line prettier/prettier
  }
}

@AtomGenClass("构建")
class CombatResourceConsumptionBuildUpOrRestorationIntervalTask extends CombatResourceConsumptionBuildUpOrRestorationTaskDelegate {
  public constructor(
    CombatResourceName: keyof typeof ue.ECombatResource,
    ConsumptionBuildUpOrRestorationOnBegin: NumberValueConstDelegate,
    ConsumptionBuildUpOrRestoration: NumberValueConstDelegate,
    ConsumptionBuildUpOrRestorationInterval: NumberValueConstDelegate,
    ConsumptionBuildUpOrRestorationOnEnd: NumberValueConstDelegate
  ) {
    super(
      CombatResourceName,
      ConsumptionBuildUpOrRestoration,
      ConsumptionBuildUpOrRestorationInterval,
      ConsumptionBuildUpOrRestorationOnBegin,
      ConsumptionBuildUpOrRestorationOnEnd
    );
  }
}

@AtomGenClass("构建")
class BuildUpOrRestoreInTickTaskDelegate extends TaskDelegate {
  public readonly CombatResource: ue.ECombatResource;

  public constructor(CombatResource: keyof typeof ue.ECombatResource) {
    super(
      "MHAbilityTask_BuildUpOrRestoreInTick_C",
      1048576,
      "AbilityTasks/Character/MHAbilityTask_BuildUpOrRestoreInTick",
      "MHAbilityTask_BuildUpOrRestoreInTick",
      ue.EMHAbilityTaskRealm.ServerOnly
    );

    this.CombatResource = ue.ECombatResource[CombatResource];
  }
}

@AtomGenClass("属性")
class AttributeAdditionTaskDelegate extends TaskDelegate {
  public readonly AttributeList: {};
  public readonly AdditionalToBase: boolean;

  public constructor(
    AttributeName: string,
    AttributeValue: NumberValueConstDelegate,
    AdditionalToBase: BoolValueConstDelegate
  ) {
    super(
      "MHTsTaskAttributeAddition_C",
      1048576,
      "AbilityTasks/Common/Attribute/MHTsTaskAttributeAddition",
      "MHTsTaskAttributeAddition",
      ue.EMHAbilityTaskRealm.All
    );
    this.AttributeList = {};
    this.AttributeList[AttributeName] = AttributeValue.Constant;
    this.AdditionalToBase = AdditionalToBase.BoolConst;
  }
}

@AtomGenClass("温度")
class TemperatureOvercomeTaskDelegate extends TaskDelegate {
  public readonly TemperatureType: ETemperatureType;
  public readonly ItemID: string;

  public constructor(
    TemperatureType: keyof typeof ETemperatureType,
    ItemID: string | NumberValueConstDelegate
  ) {
    super(
      "MHAbilityTask_TemperatureOvercome_C",
      1048576,
      "AbilityTasks/Character/MHAbilityTask_TemperatureOvercome",
      "MHAbilityTask_TemperatureOvercome",
      ue.EMHAbilityTaskRealm.ServerOnly
    );

    this.TemperatureType = ETemperatureType[TemperatureType];
    this.ItemID =
      typeof ItemID === "string" ? ItemID : ItemID.Constant.toString();
  }
}

@AtomGenClass("MeshGlowExTaskDelegate")
class MeshGlowExTaskDelegate extends TaskDelegate {
  public readonly MeshSlotNames: Array<string>;
  public readonly MaterialSlotName: string;
  public readonly Priority: number;
  public readonly OutlineEmissiveIntensity: number;
  public readonly OutlineEmissiveColor: ue.LinearColor;
  public readonly OutlineEmissiveIntensityCurveID: number;
  public readonly OutlineEmissiveColorCurveID: number;

  public constructor(
    MeshSlotNames: string, // 中括号包裹，用空格隔开的string[]
    MaterialSlotName: string,
    Priority: number | NumberValueConstDelegate,
    OutlineEmissiveIntensity: number | NumberValueConstDelegate,
    OutlineEmissiveColor: string, // 中括号包裹，用空格隔开的number[]
    OutlineEmissiveIntensityCurveID: number | NumberValueConstDelegate,
    OutlineEmissiveColorCurveID: number | NumberValueConstDelegate
  ) {
    super(
      "MHTsTaskMeshGlowEx_C",
      1048576,
      "AbilityTasks/Character/Effect/MHTsTaskMeshGlowEx",
      "MHTsTaskMeshGlowEx",
      ue.EMHAbilityTaskRealm.All
    );
    const SlotNames = MeshSlotNames.slice(1, -1).split("|");
    this.MeshSlotNames = new Array<string>();
    for (const EachSlotName of SlotNames) {
      this.MeshSlotNames.push(EachSlotName);
    }
    if (!MaterialSlotName) {
      this.MaterialSlotName = "None";
    } else {
      this.MaterialSlotName = MaterialSlotName;
    }
    this.Priority = typeof Priority === "number" ? Priority : Priority.Constant;
    this.OutlineEmissiveIntensity =
      typeof OutlineEmissiveIntensity === "number"
        ? OutlineEmissiveIntensity
        : OutlineEmissiveIntensity.Constant;
    const Colors = OutlineEmissiveColor.slice(1, -1).split("|");
    this.OutlineEmissiveColor = new ue.LinearColor(
      Colors.length > 0 ? Number(Colors[0]) / 256.0 : 1.0,
      Colors.length > 1 ? Number(Colors[1]) / 256.0 : 1.0,
      Colors.length > 2 ? Number(Colors[2]) / 256.0 : 1.0,
      Colors.length > 3 ? Number(Colors[3]) / 256.0 : 1.0
    );
    this.OutlineEmissiveIntensityCurveID =
      typeof OutlineEmissiveIntensityCurveID === "number"
        ? OutlineEmissiveIntensityCurveID
        : OutlineEmissiveIntensityCurveID.Constant;
    this.OutlineEmissiveColorCurveID =
      typeof OutlineEmissiveColorCurveID === "number"
        ? OutlineEmissiveColorCurveID
        : OutlineEmissiveColorCurveID.Constant;
  }
}

/** from c language */
const OperatorStringToPrecedenceInAtomSystem: ReadonlyMap<string, number> =
  new Map<string, number>([
    ["_", 2], // Negate

    [">=", 6], // GreaterEqual
    [">", 6], // Greater
    ["<=", 6], // LessEqual
    ["<", 6], // Less
    ["==", 7], // EqualTo
    ["!=", 7], // NotEqualTo

    ["!", 2], // LogicalNot

    ["+", 4], // Plus
    ["-", 4], // Minus
    ["*", 3], // Multiplies
    ["/", 3], // Divides
    ["%", 3], // Modulus

    ["&&", 11], // LogicalAnd
    ["||", 12], // LogicalOr

    [",", 15], // Comma
    ["(", 1023], // LeftParenthesis
    [")", 0], // RightParenthesis
  ]);

const ValidOperatorString: ReadonlySet<string> = (function (): Set<string> {
  const res = new Set<string>([
    ...OperatorStringToPrecedenceInAtomSystem.keys(),
  ]); // eslint-disable-line
  res.delete("_");
  return res;
})();

/** 若lhs优先级高于或等于rhs, 则返回true */
function HasHigherOrEqualPrecedenceThan(lhs: string, rhs: string): boolean {
  return (
    OperatorStringToPrecedenceInAtomSystem.get(lhs) <=
    OperatorStringToPrecedenceInAtomSystem.get(rhs)
  );
}

const OperatorStringToOperatorEnumInAtomSystem: ReadonlyMap<string, number> =
  new Map<string, number>([
    // eslint-disable-line
    [">=", ue.EMHBoolTriggerValueBinaryOperatorOnNumber.GreaterEqual],
    [">", ue.EMHBoolTriggerValueBinaryOperatorOnNumber.Greater],
    ["<=", ue.EMHBoolTriggerValueBinaryOperatorOnNumber.LessEqual],
    ["<", ue.EMHBoolTriggerValueBinaryOperatorOnNumber.Less],
    ["==", ue.EMHBoolTriggerValueBinaryOperatorOnNumber.EqualTo],
    ["!=", ue.EMHBoolTriggerValueBinaryOperatorOnNumber.NotEqualTo],

    ["+", ue.EMHNumberTriggerValueBinaryOperator.Plus],
    ["-", ue.EMHNumberTriggerValueBinaryOperator.Minus],
    ["*", ue.EMHNumberTriggerValueBinaryOperator.Multiplies],
    ["/", ue.EMHNumberTriggerValueBinaryOperator.Divides],
    ["%", ue.EMHNumberTriggerValueBinaryOperator.Modulus],

    ["&&", ue.EMHBoolTriggerValueBinaryOperatorOnBool.LogicalAnd],
    ["||", ue.EMHBoolTriggerValueBinaryOperatorOnBool.LogicalOr],
  ]);

const MinusAfterTheseTokensShouldBeDeemedAsUnary: ReadonlySet<string> =
  new Set<string>([
    "_",
    "-",
    "+",
    "*",
    "/",
    "%",
    "&&",
    "||",
    ">",
    ">=",
    "<",
    "<=",
    "==",
    "!=",
    ",",
    "(",
  ]); // eslint-disable-line

type DelegateConstructorType = // Constructor<DelegateBase>;
  (new (...args: any[]) => DelegateBase) | ((...args: any[]) => DelegateBase);

function Newable(
  fn: DelegateConstructorType
): fn is new (...args: any[]) => DelegateBase {
  if (fn.prototype) return true;

  console.log(`[AtomSystem][${Newable.name}] ${fn.name} not newable`);
  return false;
}

/* eslint-disable prettier/prettier */
export const FunctionNameToDelegate = new Map<string, DelegateConstructorType>();

// FunctionNameToDelegate.set(
//   "test",
//   BoolTriggerValueCheckEMTargetHealDelegate
// );
// FunctionNameToDelegate.set("IsAffinityHit", BoolValueAffinityHitDelegate);
// FunctionNameToDelegate.set(
//   "GetCombatTime",
//   NumberValueCharacterCombatTimeDelegate
// );
// FunctionNameToDelegate.set(
//   "NumberConst",
//   NumberValueConstDelegate
// );


FunctionNameToDelegate.set("__test", MetaDataTestDummyDelegate);
FunctionNameToDelegate.set("Min", NumberValueMinimumOperator);
FunctionNameToDelegate.set("Max", NumberValueMaximumOperator);
FunctionNameToDelegate.set("Clamp", NumberValueClampDelegate);
FunctionNameToDelegate.set("GetAttr", NumberValueAttributeDelegate);
FunctionNameToDelegate.set(
  "GetActorAttribute",
  NumberValueGetActorAttributeDelegate
);
FunctionNameToDelegate.set(
  "GetCombatTime",
  NumberValueCharacterCombatTimeDelegate
);
FunctionNameToDelegate.set("Random", NumberValueRandomDelegate);
FunctionNameToDelegate.set(
  "IsCharacterSufferingFrom",
  BoolValueCharacterSufferingFromDelegate
);
FunctionNameToDelegate.set(
  "IsCharacterSufferingFromStatusEffect",
  BoolValueCharacterSufferingFromStatusEffectDelegate
);
FunctionNameToDelegate.set(
  "AnyActorSufferingFromStatusEffect",
  BoolValueAnyActorSufferingFromStatusEffectDelegate
);
FunctionNameToDelegate.set("GetAttackTarget", ActorValueAttackTarget);
FunctionNameToDelegate.set("GetAttackSource", ActorValueAttackSource);
FunctionNameToDelegate.set("GetLockTarget", ActorValueLockTarget);
FunctionNameToDelegate.set(
  "GetNearestMonsterInRadio",
  ActionGetNearestMonsterInRadio
);
FunctionNameToDelegate.set(
  "GetCurrentlyVisitedActor",
  ActorValueCurrentlyVisitedDelegate
);
FunctionNameToDelegate.set("Self", ActorValueTriggerOwnerDelegate);
FunctionNameToDelegate.set("GetBuffSource", ActorValueBuffSource);
FunctionNameToDelegate.set("GetMaster", ActorValueMaster);
FunctionNameToDelegate.set("AAIGetEnemy", ActorValueAAIGetEnemy);
FunctionNameToDelegate.set("GetHeightOf", NumberValueGetActorHeightDelegate);
FunctionNameToDelegate.set(
  "ModifyHealthPointLoss",
  CustomActionModifyHealthPointLoss
);
FunctionNameToDelegate.set("ModifyHitBoneName", CustomActionModifyHitBoneName);
FunctionNameToDelegate.set(
  "ModifyVictimAttributeAfterwards",
  CustomActionModifyVictimAttributeAfterwards
);
FunctionNameToDelegate.set(
  "ModifyAttackerAttributeAfterwards",
  CustomActionModifyAttackerAttributeAfterwards
);
FunctionNameToDelegate.set(
  "ModifyAttackerAttribute",
  CustomActionModifyAttackerAttributeFactor
);
FunctionNameToDelegate.set(
  "ModifyVictimAttribute",
  CustomActionModifyVictimAttributeFactor
);
FunctionNameToDelegate.set(
  "ModifyAttackAtkNumAttModifier",
  CustomActionModifyAttackAtkNumAttModifierDelegate
);
FunctionNameToDelegate.set(
  "ModifyPhysicalMotionValue",
  CustomActionModifyAttackPhysicalMotionValue
);
FunctionNameToDelegate.set(
  "ModifyStatusEffectMotionValue",
  CustomActionModifyAttackStatusEffectMotionValue
);
FunctionNameToDelegate.set(
  "ModifyElementalMotionValue",
  CustomActionModifyAttackElementalMotionValue
);
FunctionNameToDelegate.set(
  "OverrideElementalDamage",
  CustomActionModifyAttackOverrideElementalDamageDelegate
);
FunctionNameToDelegate.set(
  "ModifyMotionValue",
  CustomActionModifyAttackMotionValueDelegate
);
FunctionNameToDelegate.set(
  "ModifyPostureDamage",
  CustomActionModifyAttackPostureDamageDelegate
);
FunctionNameToDelegate.set(
  "ModifyRealStatusEffectInfliction",
  CustomActionModifyAttackRealStatusEffectInflictions 
);
FunctionNameToDelegate.set(
  "ModifyThreatGeneration",
  CustomActionModifyAttackIncreaseThreatGeneration
);
FunctionNameToDelegate.set("DealDamage", CustomActionDealDamageDelegate);
FunctionNameToDelegate.set("MonsterDealDamage", CustomActionMonsterDealDamage);
FunctionNameToDelegate.set(
  "DealDamageByBuffHitConfigID",
  CustomActionDealDamageByBuffHitConfigID
);
FunctionNameToDelegate.set(
  "CheckContextAbilityHasTag",
  BoolValueCheckContextAbilityHasTag
);
FunctionNameToDelegate.set(
  "CheckContextAbilityIsFromSkillSlot",
  BoolValueCheckContextAbilityIsFromSkillSlot
);
FunctionNameToDelegate.set("GetHitzoneOfAttack", NumberValueGetHitzone);
FunctionNameToDelegate.set(
  "PartBreakOnAttack",
  CustomActionModifyAttackAddPartBreakDelegate
);
FunctionNameToDelegate.set("IsAffinityHit", BoolValueAffinityHitDelegate);
FunctionNameToDelegate.set(
  "CheckAttackPhysicalType",
  BoolValueCheckAttackPhysicalTypeDelegate
);
FunctionNameToDelegate.set(
  "CheckAttackIsBySkillHitId",
  BoolValueCheckAttackIsBySkillHitId
);
FunctionNameToDelegate.set(
  "CheckAttackIsBySkillSlot",
  BoolValueCheckAttackIsBySkillSlot
);
FunctionNameToDelegate.set(
  "IsDamageOverTime",
  BoolValueIsDamageOverTimeDelegate
);
FunctionNameToDelegate.set(
  "IsElementalCritical",
  BoolValueElementalCriticalHitDelegate
);
FunctionNameToDelegate.set(
  "AttackFromCertainAmmo",
  BoolValueAttackFromCertainAmmo
);
FunctionNameToDelegate.set(
  "CheckCharacterMotionMode",
  BoolValueCheckCharacterMotionModeDelegate
);
FunctionNameToDelegate.set("AttackingBrokenPart", BoolValueAttackingBrokenPart);
FunctionNameToDelegate.set("IsActorInAir", BoolValueIsActorInAirDelegate);
FunctionNameToDelegate.set(
  "ModifyCharacterAttribute",
  CustomActionModifyCharacterAttributeDelegate
);
FunctionNameToDelegate.set(
  "ModifyMonsterAttribute",
  CustomActionModifyMonsterAttributeDelegate
);
FunctionNameToDelegate.set("RemoveEMBuffState", CustomActionRemoveEMBuffState);
FunctionNameToDelegate.set("AddEMBuffState", CustomActionAddEMBuffState);
FunctionNameToDelegate.set("ApplyBuffOn", ActionApplyBuff);
FunctionNameToDelegate.set(
  "ApplyBuffUnderThisBuffOn",
  ActionApplyBuffUnderThisBuffOn
);
FunctionNameToDelegate.set(
  "ApplyBuffWithSource",
  ActionApplyBuffWithSourceDelegate
);
FunctionNameToDelegate.set("Heal", ActionHealDelegate);
FunctionNameToDelegate.set(
  "DispelCharacterStatusEffect",
  ActionDispelCharacterStatusEffectDelegate
);
FunctionNameToDelegate.set(
  "ChangeCharacterStaminaMax",
  ActionChangeCharacterStaminaMax
);
FunctionNameToDelegate.set(
  "ChangeCharacterStamina",
  ActionChangeCharacterStamina
);
FunctionNameToDelegate.set("AttackFromSocket", BoolValueAttackFromSocket);
FunctionNameToDelegate.set("GetBuffStack", NumberValueBuffStack);
FunctionNameToDelegate.set("BowgunAmmoType", NumberValueBowgunAmmoType);
FunctionNameToDelegate.set(
  "AttackBowgunMagazineInfo",
  NumberValueAttackBowgunMagazineInfoDelegate
);
FunctionNameToDelegate.set(
  "GetBuffStackByBuffId",
  NumberValueBuffBuffStackByBuffId
);
FunctionNameToDelegate.set("IsTheSameActor", BoolValueIsTheSameActorDelegate);
FunctionNameToDelegate.set("PetSkillCD", BoolValuePetSkillCDDelegate);
FunctionNameToDelegate.set("PetSkillEnergy", BoolValuePetSkillEnergyDelegate);
FunctionNameToDelegate.set(
  "PetSkillPriority",
  BoolValuePetSkillPriorityDelegate
);
FunctionNameToDelegate.set(
  "PetCheckControllerFlag",
  BoolValuePetCheckControllerFlagDelegate
);
FunctionNameToDelegate.set("PetIsFree", BoolValuePetIsFreeDelegate);
FunctionNameToDelegate.set(
  "PetMasterWeaponType",
  BoolValuePetMasterWeaponTypeDelegate
);
FunctionNameToDelegate.set("CheckWeaponType", BoolValueCheckWeaponTypeDelegate);
FunctionNameToDelegate.set(
  "CheckWeaponState",
  BoolValueCheckWeaponStateDelegate
);
FunctionNameToDelegate.set("PetIsFlying", BoolValuePetIsFlyingDelegate);
FunctionNameToDelegate.set(
  "PetHasHelpTarget",
  BoolValuePetHasHelpTargetDelegate
);
FunctionNameToDelegate.set(
  "PetCheckAndSetHealTarget",
  BoolValuePetCheckAndSetHealTargetDelegate
);
FunctionNameToDelegate.set("PetHasSkill", BoolValuePetHasSkillDelegate);
FunctionNameToDelegate.set(
  "AnyActorAttributeLowerThan",
  BoolValueAnyActorAttributeLowerThan
);
FunctionNameToDelegate.set(
  "AnyAdventurerHealthPercentLowerThan",
  BoolValueAnyAdventurerHealthPercentLowerThan
);
FunctionNameToDelegate.set("PetMasterCanBird", BoolValuePetMasterCanBird);
FunctionNameToDelegate.set(
  "PetMasterJustAttacked",
  NumberValuePetMasterJustAttackedDelegate
);
FunctionNameToDelegate.set(
  "PetTargetMonsterInDisadvantageTimes",
  NumberValuePetTargetMonsterInDisadvantageTimes
);
FunctionNameToDelegate.set(
  "GetPlayerCharacter",
  ActorValueGetPlayerCharacterDelegate
);
FunctionNameToDelegate.set("GetPet", ActorValueGetPetDelegate);
FunctionNameToDelegate.set("GetPetTarget", ActorValueGetPetTargetDelegate);
FunctionNameToDelegate.set("GetDist", NumberValueGetDistDelegate);
FunctionNameToDelegate.set("GetDist2D", NumberValueGetDist2DDelegate);
FunctionNameToDelegate.set("GetDistZ", NumberValueGetDistZDelegate);
FunctionNameToDelegate.set("IsCharacter", BoolValueIsCharacter);
FunctionNameToDelegate.set("IsPet", BoolValueIsPet);
FunctionNameToDelegate.set("IsMonster", BoolValueIsMonster);
FunctionNameToDelegate.set("MonsterIsSleeping", BoolValueMonsterSleeping);
FunctionNameToDelegate.set("CombineActions", ActionTakeActionsExDelegate);
FunctionNameToDelegate.set(
  "ConditionalAction",
  ActionTakeConditionalActionExDelegate
);
FunctionNameToDelegate.set("NOP", ActionNOPDelegate);
FunctionNameToDelegate.set("QuotaAction", ActionQuotaAction);
FunctionNameToDelegate.set(
  "QuotaActionWithSpecifiedID",
  ActionQuotaActionWithSpecifiedID
);
FunctionNameToDelegate.set("CoolDownAction", ActionCoolDownAction);
FunctionNameToDelegate.set(
  "CoolDownActionWithSpecifiedID",
  ActionCoolDownActionWithSpecifiedID
);
FunctionNameToDelegate.set(
  "QuotaAndCoolDownAction",
  ActionQuotaAndCoolDownAction
);
FunctionNameToDelegate.set(
  "QuotaAndCoolDownActionWithSpecifiedID",
  ActionQuotaAndCoolDownActionWithSpecifiedID
);
FunctionNameToDelegate.set(
  "ConditionalNumber",
  NumberValueConditionalNumberDelegate
);
FunctionNameToDelegate.set(
  "CheckAbilityCategory",
  BoolValueCheckAbilityCategory
);
FunctionNameToDelegate.set(
  "CheckAbilityCategoryTimer",
  BoolValueCheckAbilityCategoryTimer
);
FunctionNameToDelegate.set(
  "CountSurroundingMonster",
  NumberValueSurroundingMonsterNumDelegate
);
FunctionNameToDelegate.set("AddAbilityCoolDown", ActionAddAbilityCoolDown);
FunctionNameToDelegate.set("SetAbilityCoolDown", ActionSetAbilityCoolDown);
FunctionNameToDelegate.set(
  "WithinClosedInterval",
  BoolValueFallingWithinTheClosedInterval
);
FunctionNameToDelegate.set(
  "WithinInterval",
  BoolValueFallingWithinTheIntervalDelegate
);
FunctionNameToDelegate.set("GetBuffTime", NumberValueBuffTimeDelegate);
FunctionNameToDelegate.set(
  "CountPartyAdventurerThat",
  NumberValueCountPartyAdventurerDelegate
);
FunctionNameToDelegate.set(
  "GetBuffRemainingTime",
  NumberValueBuffRemainingTimeDelegate
);
FunctionNameToDelegate.set("AddPetStamina", ActionAddPetStaminDelegate);
FunctionNameToDelegate.set(
  "DelayMonsterStiffnessTime",
  ActionDelayMonsterStiffnessTimeDelegate
);
FunctionNameToDelegate.set(
  "ChangeMonsterCurStiffnessTime",
  ActionChangeMonsterCurStiffnessTimeDelegate
);
FunctionNameToDelegate.set(
  "DelayBuffDuration",
  ActionDelayBuffDurationDelegate
);
FunctionNameToDelegate.set("MaxEx", NumberValueMaxEx);
FunctionNameToDelegate.set("MinEx", NumberValueMinEx);
FunctionNameToDelegate.set("SwitchCase", ActionSwitchCaseDelegate);
FunctionNameToDelegate.set(
  "CheckEMCreatureState",
  BoolValueCheckEMCreatureStateDelegate
);
FunctionNameToDelegate.set(
  "CheckEMTeamIndex",
  BoolValueCheckEMTeamIndexDelegate
);
FunctionNameToDelegate.set("CheckEMStageId", BoolValueCheckEMStageIdDelegate);
FunctionNameToDelegate.set(
  "CheckEMTargetHeal",
  BoolTriggerValueCheckEMTargetHealDelegate
);
FunctionNameToDelegate.set(
  "CheckEMTargetHelpless",
  BoolTriggerValueCheckEMTargetHelplessDelegate
);
FunctionNameToDelegate.set(
  "CheckEMTargetSufferingFrom",
  BoolTriggerValueCheckEMTargetSufferingFromDelegate
);
FunctionNameToDelegate.set(
  "CheckEMLostHpInSpan",
  BoolTriggerValueCheckEMLostHpInSpanDelegate
);
FunctionNameToDelegate.set(
  "CheckEMTargetHpPercent",
  BoolTriggerValueCheckEMTargetHpPercentDelegate
);
FunctionNameToDelegate.set(
  "CheckEMTargetDamageCount",
  BoolTriggerValueCheckEMTargetDamageCountDelegate
);
FunctionNameToDelegate.set(
  "CheckEMTargetAngle",
  BoolTriggerValueCheckEMTargetAngleDelegate
);
FunctionNameToDelegate.set(
  "CheckEMTargetDistance",
  BoolTriggerValueCheckEMTargetDistanceDelegate
);
FunctionNameToDelegate.set(
  "CheckHasSkillSpline",
  BoolValueCheckHasSkillSplineDelegate
);
FunctionNameToDelegate.set(
  "StartEMCounterAttack",
  ActionStartCounterAttackDelegate
);
FunctionNameToDelegate.set(
  "PauseEMCounterAttack",
  ActionPauseCounterAttackDelegate
);
FunctionNameToDelegate.set(
  "ResetEMCounterAttack",
  ActionResetCounterAttackDelegate
);
FunctionNameToDelegate.set(
  "TriggerEMAIRespond",
  ActionTriggerEMAIRespondDelegate
);
FunctionNameToDelegate.set("EMInClimbArea", BoolValueCheckEMInClimbArea);
FunctionNameToDelegate.set("EMInFoodState", BoolValueCheckEMInFoodState);
FunctionNameToDelegate.set(
  "IsPerformingAbility",
  BoolValueActorIsPerformingAbility
);
FunctionNameToDelegate.set(
  "IsInCertainMonsterBuffState",
  BoolValueActorIsInCertainMonsterBuffState
);
FunctionNameToDelegate.set("IsConsumingItem", BoolValueActorIsConsumingItem);
FunctionNameToDelegate.set(
  "CheckMonsterIsInStiffnessState",
  BoolTriggerValueMonsterInStiffnessStateDelegate
);
FunctionNameToDelegate.set("EMIsMaxComboDesire", BoolValueEMIsMaxComboDesire);
FunctionNameToDelegate.set("DispelSelf", ActionDispelAffiliatedBuffDelegate);
FunctionNameToDelegate.set("ActivateAbility", ActivateAbilityAction);
FunctionNameToDelegate.set(
  "FieldDisableNextDestroy",
  FieldDisableNextDestroyAction
);
FunctionNameToDelegate.set("FieldCustomDestroy", FieldCustomDestroyAction);
FunctionNameToDelegate.set(
  "RemoveBuffsByBuffID",
  ActionRemoveBuffsByBuffIDDelegate
);
FunctionNameToDelegate.set(
  "ResetAbilityCategoryTimer",
  ActionResetAbilityCategoryTimerDelegate
);
FunctionNameToDelegate.set("CheckBuff", BoolValueCheckBuffDelegate);
FunctionNameToDelegate.set("CheckBuffState", BoolValueCheckBuffStateDelegate);
FunctionNameToDelegate.set("SpawnField", ActionSpawnFieldDelegate);
FunctionNameToDelegate.set("SpawnSoap", ActionSpawnSoapDelegate);
FunctionNameToDelegate.set(
  "SetSummonWalkingSpeed",
  ActionSetSummonWalkingSpeedDelegate
);
FunctionNameToDelegate.set(
  "SetSummonMoveMode",
  ActionSetSummonMoveModeDelegate
);
FunctionNameToDelegate.set("GetSkillGroupID", NumberValueSkillGroupIDDelegate);
FunctionNameToDelegate.set("NeedDodge", BoolValueNeedDodge);
FunctionNameToDelegate.set(
  "CheckPlayerInMonsterAggro",
  BoolValueCheckPlayerInMonsterAggro
);
FunctionNameToDelegate.set(
  "CoopCombatEnergyFullTime",
  NumberTriggerValueCoopCombatEnergyFullTime
);
FunctionNameToDelegate.set("NextDamageTime", NumberValueNextDamageTime);
FunctionNameToDelegate.set(
  "ClosestMonsterAttackCollisionDistance",
  NumberValueClosestMonsterAttackCollisionDistance
);
FunctionNameToDelegate.set("AAINextDamageTime", NumberValueAAINextDamageTime);
FunctionNameToDelegate.set(
  "AAINextDamageTimeSpecificTaskType",
  NumberValueAAINextDamageTimeSpecificTaskType
);
FunctionNameToDelegate.set(
  "AAIToughnessZeroRemainTime",
  NumberValueAAIToughnessZeroRemainTime
);
FunctionNameToDelegate.set(
  "AAIFurinkazanStageRemainTime",
  NumberValueAAIFurinkazanStageRemainTime
);
FunctionNameToDelegate.set(
  "AAIMonsterInStiffnessType",
  BoolValueAAIMonsterInStiffnessTypeDelegate
);
FunctionNameToDelegate.set(
  "CheckPilotModeWithDodgeBtn",
  BoolValueCheckPilotModeWithDodgeBtnDelegate
);
FunctionNameToDelegate.set(
  "CheckPilotModeWithSheatheBtn",
  BoolValueCheckPilotModeWithSheatheBtnDelegate
);
FunctionNameToDelegate.set(
  "AAICheckIsSpecAI",
  BoolTriggerValueAAICheckIsSpecAIDelegate
);
FunctionNameToDelegate.set("AAINeedDodge", BoolValueAAINeedDodge);
FunctionNameToDelegate.set(
  "AAINeedCounterDamage",
  BoolValueAAINeedCounterDamage
);
FunctionNameToDelegate.set("AAIHasSkillGroup", BoolValueAAIHasSkillGroup);
FunctionNameToDelegate.set("AAIHasCommand", BoolValueAAIHasCommand);
FunctionNameToDelegate.set(
  "AAIInUnfriendlyField",
  BoolValueAAICheckInUnfriendlyFieldDelegate
);
FunctionNameToDelegate.set(
  "GetHbgBulletMaxShotDistance",
  NumberValueGetHbgBulletMaxShotDistance
);
FunctionNameToDelegate.set(
  "AddCombatPetEnergy",
  ActionAddCombatPetEnergyDelegate
);
FunctionNameToDelegate.set("GetKeyPressedTime", NumberValueGetKeyPressedTime);
FunctionNameToDelegate.set(
  "GetAbilityCurrentTime",
  NumberValueGetAbilityCurrentTime
);
FunctionNameToDelegate.set("GetFurinkazanStage", NumberValueGetFurinkazanStage);
FunctionNameToDelegate.set(
  "GetHbgCurrentBulletType",
  NumberValueGetHbgCurrentBulletType
);
FunctionNameToDelegate.set(
  "GetHbgCurrentBulletNum",
  NumberValueGetHbgCurrentBulletNum
);
FunctionNameToDelegate.set("GetHbgMaxBulletNum", NumberValueGetHbgMaxBulletNum);
FunctionNameToDelegate.set("AAIRandom", NumberValueAAIRandom);
FunctionNameToDelegate.set(
  "GetCombatPetTowerNum",
  NumberValueCombatPetTowerNumDelegate
);
FunctionNameToDelegate.set(
  "ModifyMonsterMotionSpeed",
  ModifyMonsterMotionSpeedTaskDelegate
);
FunctionNameToDelegate.set(
  "ModifyAbilitySpeed",
  ModifyAbilitySpeedTaskDelegate
);
FunctionNameToDelegate.set(
  "DispelCertainStatusEffectOfCharacter",
  ActionDispelCertainCharacterStatusEffectDelegate
);
FunctionNameToDelegate.set(
  "FallenCharacterAutomaticalReviving",
  ReviveTeamAdventurerOnLifeClaimTaskDelegate
);
FunctionNameToDelegate.set(
  "EventControlledBuff",
  EventControlledBuffTaskDelegate
);
FunctionNameToDelegate.set(
  "PauseRedHealthRelieving",
  RedHealthRelievingPausingTaskDelegate
);
FunctionNameToDelegate.set(
  "ContinuousSpikeTalentCustomTask",
  ContinuousSpikeTalentDelegate
);
FunctionNameToDelegate.set(
  "AttributeChangeFixedAtTheBeginning",
  AddAttributeTaskFixedAtBeginning
);
FunctionNameToDelegate.set("ModifyHealing", ActionModifyHealingDelegate);
FunctionNameToDelegate.set(
  "AddFieldDurationModifier",
  AddFieldDurationModifierTaskDelegate
);
FunctionNameToDelegate.set("CheckAttackTag", BoolValueCheckAttackTag);
FunctionNameToDelegate.set("SatiationOf", NumberValueSatiationDelegate);
FunctionNameToDelegate.set(
  "CharacterInTemperatureState",
  BoolValueCharacterTemperatureState
);
FunctionNameToDelegate.set(
  "CharacterInSatiationState",
  BoolValueCharacterSatiationState
);
FunctionNameToDelegate.set(
  "CharacterHasEmitterFireBullet",
  BoolValueCharacterHasEmitterFireBullet
);
FunctionNameToDelegate.set(
  "CharacterHasEmitterWaterBullet",
  BoolValueCharacterHasEmitterWaterBullet
);
FunctionNameToDelegate.set(
  "CharacterHasEmitterCrystalBullet",
  BoolValueCharacterHasEmitterCrystalBullet
);
FunctionNameToDelegate.set("CheckAdventureID", BoolValueCheckAdventureID);
FunctionNameToDelegate.set("CheckAdventureType", BoolValueCheckAdventureType);
FunctionNameToDelegate.set(
  "TeamAdventureTypeNums",
  NumberTriggerValueTeamAdventureTypeNums
);
FunctionNameToDelegate.set(
  "CoopCombatSkillPerceptionBase",
  BoolTriggerValueCoopCombatSkillPerceptionBase
);
FunctionNameToDelegate.set(
  "CoopCombatSkillMonsterHitTeammate",
  BoolTriggerValueMonsterHitTeammate
);
FunctionNameToDelegate.set(
  "CoopCombatSkillMonsterBeInBigStiffness",
  BoolTriggerValueMonsterBeInBigStiffness
);
FunctionNameToDelegate.set(
  "CoopCombatSkillTeammateReleaseGP",
  BoolTriggerValueTeammateReleaseGP
);
FunctionNameToDelegate.set(
  "CoopCombatSkillTeammateReleaseFinalSkill",
  BoolTriggerValueTeammateReleaseFinalSkill
);
FunctionNameToDelegate.set("PetMasterAct", BoolTriggerValuePetMasterAct);
FunctionNameToDelegate.set(
  "PetMasterHitMonster",
  BoolTriggerValuePetMasterHitMonster
);
FunctionNameToDelegate.set(
  "RefreshBuffFromMe",
  ActionRefreshBuffFromMeDelegate
);
FunctionNameToDelegate.set("RemoveBuffFromMe", ActionRemoveBuffFromMeDelegate);
FunctionNameToDelegate.set("AAIGetDist", NumberValueAAIGetDist);
FunctionNameToDelegate.set("AAIPetFollow", ActionAAIPetFollow);
FunctionNameToDelegate.set(
  "AAIBowMoveArcShotMarkLocation",
  ActionAAIBowMoveArcShotMarkLocation
);
FunctionNameToDelegate.set(
  "AAIBowMoveAimPointLocation",
  ActionAAIBowMoveAimPointLocation
);
FunctionNameToDelegate.set(
  "GetBuffNumberCustomValue",
  NumberValueBuffCustomValueDelegate
);
FunctionNameToDelegate.set(
  "ApplyBuffWithCustomValue",
  ActionApplyBuffWithCustomValueDelegate
);
FunctionNameToDelegate.set("AddFireForce", ActionAddFireForceFX);
FunctionNameToDelegate.set(
  "QuadraticFunction",
  NumberValueQuadraticFunctionDelegate
);
FunctionNameToDelegate.set("CaptureNetRecommend", BoolValueCaptureNetRecommend);
FunctionNameToDelegate.set("StoneRecommend", BoolValueStoneRecommend);
FunctionNameToDelegate.set("ClutchClawRecommend", BoolValueClutchClawRecommend);
FunctionNameToDelegate.set(
  "ReinForcedBulletRecommend",
  BoolValueReinForcedBulletRecommend
);
FunctionNameToDelegate.set(
  "CheckRecommendTypeLevel",
  BoolValueCheckRecommendTypeLevel
);
FunctionNameToDelegate.set(
  "EventHealthReductionWithinAPeriodOfTime",
  EventHealthReductionWithinAPeriodOfTimeDelegate
);
FunctionNameToDelegate.set("Begin", EventBeginToSatisfyTheConditionDelegate);
FunctionNameToDelegate.set(
  "BuffUpMasterCharacter",
  ApplyBuffOnMasterCharacterTaskDelegate
);
FunctionNameToDelegate.set(
  "BowgunModifyAmmoRechargeSpeed",
  BowgunModifyAmmoRechargeSpeedTaskDelegate
);
FunctionNameToDelegate.set(
  "CombatResourceChangeModification",
  CombatResourceChangeModificationTaskDelegate
);
FunctionNameToDelegate.set(
  "CombatResourceConsumptionBuildUpOrRestoration",
  CombatResourceConsumptionBuildUpOrRestorationTickTask
);
FunctionNameToDelegate.set(
  "CombatResourceConsumptionBuildUpOrRestorationWithInterval",
  CombatResourceConsumptionBuildUpOrRestorationIntervalTask
);
FunctionNameToDelegate.set(
  "TemperatureOvercome",
  TemperatureOvercomeTaskDelegate
);
FunctionNameToDelegate.set(
  "BuildUpOrRestoreInTick",
  BuildUpOrRestoreInTickTaskDelegate
);
FunctionNameToDelegate.set("AttributeAddition", AttributeAdditionTaskDelegate);
FunctionNameToDelegate.set(
  "CanBeDeemedAsPostureDamageVulnerable",
  BoolValueMonsterCanBeDeemedAsPostureDamageVulnerableDelegate
);
FunctionNameToDelegate.set(
  "IncreaseMonsterToughnessTask",
  TmpIncreaseMonsterToughnessTaskDelegate
);
FunctionNameToDelegate.set(
  "CoopCombatPursuitSkillSwitch",
  CoopCombatPursuitSkillSwitchTaskDelegate
);
FunctionNameToDelegate.set(
  "DuyaoniaoSpecialDealDamage",
  DuyaoniaoSpecialShootTaskDelegate
);
FunctionNameToDelegate.set("PartyBuff", PartyBuffTaskDelegate);
FunctionNameToDelegate.set(
  "MonsterBrokenBodyPartNum",
  NumberValueMonsterBrokenBodyPartNumDelegate
);
FunctionNameToDelegate.set(
  "GetEMCounterAttackValue",
  NumberValueCounterAttackValueDelegate
);
FunctionNameToDelegate.set(
  "GetEMCounterAttackMaxValue",
  NumberValueCounterAttackMaxValueDelegate
);
FunctionNameToDelegate.set(
  "ConditionControlledBuff",
  ConditionControlledBuffTaskDelegate
);
FunctionNameToDelegate.set("ShadowCloneBuffs", ShadowCloneBuffsTaskDelegate);
FunctionNameToDelegate.set(
  "QuotaHitAction",
  ActionWithLimitationOnTheNumberOfTimesForEachCombinationOfAbilityInstanceAndHitTargetDelegate
);
FunctionNameToDelegate.set("PetMasterActConsume", PetMasterActConsumeDelegate);
FunctionNameToDelegate.set(
  "PetMasterHitMonsterConsume",
  PetMasterHitMonsterConsumeDelegate
);
FunctionNameToDelegate.set("PreAffinity", EventCommonForwarderPreAffinity);
FunctionNameToDelegate.set("PostAffinity", EventCommonForwarderPostAffinity);
FunctionNameToDelegate.set(
  "PreStatusEffect",
  EventCommonForwarderPreStatusEffect
);
FunctionNameToDelegate.set(
  "EveStatusEffect",
  EventCommonForwarderEveStatusEffect
);
FunctionNameToDelegate.set(
  "PlayerDefenseSuccessServer",
  EventCommonForwarderPlayerDefenseSuccessServer
);
FunctionNameToDelegate.set(
  "PlayerDefenseSuccess",
  EventCommonForwarderPlayerDefenseSuccess
);
FunctionNameToDelegate.set(
  "PlayerDefenseFailed",
  EventCommonForwarderPlayerDefenseFailed
);
FunctionNameToDelegate.set(
  "PostReceiveDamageAsAttacker",
  EventCommonForwarderPostReceiveDamageAsAttacker
);
FunctionNameToDelegate.set(
  "PreReceiveDamageAsAttacker",
  EventCommonForwarderPreReceiveDamageAsAttacker
);
FunctionNameToDelegate.set(
  "PreReceiveDamageAsVictim",
  EventCommonForwarderPreReceiveDamageAsVictim
);
FunctionNameToDelegate.set(
  "PostReceiveDamageAsVictim",
  EventCommonForwarderPostReceiveDamageAsVictim
);
FunctionNameToDelegate.set(
  "CounterAttackSuccess",
  EventCommonForwarderCounterAttackSuccess
);
FunctionNameToDelegate.set(
  "CounterAttackSuccessServer",
  EventCommonForwarderCounterAttackSuccessServer
);
FunctionNameToDelegate.set("ComboEnd", EventCommonForwarderComboEnd);
FunctionNameToDelegate.set(
  "HealingAsHealer",
  EventCommonForwarderHealingAsHealer
);
FunctionNameToDelegate.set(
  "HealingAsTarget",
  EventCommonForwarderHealingAsTarget
);
FunctionNameToDelegate.set(
  "PreBeginAbilityTag",
  EventCommonForwarderPreBeginAbilityTag
);
FunctionNameToDelegate.set(
  "BeginAbilityTag",
  EventCommonForwarderBeginAbilityTag
);
FunctionNameToDelegate.set("EndAbilityTag", EventCommonForwarderEndAbilityTag);
FunctionNameToDelegate.set(
  "FurinkazanAdvanced",
  EventCommonForwarderFurinkazanAdvanced
);
FunctionNameToDelegate.set("PreAttack", EventCommonForwarderPreAttack);
FunctionNameToDelegate.set(
  "MonsterEpicStiffness",
  EventMonsterEpicStiffnessChanged
);
FunctionNameToDelegate.set(
  "SystemSetAttribute",
  ActionSystemSetAttributeDelegate
);
FunctionNameToDelegate.set(
  "ModifyCharacterMovementSpeed",
  CharacterMovementSpeedModificationTaskDelegate
);
FunctionNameToDelegate.set(
  "EMModificationSightPerception",
  EMModificationSightPerceptionDelegate
);
FunctionNameToDelegate.set(
  "EMSetBreakPartbLock",
  EMSetBreakPartbLockTaskDelegate
);

FunctionNameToDelegate.set("AddModifier", AddModifierTaskDelegate);
FunctionNameToDelegate.set("ActorHasTags", BoolValueActorHasTagsDelegate);
FunctionNameToDelegate.set("LootDropOnAttack", ActionLootDropOnAttackDelegate);
FunctionNameToDelegate.set(
  "AtLeastOneSurroundingMonster",
  BoolValueAtLeastOneSurroundingMonster
);
FunctionNameToDelegate.set("CheckWeather", BoolValueCheckWeatherDelegate);
FunctionNameToDelegate.set(
  "CheckBrightMossAvilable",
  BoolValueCheckBrightMossAvilable
);
FunctionNameToDelegate.set(
  "CheckPuddlePodAvilable",
  BoolValueCheckPuddlePodAvilable
);
FunctionNameToDelegate.set(
  "EMTriggerStiffness",
  CustomActionEMTriggerStiffnessDelegate
);
FunctionNameToDelegate.set(
  "EMHitBySpecialAmmo",
  CustomActionEMHitBySpecialAmmoDelegate
);
FunctionNameToDelegate.set(
  "EMIsSpecialAmmoBuffStackFull",
  BoolValueEMIsSpecialAmmoBuffStackFullDelegate
);
FunctionNameToDelegate.set("GetAffinity", NumberValueGetAffinityDelegate);
FunctionNameToDelegate.set(
  "CheckEMCreatureStateByActor",
  BoolValueCheckEMCreatureStateByActorDelegate
);
FunctionNameToDelegate.set(
  "AAIGetTimeSinceLastUse",
  NumberTriggerValueAAIGetTimeSinceLastUseDelegate
);
FunctionNameToDelegate.set(
  "AAIGetAngle",
  NumberTriggerValueAAIGetAngleDelegate
);
FunctionNameToDelegate.set("AAIAbilityRandom", NumberValueAAIAbilityRandom);
FunctionNameToDelegate.set(
  "ScalingByPlayerSkillGroupLevel",
  NumberValueAttributeScalingByPlayerSkillGroupLevel
);
FunctionNameToDelegate.set(
  "ScalingByCombatPetAscensionPhase",
  NumberValueAttributeScalingByCombatPetAscensionPhase
);
FunctionNameToDelegate.set(
  "BuildUpRestoreOrConsumeCombatResource",
  ActionConsumeBuildUpOrRestoreCombatResource
);
FunctionNameToDelegate.set(
  "WAProjectileUsable",
  BoolValueWAProjectileUsableDelegate
);
FunctionNameToDelegate.set(
  "CheckCurrentWAID",
  BoolValueCheckCurrentWAIDDelegate
);
FunctionNameToDelegate.set(
  "GetItsStrategyActionItemNum",
  NumberValueGetItsStrategyActionItemNum
);
FunctionNameToDelegate.set(
  "GetItsStrategyActionUsedCount",
  NumberValueGetItsStrategyActionUsedCounts
);
FunctionNameToDelegate.set(
  "GetItsStrategyActionTeamUsedCount",
  NumberValueGetItsStrategyActionTeamUsedCounts
);
FunctionNameToDelegate.set(
  "OnlyAllowAITokenToDo",
  BoolTriggerValueTryGetTeamActionTokenDelegate
);
FunctionNameToDelegate.set(
  "PauseStaminaRegeneration",
  PauseStaminaRegenerationTaskDelegate
);
FunctionNameToDelegate.set(
  "SetAbilityBoolCustomValue",
  ActionSetAbilityBoolCustomValueDelegate
);
FunctionNameToDelegate.set(
  "NotifyOfSkillEffectActivated",
  NotifyOfSkillEffectActivatedActionDelegate
);
FunctionNameToDelegate.set(
  "SetAbilityNumberCustomValue",
  ActionSetAbilityNumberCustomValueDelegate
);
FunctionNameToDelegate.set(
  "ButtonStrengthBySkillGroup",
  ButtonStrengthEventTaskDelegate
);
FunctionNameToDelegate.set("DynamicDuration", DynamicDurationTaskDelegate);
FunctionNameToDelegate.set(
  "InflictPoisonStatusEffectOnMonster",
  PoisonStatusEffectInflictionOnMonsterAction
);
FunctionNameToDelegate.set(
  "InflictParalysisStatusEffectOnMonster",
  ParalysisStatusEffectInflictionOnMonsterAction
);
FunctionNameToDelegate.set(
  "InflictSleepStatusEffectOnMonster",
  SleepStatusEffectInflictionOnMonsterAction
);
FunctionNameToDelegate.set(
  "InflictStunStatusEffectOnMonster",
  StunStatusEffectInflictionOnMonsterAction
);
FunctionNameToDelegate.set("GetFubenTime", FubenTimeNumbleDelegate);
FunctionNameToDelegate.set(
  "GetSummonCustomValue",
  SummonCustomValueNumberDelegate
);
FunctionNameToDelegate.set("HaveItem", HaveItemBoolValueDelegate);
FunctionNameToDelegate.set("CheckIsInBattle", BoolValueCheckIsInBattleDelegate);
FunctionNameToDelegate.set("CheckDefenseSuccess", BoolValueCheckDefenseSuccess);
FunctionNameToDelegate.set(
  "CheckPrecisionDefense",
  BoolValueCheckPrecisionDefense
);
FunctionNameToDelegate.set(
  "ComboAbilityTriggerDamage",
  EventComboAbilityTriggerDamageDelegate
);
FunctionNameToDelegate.set(
  "GroupSkillFirstTriggerDamage",
  EventGroupSkillFirstTriggerDamageDelegate
);
FunctionNameToDelegate.set(
  "CheckEMIsTargetMonsterByArchetypeID",
  BoolValueCheckEMIsTargetMonsterByArchetypeIDDelegate
);
FunctionNameToDelegate.set(
  "CheckIsTargetEnvMonsterByRowName",
  BoolValueCheckIsTargetEnvMonsterByRowNameDelegate
);
FunctionNameToDelegate.set(
  "GetHitLockPointPart",
  NumberTriggerValueGetHitLockPointPart
);
FunctionNameToDelegate.set("JoyStickAngle", NumberTriggerValueJoyStickAngle);
FunctionNameToDelegate.set(
  "TriggerEventRepeatedWithinDuration",
  EventTriggerRepeatedWithinDurationDelegate
);
FunctionNameToDelegate.set(
  "ModifyAbilityRateInAbilityGroup",
  ActionModifyAbilityPlayRateInAbilityGroupDelegate
);
FunctionNameToDelegate.set(
  "ChangeAttributeByMultiplier",
  ChangeAttributeByMultiplierTaskDelegate
);
FunctionNameToDelegate.set(
  "SetFuBenSpecialPart",
  SetFuBenSpecialPartTaskDelegate
);
FunctionNameToDelegate.set(
  "StatusEffectDispelled",
  EventCharacterStatusEffectDispelledDelegate
);
FunctionNameToDelegate.set(
  "PreCharacterDeath",
  EventCharacterDeathClaimDelegate
);
FunctionNameToDelegate.set(
  "ReviveCharacterDeath",
  ActionReviveCharacterDeathDelegate
);
FunctionNameToDelegate.set("CharacterUpdated", EventCharacterUpdatedDelegate);
FunctionNameToDelegate.set("IsInFuben", BoolTriggerValueIsInFubenDelegate);
FunctionNameToDelegate.set(
  "CheckContextAbilityGroup",
  BoolTriggerValueCheckContextAbilityGroupDelegate
);
FunctionNameToDelegate.set("MeshGlow", MeshGlowExTaskDelegate);
FunctionNameToDelegate.set(
  "IsItemTriggeredByGuide",
  BoolValueCanItemRecommendByGuideDelegate
);
FunctionNameToDelegate.set(
  "CheckIsQuestRunning",
  BoolTriggerValueCheckIsQuestRunningDelegate
);
FunctionNameToDelegate.set(
  "CheckIsQuestFinished",
  BoolTriggerValueCheckIsQuestFinishedDelegate
);
FunctionNameToDelegate.set("GetTargetActor", ActorValueGetTargetActorDelegate);
FunctionNameToDelegate.set(
  "CheckEMAIStateByActor",
  BoolValueCheckEMAIStateByActorDelegate
);
FunctionNameToDelegate.set(
  "CheckEMStiffnessTypeByActor",
  BoolValueCheckEMStiffnessTypeByActorDelegate
);
FunctionNameToDelegate.set(
  "CheckDistanceBetweenActors",
  BoolTriggerValueCheckDistanceBetweenActorsDelegate
);
FunctionNameToDelegate.set(
  "CheckEMIsBossMonster",
  BoolValueCheckEMIsBossMonsterDelegate
);
FunctionNameToDelegate.set(
  "CheckEMIsInTurfWar",
  BoolValueCheckEMIsInTurfWarDelegate
);
FunctionNameToDelegate.set(
  "CheckEMAbilityHasTagByActor",
  BoolValueCheckEMAbilityHasTagByActorDelegate
);
FunctionNameToDelegate.set(
  "CheckFieldConfigID",
  BoolValueCheckFieldConfigIDDelegate
);
FunctionNameToDelegate.set(
  "AdventurerHealthLock",
  AdventurerHealthLockTaskDelegate
);

// 下面这行不能删，用于自动生成代码
// Auto Gen Atom Delegate Definition
FunctionNameToDelegate.set(
  "CheckCurrentFubenFinishTypeIs",
  CheckCurrentFubenFinishTypeIs_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckBuffSourceIsSelf",
  CheckBuffSourceIsSelf_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckWAEndMethodOnlySuccessOrFailed",
  CheckWAEndMethodOnlySuccessOrFailed_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckWAEndMethod",
  CheckWAEndMethod_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckEntryLevel",
  CheckEntryLevel_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckInteractActionType",
  CheckInteractActionType_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckBagCapacityIsFull",
  CheckBagCapacityIsFull_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckBagCapacityNumChangeID",
  CheckBagCapacityNumChangeID_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckBuildingCountChangedID",
  CheckBuildingCountChangedID_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckBuildingRemainCountLessThan",
  CheckBuildingRemainCountLessThan_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckStudyNodeCost",
  CheckStudyNodeCost_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckStudyNodeLevel",
  CheckStudyNodeLevel_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "StudyTreeTriggerTips",
  StudyTreeTriggerTips_ActionDelegate
);
FunctionNameToDelegate.set(
  "CheckMovementMode",
  CheckMovementMode_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckMonsterBodyBrokenPartName",
  CheckMonsterBodyBrokenPartName_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckActorWeaponType",
  CheckActorWeaponType_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckCurrentAbility",
  CheckCurrentAbility_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "AddSubTriggerList",
  AddSubTriggerList_ActionDelegate
);
FunctionNameToDelegate.set("CheckInputKey", CheckInputKey_BoolValueDelegate);
FunctionNameToDelegate.set("CheckBuffID", CheckBuffID_BoolValueDelegate);
FunctionNameToDelegate.set(
  "AttSkillDefaultSuccAction",
  AttSkillDefaultSuccAction_ActionDelegate
);
FunctionNameToDelegate.set("AddSubTrigger", AddSubTrigger_ActionDelegate);
FunctionNameToDelegate.set(
  "CheckAttackerAdventure",
  BoolValueCheckAttackerAdventureDelegate
);
FunctionNameToDelegate.set(
  "CheckAttackerHitTargetBodyPart",
  BoolValueCheckAttackerHitTargetBodyPartDelegate
);
FunctionNameToDelegate.set(
  "HandleDefaultSuccAction",
  HandleDefaultSuccActionDelegate
);
FunctionNameToDelegate.set(
  "SendTutorialTipsUnlockEventAction",
  SendTutorialTipsUnlockEventActionDelegate
);
FunctionNameToDelegate.set(
  "CheckConditionTickAction",
  CheckConditionTickActionDelegate
);
FunctionNameToDelegate.set(
  "CheckAddedSidetalkID",
  CheckAddedSidetalkID_BoolValueDelegate
);
FunctionNameToDelegate.set(
  "CheckTutorialIsUnlock",
  CheckTutorialIsUnlock_BoolValueDelegate
);

// external add for editor 
FunctionNameToDelegate.set(
  "NumberValueConst",
  NumberValueConstDelegate
);
FunctionNameToDelegate.set(
  "NumberValueUnaryOperator",
  NumberValueUnaryOperatorDelegate
);
FunctionNameToDelegate.set(
  "BoolValueNot",
  BoolValueNotDelegate
);
FunctionNameToDelegate.set(
  "NumberValueBinaryOperator",
  NumberValueBinaryOperatorDelegate
);
FunctionNameToDelegate.set(
  "BoolValueBinaryOperatorOnBool",
  BoolValueBinaryOperatorOnBoolDelegate
);
FunctionNameToDelegate.set(
  "BoolValueBinaryOperatorOnNumber",
  BoolValueBinaryOperatorOnNumberDelegate
);
FunctionNameToDelegate.set(
  "BoolValueConst",
  BoolValueConstDelegate
);

class FAtomExpressionParser {
  public static main(expr: string): DelegateBase | undefined {
    try {
      return this.Analysis(expr);
    } catch (e) {
      console.error(
        `error caught when parsing [${expr}](possibly ${CurrentAbilityConfigID}):\n\n${e.stack}`
      ); // eslint-disable-line prettier/prettier
      return undefined;
    }
  }

  private static Analysis(expr: string): DelegateBase | undefined {
    console.log(`[AtomSystem] expr [${expr}]`);

    for (const k of ValidOperatorString) expr = expr.split(k).join(` ${k} `);
    expr = expr.split('"').join(' " ');

    const PossibleTokens = expr
      .split(" ")
      .filter((v: string) => v.trim().length > 0);
    PossibleTokens.forEach(
      (v: string, i: number, arr: Array<string>) => (arr[i] = v.trim())
    );

    const tokens = new Array<string>();
    for (let i = 0; i < PossibleTokens.length; ++i) {
      if (i !== PossibleTokens.length - 1) {
        const combined = PossibleTokens[i] + PossibleTokens[i + 1];
        if (ValidOperatorString.has(combined)) {
          tokens.push(combined);
          i += 1;
          continue;
        }

        if (PossibleTokens[i] === '"') {
          let j = i + 1;
          for (; j !== PossibleTokens.length; ++j)
            if (PossibleTokens[j] === '"') break;
          if (j === PossibleTokens.length) {
            console.warn(
              `[AtomSystem] double quotes not match: ${PossibleTokens.join(
                ", "
              )}`
            );
            return undefined;
          }
          tokens.push(PossibleTokens.slice(i, j + 1).join(""));
          i = j;
          continue;
        }
      }

      tokens.push(PossibleTokens[i]);
    }
    console.log(`[AtomSystem] tokens ${PossibleTokens.join(", ")}`);

    const operators = new Array<string>();
    const ReversePolishNotation = new Array<string>();
    for (let i = 0; i !== tokens.length; ++i) {
      const CurrentToken = tokens[i];

      switch (CurrentToken) {
        case ")":
          while (operators.length && operators[operators.length - 1] !== "(")
            ReversePolishNotation.push(operators.pop());
          if (operators[operators.length - 1] !== "(") {
            console.warn(
              `[AtomSystem] left and right parentheses mismatched: ${expr}`
            );
            return undefined;
          }
          operators.pop();

          if (
            operators.length &&
            FunctionNameToDelegate.has(operators[operators.length - 1])
          )
            ReversePolishNotation.push(operators.pop());
          break;

        case "(":
        case "!":
          operators.push(CurrentToken);
          break;

        case "-":
        case "+":
        case "*":
        case "/":
        case "%":
        case "&&":
        case "||":
        case ">":
        case ">=":
        case "<":
        case "<=":
        case "==":
        case "!=":
          if (
            CurrentToken === "-" &&
            (i === 0 ||
              MinusAfterTheseTokensShouldBeDeemedAsUnary.has(tokens[i - 1]))
          ) {
            operators.push("_");
            break;
          }

          while (
            operators.length &&
            HasHigherOrEqualPrecedenceThan(
              operators[operators.length - 1],
              CurrentToken
            )
          )
            ReversePolishNotation.push(operators.pop());
          operators.push(CurrentToken);
          break;

        case ",":
          while (
            operators.length &&
            HasHigherOrEqualPrecedenceThan(
              operators[operators.length - 1],
              CurrentToken
            )
          )
            ReversePolishNotation.push(operators.pop());
          break;

        default:
          if (FunctionNameToDelegate.has(CurrentToken)) {
            // function
            operators.push(CurrentToken);
            ReversePolishNotation.push("(");
          } else {
            // operands
            ReversePolishNotation.push(CurrentToken);
          }
          break;
      }
    }

    for (; operators.length; ) ReversePolishNotation.push(operators.pop());
    console.log(
      `[AtomSystem] reverse polish notation: ${ReversePolishNotation.join(
        ", "
      )}`
    );

    const stack = new Array<DelegateBase | string>();
    let PossibleNumber: string | number | boolean;
    let lhs: DelegateBase | string;
    let rhs: DelegateBase | string;
    let Fn: DelegateConstructorType;
    for (const CurrentToken of ReversePolishNotation) {
      switch (CurrentToken) {
        case "_":
          lhs = stack.pop();
          stack.push(
            new NumberValueUnaryOperatorDelegate(lhs as NumberValueDelegate)
          );
          break;

        case "!":
          lhs = stack.pop();
          stack.push(new BoolValueNotDelegate(lhs as BoolValueDelegate));
          break;

        case "+":
        case "-":
        case "*":
        case "/":
        case "%":
          rhs = stack.pop();
          lhs = stack.pop();
          stack.push(
            new NumberValueBinaryOperatorDelegate(
              lhs as NumberValueDelegate,
              OperatorStringToOperatorEnumInAtomSystem.get(CurrentToken),
              rhs as NumberValueDelegate
            )
          );
          break;

        case "&&":
        case "||":
          rhs = stack.pop();
          lhs = stack.pop();
          stack.push(
            new BoolValueBinaryOperatorOnBoolDelegate(
              lhs as BoolValueDelegate,
              OperatorStringToOperatorEnumInAtomSystem.get(CurrentToken),
              rhs as BoolValueDelegate
            )
          );
          break;

        case ">":
        case ">=":
        case "<":
        case "<=":
        case "==":
        case "!=":
          rhs = stack.pop();
          lhs = stack.pop();
          stack.push(
            new BoolValueBinaryOperatorOnNumberDelegate(
              lhs as NumberValueDelegate,
              OperatorStringToOperatorEnumInAtomSystem.get(CurrentToken),
              rhs as NumberValueDelegate
            )
          );
          break;

        case "(":
          stack.push("(");
          break;

        default:
          if ((Fn = FunctionNameToDelegate.get(CurrentToken))) {
            /**
             * A Function object's length property indicates how many arguments the function expects, i.e. the number of formal parameters.
             * This number excludes the rest parameter and only includes parameters before the first one with a default value.
             */
            const ParamArr = [];
            let ArgCnt = 0;
            while (stack.length && stack[stack.length - 1] !== "(") {
              ParamArr.push(stack.pop());
              ++ArgCnt;
            }
            stack.pop(); // for '('

            if (ArgCnt < Fn.length) {
              console.warn(
                `[AtomSystem] function [${CurrentToken}] param num not fulfilled [${ArgCnt} / ${
                  Fn.length
                }], parsing aborted: ${ReversePolishNotation.join(", ")}`
              ); // eslint-disable-line
              return undefined;
            }

            if (ArgCnt > Fn.length)
              console.log(
                `[AtomSystem] function [${CurrentToken}] [${ArgCnt} / ${Fn.length}] arg(s) received`
              ); // eslint-disable-line

            const OrderedParams = ParamArr.reverse();
            const CreatedObject = Newable(Fn)
              ? new Fn(...OrderedParams)
              : Fn(...OrderedParams);
            // AddOuterLinksToObject(CreatedObject);
            stack.push(CreatedObject);
          } else {
            PossibleNumber = this.ParseSingleToken(CurrentToken);
            if (typeof PossibleNumber === "string") {
              if (/^\{[a-zA-Z0-9_$]*\}$/.test(PossibleNumber)) {
                // 新规则，用大括号包裹的变量读BuffConst表
                stack.push(
                  new NumberValueConstDelegate(0, PossibleNumber.slice(1, -1))
                );
              } else {
                stack.push(PossibleNumber);
              }
            } else if (typeof PossibleNumber === "number")
              stack.push(new NumberValueConstDelegate(PossibleNumber));
            else if (typeof PossibleNumber == "boolean")
              stack.push(new BoolValueConstDelegate(PossibleNumber));
          }
          break;
      }
    }

    if (stack.length > 1)
      console.warn(
        `\
[AtomSystem] expression parsing resulted in MORE THAN ONE elements:\
expr: ${expr} \
result stack: ${stack.join(", ")}\
`
      ); // todo: toString()s of delegates
    return stack[0] as DelegateBase;
  }

  private static ParseSingleToken(str: string): string | number | boolean {
    // eslint-disable-next-line no-useless-escape
    if (/^(\-|\+)?([0-9]+(\.[0-9]+)?|Infinity)$/.test(str)) {
      const PossibleNumber = Number.parseFloat(str);
      if (!Number.isNaN(PossibleNumber)) return PossibleNumber;
    }

    const bIsTrue = ExpressionIsLiteralTrue(str);
    const bIsFalse = ExpressionIsLiteralFalse(str);
    if (bIsTrue || bIsFalse) return bIsTrue;

    if (str.startsWith("'") && str.endsWith("'"))
      return str.substring(1, str.length - 1);
    if (str.startsWith('"') && str.endsWith('"'))
      return str.substring(1, str.length - 1);

    return str;
  }
}

const LiteralTrue: readonly string[] = ["true", "True", "TRUE"];
const LiteralFalse: readonly string[] = ["false", "False", "FALSE"];

function ExpressionIsLiteralTrue(expr: any): boolean {
  return LiteralTrue.includes(expr);
}

function ExpressionIsLiteralFalse(expr: any): boolean {
  return LiteralFalse.includes(expr);
}

export {
  ActionDelegate,
  ActionNOPDelegate,
  ActionTakeActionsExDelegate,
  ActionTakeConditionalActionExDelegate,
  ActorValueDelegate,
  BoolValueDelegate,
  DelegateBase,
  FAtomExpressionParser,
  NumberValueDelegate,
};
