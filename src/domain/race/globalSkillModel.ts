import type { GlobalSkill, GlobalSkillConditionGroup } from "../../data/skills";
import type { GroundCondition, RacePhase, RaceSeason, TrackSegment, Weather } from "./types";
import type { DistanceCategory, StatBlock, Strategy, Surface } from "../uma/types";

type ComparisonOperator = "==" | "!=" | ">=" | "<=" | ">" | "<";

export type GlobalSkillContext = {
  second: number;
  elapsedMs: number;
  previousDistanceMeters: number;
  distanceMeters: number;
  activatedSkillCount: number;
  activatedSkillCountStart?: number;
  activatedSkillCountMiddle?: number;
  activatedSkillCountEndAfter?: number;
  activatedSkillCountLaterHalf?: number;
  activatedHealSkillCount?: number;
  temptationOpponentCountBehind?: number;
  temptationOpponentCountInfront?: number;
  rushedFrontOpponentCount?: number;
  rushedPaceOpponentCount?: number;
  rushedLateOpponentCount?: number;
  rushedEndOpponentCount?: number;
  phase: RacePhase;
  segment?: TrackSegment;
  order: number;
  runnerCount: number;
  orderRate: number;
  distanceRate: number;
  distanceDiffTop?: number;
  distanceDiffRate?: number;
  remainDistance: number;
  hpPercent: number;
  strategy: Strategy;
  weather: Weather;
  season?: RaceSeason;
  popularityRank?: number;
  gateBlock?: number;
  runningStyleEqualPopularityOne?: boolean;
  sameSkillHorseCount?: number;
  temptationCount?: number;
  competeFightCount?: number;
  groundCondition: GroundCondition;
  surface: Surface;
  distanceCategory: DistanceCategory;
  isBasisDistance?: boolean;
  isFinalCornerLaterHalf?: boolean;
  hasEnteredFinalCorner?: boolean;
  isBadStart?: boolean;
  isLastStraight?: boolean;
  isBehindIn?: boolean;
  isSurrounded?: boolean;
  isTemptation?: boolean;
  isActivateAnySkill?: boolean;
  isActivateHealSkill?: boolean;
  isLastStraightSegment?: boolean;
  rotation: "clockwise" | "counterclockwise" | "straight";
  trackId?: number;
  laneType: number;
  isMoveLane: 0 | 1 | 2;
  changeOrder: number;
  changeOrderUpMiddle?: number;
  changeOrderUpEndAfter?: number;
  changeOrderUpFinalCornerAfter?: number;
  overtakeTargetTime?: number;
  overtakeTargetNoOrderUpTime?: number;
  runningStyleCountFrontOthers?: number;
  runningStyleCountPaceOthers?: number;
  runningStyleCountLateOthers?: number;
  runningStyleCountEndOthers?: number;
  runningStyleCountSame?: number;
  runningStyleCountSameRate?: number;
  orderRateIn20Continue?: boolean;
  orderRateIn50Continue?: boolean;
  orderRateIn80Continue?: boolean;
  orderRateOut40Continue?: boolean;
  orderRateOut50Continue?: boolean;
  orderRateOut70Continue?: boolean;
  isOvertake: boolean;
  bashinDiffInfront: number | null;
  bashinDiffBehind: number | null;
  nearCount: number;
  infrontNearLaneTime: number;
  behindNearLaneTime: number;
  behindNearLaneTimeSet1: number;
  blockedFront: boolean;
  blockedFrontSeconds: number;
  blockedSideSeconds: number;
  skillRandomState?: SkillRandomState;
};

export type RandomSegmentTarget = {
  index?: number;
  segmentStartMeters: number;
  segmentEndMeters: number;
  targetMeters: number;
};

export type SkillRandomState = {
  randomLotRoll?: number;
  phaseRandomTargets?: Partial<Record<number, number>>;
  phaseFirstHalfRandomTargets?: Partial<Record<number, number>>;
  phaseLaterHalfRandomTargets?: Partial<Record<number, number>>;
  distanceRateAfterRandomTargets?: Partial<Record<number, number>>;
  straightRandom?: RandomSegmentTarget;
  allCornerRandom?: RandomSegmentTarget;
  cornerRandom?: RandomSegmentTarget;
  lastStraightRandom?: RandomSegmentTarget;
  finalCornerRandom?: RandomSegmentTarget;
  upSlopeRandom?: RandomSegmentTarget;
  downSlopeRandom?: RandomSegmentTarget;
};

export type ResolvedSkillEffects = {
  speed: number;
  currentSpeed: number;
  naturalDecelerationCurrentSpeed: number;
  forcedRareSkillCount: number;
  acceleration: number;
  navigation: number;
  pressure: number;
  startDelayMultiplier: number;
  fixedStartDelaySeconds?: number;
  rushProbabilityModifier: number;
  staminaRecoveryRatio: number;
  opponentStaminaDrainRatio: number;
  stats: Partial<StatBlock>;
};

export type ResolvedGlobalSkill = {
  durationSeconds: number;
  effects: ResolvedSkillEffects;
  conditionSummary: string;
};

export type GlobalSkillModelingReport = {
  modeled: boolean;
  unsupportedConditionTokens: string[];
  unsupportedEffectTypes: number[];
};

const supportedEffectTypes = new Set([1, 2, 3, 4, 5, 9, 10, 14, 21, 22, 27, 28, 29, 31, 32, 37]);
const supportedTokens = new Set([
  "always",
  "accumulatetime",
  "activate_count_all",
  "activate_count_end_after",
  "activate_count_heal",
  "activate_count_later_half",
  "activate_count_middle",
  "activate_count_start",
  "temptation_opponent_count_behind",
  "temptation_opponent_count_infront",
  "running_style_temptation_opponent_count_nige",
  "running_style_temptation_opponent_count_senko",
  "running_style_temptation_opponent_count_sashi",
  "running_style_temptation_opponent_count_oikomi",
  "all_corner_random",
  "bashin_diff_behind",
  "bashin_diff_infront",
  "blocked_front",
  "blocked_front_continuetime",
  "blocked_side_continuetime",
  "change_order_onetime",
  "change_order_up_end_after",
  "change_order_up_finalcorner_after",
  "change_order_up_middle",
  "corner",
  "corner_random",
  "compete_fight_count",
  "distance_rate",
  "distance_diff_rate",
  "distance_diff_top",
  "distance_diff_top_float",
  "distance_rate_after_random",
  "distance_type",
  "down_slope_random",
  "ground_condition",
  "ground_type",
  "hp_per",
  "infront_near_lane_time",
  "behind_near_lane_time",
  "behind_near_lane_time_set1",
  "is_finalcorner",
  "is_finalcorner_laterhalf",
  "is_finalcorner_random",
  "is_lastspurt",
  "is_last_straight",
  "is_last_straight_onetime",
  "is_basis_distance",
  "is_badstart",
  "is_activate_any_skill",
  "is_activate_heal_skill",
  "is_behind_in",
  "is_surrounded",
  "is_temptation",
  "is_move_lane",
  "is_overtake",
  "last_straight_random",
  "lane_type",
  "near_count",
  "order",
  "order_rate",
  "order_rate_in20_continue",
  "order_rate_in50_continue",
  "order_rate_in80_continue",
  "order_rate_out40_continue",
  "order_rate_out50_continue",
  "order_rate_out70_continue",
  "overtake_target_no_order_up_time",
  "overtake_target_time",
  "phase",
  "phase_laterhalf_random",
  "phase_firsthalf_random",
  "phase_random",
  "popularity",
  "post_number",
  "random_lot",
  "remain_distance",
  "rotation",
  "running_style",
  "running_style_count_nige_otherself",
  "running_style_count_oikomi_otherself",
  "running_style_count_same",
  "running_style_count_same_rate",
  "running_style_count_sashi_otherself",
  "running_style_count_senko_otherself",
  "running_style_equal_popularity_one",
  "same_skill_horse_count",
  "season",
  "slope",
  "straight_random",
  "track_id",
  "temptation_count",
  "up_slope_random",
  "weather",
]);

const strategyMap: Record<Strategy, number> = {
  front: 1,
  pace: 2,
  late: 3,
  end: 4,
};

const distanceTypeMap: Record<DistanceCategory, number> = {
  sprint: 1,
  mile: 2,
  medium: 3,
  long: 4,
};

const weatherMap: Record<Weather, number> = {
  sunny: 1,
  cloudy: 2,
  rainy: 3,
  snowy: 4,
};

const groundConditionMap: Record<GroundCondition, number> = {
  firm: 1,
  good: 2,
  soft: 3,
  heavy: 4,
};

const seasonMap: Record<RaceSeason, number> = {
  spring: 1,
  summer: 2,
  fall: 3,
  winter: 4,
  cherryBlossom: 5,
};

const surfaceMap: Record<Surface, number> = {
  turf: 1,
  dirt: 2,
};

const rotationMap = {
  straight: 0,
  clockwise: 1,
  counterclockwise: 2,
} as const;

const phaseMap: Record<RacePhase, number> = {
  early: 0,
  middle: 1,
  late: 2,
  lastSpurt: 3,
};

function parseToken(token: string) {
  const match = token.match(/^([a-z0-9_]+)(==|!=|>=|<=|>|<)(-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  return {
    field: match[1],
    operator: match[2] as ComparisonOperator,
    value: Number(match[3]),
  };
}

function compareNumber(field: string, actual: number, operator: ComparisonOperator, expected: number) {
  const tolerance = field === "remain_distance" ? 20 : field === "distance_rate" ? 3 : 0.0001;

  switch (operator) {
    case "==":
      return Math.abs(actual - expected) <= tolerance;
    case "!=":
      return Math.abs(actual - expected) > tolerance;
    case ">=":
      return actual >= expected - tolerance;
    case "<=":
      return actual <= expected + tolerance;
    case ">":
      return actual > expected + tolerance;
    case "<":
      return actual < expected - tolerance;
    default:
      return false;
  }
}

function evaluateField(field: string, operator: ComparisonOperator, value: number, context: GlobalSkillContext) {
  switch (field) {
    case "always":
      return compareNumber(field, 1, operator, value);
    case "accumulatetime":
      return compareNumber(field, context.elapsedMs, operator, value);
    case "activate_count_all":
      return compareNumber(field, context.activatedSkillCount, operator, value);
    case "activate_count_end_after":
      return compareNumber(field, context.activatedSkillCountEndAfter ?? 0, operator, value);
    case "activate_count_heal":
      return compareNumber(field, context.activatedHealSkillCount ?? 0, operator, value);
    case "activate_count_later_half":
      return compareNumber(field, context.activatedSkillCountLaterHalf ?? 0, operator, value);
    case "activate_count_middle":
      return compareNumber(field, context.activatedSkillCountMiddle ?? 0, operator, value);
    case "activate_count_start":
      return compareNumber(field, context.activatedSkillCountStart ?? 0, operator, value);
    case "temptation_opponent_count_behind":
      return compareNumber(field, context.temptationOpponentCountBehind ?? 0, operator, value);
    case "temptation_opponent_count_infront":
      return compareNumber(field, context.temptationOpponentCountInfront ?? 0, operator, value);
    case "running_style_temptation_opponent_count_nige":
      return compareNumber(field, context.rushedFrontOpponentCount ?? 0, operator, value);
    case "running_style_temptation_opponent_count_senko":
      return compareNumber(field, context.rushedPaceOpponentCount ?? 0, operator, value);
    case "running_style_temptation_opponent_count_sashi":
      return compareNumber(field, context.rushedLateOpponentCount ?? 0, operator, value);
    case "running_style_temptation_opponent_count_oikomi":
      return compareNumber(field, context.rushedEndOpponentCount ?? 0, operator, value);
    case "all_corner_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.allCornerRandom, context));
    case "corner_random": {
      const active = isSegmentTargetActive(context.skillRandomState?.cornerRandom, context);
      const cornerIndex = context.skillRandomState?.cornerRandom?.index;
      return active && cornerIndex !== undefined && compareNumber(field, cornerIndex, operator, value);
    }
    case "compete_fight_count":
      return compareNumber(field, context.competeFightCount ?? 0, operator, value);
    case "bashin_diff_behind":
      return context.bashinDiffBehind !== null && compareNumber(field, context.bashinDiffBehind, operator, value);
    case "bashin_diff_infront":
      return context.bashinDiffInfront !== null && compareNumber(field, context.bashinDiffInfront, operator, value);
    case "blocked_front":
      return compareNumber(field, context.blockedFront ? 1 : 0, operator, value);
    case "blocked_front_continuetime":
      return compareNumber(field, context.blockedFrontSeconds, operator, value);
    case "blocked_side_continuetime":
      return compareNumber(field, context.blockedSideSeconds, operator, value);
    case "change_order_onetime":
      return compareNumber(field, context.changeOrder, operator, value);
    case "change_order_up_end_after":
      return compareNumber(field, context.changeOrderUpEndAfter ?? 0, operator, value);
    case "change_order_up_finalcorner_after":
      return compareNumber(field, context.changeOrderUpFinalCornerAfter ?? 0, operator, value);
    case "change_order_up_middle":
      return compareNumber(field, context.changeOrderUpMiddle ?? 0, operator, value);
    case "corner":
      return compareNumber(field, context.segment?.kind === "corner" ? 1 : 0, operator, value);
    case "distance_rate":
      return compareNumber(field, context.distanceRate, operator, value);
    case "distance_diff_rate":
      return compareNumber(field, context.distanceDiffRate ?? 0, operator, value);
    case "distance_diff_top":
      return compareNumber(field, Math.floor(context.distanceDiffTop ?? 0), operator, value);
    case "distance_diff_top_float":
      return compareNumber(field, Math.round((context.distanceDiffTop ?? 0) * 10), operator, value);
    case "distance_rate_after_random": {
      const target = context.skillRandomState?.distanceRateAfterRandomTargets?.[value];
      return compareRandomDistanceTarget(operator, value, target, context);
    }
    case "distance_type":
      return compareNumber(field, distanceTypeMap[context.distanceCategory], operator, value);
    case "ground_condition":
      return compareNumber(field, groundConditionMap[context.groundCondition], operator, value);
    case "ground_type":
      return compareNumber(field, surfaceMap[context.surface], operator, value);
    case "hp_per":
      return compareNumber(field, context.hpPercent, operator, value);
    case "infront_near_lane_time":
      return compareNumber(field, context.infrontNearLaneTime, operator, value);
    case "behind_near_lane_time":
      return compareNumber(field, context.behindNearLaneTime, operator, value);
    case "behind_near_lane_time_set1":
      return compareNumber(field, context.behindNearLaneTimeSet1, operator, value);
    case "is_finalcorner":
      return compareNumber(
        field,
        context.hasEnteredFinalCorner || context.segment?.tags?.includes("finalCorner") ? 1 : 0,
        operator,
        value,
      );
    case "is_finalcorner_laterhalf":
      return compareNumber(field, context.isFinalCornerLaterHalf ? 1 : 0, operator, value);
    case "is_finalcorner_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.finalCornerRandom, context));
    case "is_lastspurt":
      return compareNumber(field, context.phase === "lastSpurt" ? 1 : 0, operator, value);
    case "is_last_straight":
      return compareNumber(field, context.isLastStraightSegment ? 1 : 0, operator, value);
    case "is_last_straight_onetime":
      return compareNumber(field, context.isLastStraight ? 1 : 0, operator, value);
    case "is_basis_distance":
      return compareNumber(field, context.isBasisDistance ? 1 : 0, operator, value);
    case "is_badstart":
      return compareNumber(field, context.isBadStart ? 1 : 0, operator, value);
    case "is_activate_any_skill":
      return compareNumber(field, context.isActivateAnySkill ? 1 : 0, operator, value);
    case "is_activate_heal_skill":
      return compareNumber(field, context.isActivateHealSkill ? 1 : 0, operator, value);
    case "is_behind_in":
      return compareNumber(field, context.isBehindIn ? 1 : 0, operator, value);
    case "is_surrounded":
      return compareNumber(field, context.isSurrounded ? 1 : 0, operator, value);
    case "is_temptation":
      return compareNumber(field, context.isTemptation ? 1 : 0, operator, value);
    case "is_move_lane":
      return compareNumber(field, context.isMoveLane, operator, value);
    case "is_overtake":
      return compareNumber(field, context.isOvertake ? 1 : 0, operator, value);
    case "last_straight_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.lastStraightRandom, context));
    case "near_count":
      return compareNumber(field, context.nearCount, operator, value);
    case "lane_type":
      return compareNumber(field, context.laneType, operator, value);
    case "order":
      return compareNumber(field, context.order, operator, value);
    case "order_rate":
      return compareNumber(field, context.orderRate, operator, value);
    case "order_rate_in20_continue":
      return compareNumber(field, context.orderRateIn20Continue ? 1 : 0, operator, value);
    case "order_rate_in50_continue":
      return compareNumber(field, context.orderRateIn50Continue ? 1 : 0, operator, value);
    case "order_rate_in80_continue":
      return compareNumber(field, context.orderRateIn80Continue ? 1 : 0, operator, value);
    case "order_rate_out40_continue":
      return compareNumber(field, context.orderRateOut40Continue ? 1 : 0, operator, value);
    case "order_rate_out50_continue":
      return compareNumber(field, context.orderRateOut50Continue ? 1 : 0, operator, value);
    case "order_rate_out70_continue":
      return compareNumber(field, context.orderRateOut70Continue ? 1 : 0, operator, value);
    case "overtake_target_no_order_up_time":
      return compareNumber(field, context.overtakeTargetNoOrderUpTime ?? 0, operator, value);
    case "overtake_target_time":
      return compareNumber(field, context.overtakeTargetTime ?? 0, operator, value);
    case "phase":
      return compareNumber(field, phaseMap[context.phase], operator, value);
    case "phase_firsthalf_random": {
      const target = context.skillRandomState?.phaseFirstHalfRandomTargets?.[value];
      return compareRandomDistanceTarget(operator, value, target, context);
    }
    case "phase_laterhalf_random": {
      const target = context.skillRandomState?.phaseLaterHalfRandomTargets?.[value];
      return compareRandomDistanceTarget(operator, value, target, context);
    }
    case "phase_random": {
      const target = context.skillRandomState?.phaseRandomTargets?.[value];
      return compareRandomDistanceTarget(operator, value, target, context);
    }
    case "popularity":
      return context.popularityRank !== undefined
        && compareNumber(field, context.popularityRank, operator, value);
    case "post_number":
      return context.gateBlock !== undefined
        && compareNumber(field, context.gateBlock, operator, value);
    case "random_lot":
      return operator === "==" && context.skillRandomState?.randomLotRoll !== undefined
        && context.skillRandomState.randomLotRoll < value;
    case "remain_distance":
      return compareNumber(field, context.remainDistance, operator, value);
    case "rotation":
      return compareNumber(field, rotationMap[context.rotation], operator, value);
    case "running_style":
      return compareNumber(field, strategyMap[context.strategy], operator, value);
    case "running_style_count_nige_otherself":
      return compareNumber(field, context.runningStyleCountFrontOthers ?? 0, operator, value);
    case "running_style_count_senko_otherself":
      return compareNumber(field, context.runningStyleCountPaceOthers ?? 0, operator, value);
    case "running_style_count_sashi_otherself":
      return compareNumber(field, context.runningStyleCountLateOthers ?? 0, operator, value);
    case "running_style_count_oikomi_otherself":
      return compareNumber(field, context.runningStyleCountEndOthers ?? 0, operator, value);
    case "running_style_count_same":
      return compareNumber(field, context.runningStyleCountSame ?? 0, operator, value);
    case "running_style_count_same_rate":
      return compareNumber(field, context.runningStyleCountSameRate ?? 0, operator, value);
    case "running_style_equal_popularity_one":
      return compareNumber(field, context.runningStyleEqualPopularityOne ? 1 : 0, operator, value);
    case "same_skill_horse_count":
      return compareNumber(field, context.sameSkillHorseCount ?? 0, operator, value);
    case "season":
      return compareNumber(field, seasonMap[context.season ?? "spring"], operator, value);
    case "slope": {
      const slopeValue =
        context.segment?.slope === "uphill" ? 1 : context.segment?.slope === "downhill" ? 2 : 0;
      return compareNumber(field, slopeValue, operator, value);
    }
    case "straight_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.straightRandom, context));
    case "track_id":
      return context.trackId !== undefined && compareNumber(field, context.trackId, operator, value);
    case "temptation_count":
      return compareNumber(field, context.temptationCount ?? 0, operator, value);
    case "up_slope_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.upSlopeRandom, context));
    case "weather":
      return compareNumber(field, weatherMap[context.weather], operator, value);
    case "down_slope_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.downSlopeRandom, context));
    default:
      return false;
  }
}

function compareRandomBoolean(operator: ComparisonOperator, expectedValue: number, active: boolean) {
  if (expectedValue !== 1) {
    return false;
  }

  return compareNumber("random_window", active ? 1 : 0, operator, 1);
}

function compareRandomDistanceTarget(
  operator: ComparisonOperator,
  expectedValue: number,
  targetDistanceRate: number | undefined,
  context: GlobalSkillContext,
) {
  if (operator !== "==" || targetDistanceRate === undefined) {
    return false;
  }

  return isDistanceTargetActive(targetDistanceRate, context);
}

function isDistanceTargetActive(targetDistanceRate: number, context: GlobalSkillContext) {
  const previousRate = (context.previousDistanceMeters / Math.max(context.remainDistance + context.distanceMeters, 1)) * 100;
  const currentRate = context.distanceRate;
  const low = Math.min(previousRate, currentRate);
  const high = Math.max(previousRate, currentRate);
  return targetDistanceRate >= low && targetDistanceRate <= high;
}

function isSegmentTargetActive(target: RandomSegmentTarget | undefined, context: GlobalSkillContext) {
  if (!target) {
    return false;
  }

  const low = Math.min(context.previousDistanceMeters, context.distanceMeters);
  const high = Math.max(context.previousDistanceMeters, context.distanceMeters);
  return target.targetMeters >= low && target.targetMeters <= high;
}

function getConditionExpressionTokens(expression: string | null) {
  if (!expression) {
    return [];
  }

  return expression
    .split(/[&@]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getUnsupportedConditionTokens(expression: string | null) {
  return getConditionExpressionTokens(expression).filter((token) => {
    const parsed = parseToken(token);
    return parsed === null || !supportedTokens.has(parsed.field);
  });
}

function supportsConditionExpression(expression: string | null) {
  return getUnsupportedConditionTokens(expression).length === 0;
}

function evaluateExpression(expression: string | null, context: GlobalSkillContext) {
  if (!expression) {
    return true;
  }

  return expression
    .split("@")
    .map((branch) => branch.trim())
    .filter(Boolean)
    .some((branch) =>
      branch
        .split("&")
        .map((token) => token.trim())
        .filter(Boolean)
        .every((token) => {
          const parsed = parseToken(token);
          return parsed ? evaluateField(parsed.field, parsed.operator, parsed.value, context) : false;
        }),
    );
}

function getUnsupportedEffectTypes(group: GlobalSkillConditionGroup) {
  return [...new Set(group.effects.filter((effect) => !supportedEffectTypes.has(effect.type)).map((effect) => effect.type))];
}

function resolveEffects(group: GlobalSkillConditionGroup): ResolvedSkillEffects | null {
  const resolved: ResolvedSkillEffects = {
    speed: 0,
    currentSpeed: 0,
    naturalDecelerationCurrentSpeed: 0,
    forcedRareSkillCount: 0,
    acceleration: 0,
    navigation: 0,
    pressure: 0,
    startDelayMultiplier: 1,
    fixedStartDelaySeconds: undefined,
    rushProbabilityModifier: 0,
    staminaRecoveryRatio: 0,
    opponentStaminaDrainRatio: 0,
    stats: {},
  };

  for (const effect of group.effects) {
    if (!supportedEffectTypes.has(effect.type)) {
      return null;
    }

    const scaled = effect.value / 10000;

    switch (effect.type) {
      case 1:
        resolved.stats.speed = (resolved.stats.speed ?? 0) + scaled;
        break;
      case 2:
        resolved.stats.stamina = (resolved.stats.stamina ?? 0) + scaled;
        break;
      case 3:
        resolved.stats.power = (resolved.stats.power ?? 0) + scaled;
        break;
      case 4:
        resolved.stats.guts = (resolved.stats.guts ?? 0) + scaled;
        break;
      case 5:
        resolved.stats.wit = (resolved.stats.wit ?? 0) + scaled;
        break;
      case 9:
        if (scaled < 0 && group.condition?.includes("temptation_opponent_count")) {
          resolved.opponentStaminaDrainRatio += Math.abs(scaled);
        } else {
          resolved.staminaRecoveryRatio += scaled;
        }
        break;
      case 10:
        resolved.startDelayMultiplier *= scaled;
        break;
      case 14:
        resolved.fixedStartDelaySeconds = scaled;
        break;
      case 21:
        resolved.pressure += Math.abs(scaled);
        break;
      case 22:
        resolved.naturalDecelerationCurrentSpeed += scaled;
        break;
      case 27:
        resolved.speed += scaled;
        break;
      case 28:
        resolved.navigation += scaled;
        break;
      case 29:
        resolved.rushProbabilityModifier += effect.value / 1_000_000;
        break;
      case 31:
        resolved.acceleration += scaled;
        break;
      case 32:
        resolved.stats.speed = (resolved.stats.speed ?? 0) + scaled;
        resolved.stats.stamina = (resolved.stats.stamina ?? 0) + scaled;
        resolved.stats.power = (resolved.stats.power ?? 0) + scaled;
        resolved.stats.guts = (resolved.stats.guts ?? 0) + scaled;
        resolved.stats.wit = (resolved.stats.wit ?? 0) + scaled;
        break;
      case 37:
        resolved.forcedRareSkillCount += Math.max(0, Math.round(scaled));
        break;
      default:
        return null;
    }
  }

  return resolved;
}

export function canModelGlobalSkill(skill: GlobalSkill) {
  return getGlobalSkillModelingReport(skill).modeled;
}

/** Returns the explicit reasons a Global skill cannot be interpreted by this engine. */
export function getGlobalSkillModelingReport(skill: GlobalSkill): GlobalSkillModelingReport {
  const unsupportedConditionTokens = new Set<string>();
  const unsupportedEffectTypes = new Set<number>();
  let modeled = false;

  for (const group of skill.conditionGroups) {
    const conditionTokens = [
      ...getUnsupportedConditionTokens(group.condition),
      ...getUnsupportedConditionTokens(group.precondition),
    ];
    const effectTypes = getUnsupportedEffectTypes(group);

    if (conditionTokens.length === 0 && effectTypes.length === 0) {
      modeled = true;
    }

    conditionTokens.forEach((token) => unsupportedConditionTokens.add(token));
    effectTypes.forEach((type) => unsupportedEffectTypes.add(type));
  }

  return {
    modeled,
    unsupportedConditionTokens: [...unsupportedConditionTokens].sort(),
    unsupportedEffectTypes: [...unsupportedEffectTypes].sort((left, right) => left - right),
  };
}

export function resolveGlobalSkillActivation(
  skill: GlobalSkill,
  context: GlobalSkillContext,
): ResolvedGlobalSkill | null {
  for (const group of skill.conditionGroups) {
    const effects = resolveEffects(group);

    if (
      effects === null ||
      !supportsConditionExpression(group.condition) ||
      !supportsConditionExpression(group.precondition) ||
      !evaluateExpression(group.precondition, context) ||
      !evaluateExpression(group.condition, context)
    ) {
      continue;
    }

    return {
      durationSeconds: resolveSkillDurationSeconds(group, context),
      effects,
      conditionSummary: group.condition ?? group.precondition ?? "always",
    };
  }

  return null;
}

/** Resolve the first usable effect group while deliberately bypassing its activation conditions. */
export function resolveForcedGlobalSkillActivation(
  skill: GlobalSkill,
  context: GlobalSkillContext,
): ResolvedGlobalSkill | null {
  for (const group of skill.conditionGroups) {
    const effects = resolveEffects(group);

    if (effects === null || !group.baseTimeMs || group.baseTimeMs <= 0) {
      continue;
    }

    return {
      durationSeconds: resolveSkillDurationSeconds(group, context),
      effects,
      conditionSummary: "forced activation",
    };
  }

  return null;
}

function resolveSkillDurationSeconds(group: GlobalSkillConditionGroup, context: GlobalSkillContext) {
  if (!group.baseTimeMs || group.baseTimeMs <= 0) {
    return 0;
  }

  const baseSeconds = group.baseTimeMs / 10000;
  const trackDistanceMeters = context.distanceMeters + context.remainDistance;
  return baseSeconds * (trackDistanceMeters / 1000);
}
