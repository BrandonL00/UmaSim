import type { GlobalSkill, GlobalSkillConditionGroup } from "../../data/skills";
import type { GroundCondition, RacePhase, TrackSegment, Weather } from "./types";
import type { DistanceCategory, StatBlock, Strategy, Surface } from "../uma/types";

type ComparisonOperator = "==" | "!=" | ">=" | "<=" | ">" | "<";

export type GlobalSkillContext = {
  second: number;
  elapsedMs: number;
  previousDistanceMeters: number;
  distanceMeters: number;
  activatedSkillCount: number;
  phase: RacePhase;
  segment?: TrackSegment;
  order: number;
  runnerCount: number;
  orderRate: number;
  distanceRate: number;
  remainDistance: number;
  hpPercent: number;
  strategy: Strategy;
  weather: Weather;
  groundCondition: GroundCondition;
  surface: Surface;
  distanceCategory: DistanceCategory;
  rotation: "clockwise" | "counterclockwise" | "straight";
  trackId?: number;
  laneType: number;
  isMoveLane: 0 | 1 | 2;
  changeOrder: number;
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
  acceleration: number;
  navigation: number;
  pressure: number;
  staminaRecoveryRatio: number;
  stats: Partial<StatBlock>;
};

export type ResolvedGlobalSkill = {
  durationSeconds: number;
  effects: ResolvedSkillEffects;
  conditionSummary: string;
};

const supportedEffectTypes = new Set([1, 2, 3, 4, 5, 9, 21, 27, 28, 31]);
const supportedTokens = new Set([
  "always",
  "accumulatetime",
  "activate_count_all",
  "all_corner_random",
  "bashin_diff_behind",
  "bashin_diff_infront",
  "blocked_front",
  "blocked_front_continuetime",
  "blocked_side_continuetime",
  "change_order_onetime",
  "corner",
  "corner_random",
  "distance_rate",
  "distance_rate_after_random",
  "distance_type",
  "ground_condition",
  "ground_type",
  "hp_per",
  "infront_near_lane_time",
  "behind_near_lane_time",
  "behind_near_lane_time_set1",
  "is_finalcorner",
  "is_finalcorner_random",
  "is_lastspurt",
  "is_move_lane",
  "is_overtake",
  "last_straight_random",
  "lane_type",
  "near_count",
  "order",
  "order_rate",
  "phase",
  "phase_laterhalf_random",
  "phase_firsthalf_random",
  "phase_random",
  "remain_distance",
  "rotation",
  "running_style",
  "slope",
  "straight_random",
  "track_id",
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
    case "all_corner_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.allCornerRandom, context));
    case "corner_random": {
      const active = isSegmentTargetActive(context.skillRandomState?.cornerRandom, context);
      const cornerIndex = context.skillRandomState?.cornerRandom?.index;
      return active && cornerIndex !== undefined && compareNumber(field, cornerIndex, operator, value);
    }
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
    case "corner":
      return compareNumber(field, context.segment?.kind === "corner" ? 1 : 0, operator, value);
    case "distance_rate":
      return compareNumber(field, context.distanceRate, operator, value);
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
        context.segment?.tags?.includes("finalCorner") ? 1 : 0,
        operator,
        value,
      );
    case "is_finalcorner_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.finalCornerRandom, context));
    case "is_lastspurt":
      return compareNumber(field, context.phase === "lastSpurt" ? 1 : 0, operator, value);
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
    case "remain_distance":
      return compareNumber(field, context.remainDistance, operator, value);
    case "rotation":
      return compareNumber(field, rotationMap[context.rotation], operator, value);
    case "running_style":
      return compareNumber(field, strategyMap[context.strategy], operator, value);
    case "slope": {
      const slopeValue =
        context.segment?.slope === "uphill" ? 1 : context.segment?.slope === "downhill" ? -1 : 0;
      return compareNumber(field, slopeValue, operator, value);
    }
    case "straight_random":
      return compareRandomBoolean(operator, value, isSegmentTargetActive(context.skillRandomState?.straightRandom, context));
    case "track_id":
      return context.trackId !== undefined && compareNumber(field, context.trackId, operator, value);
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

function supportsConditionExpression(expression: string | null) {
  if (!expression) {
    return true;
  }

  return expression
    .split(/[&@]/)
    .map((token) => token.trim())
    .filter(Boolean)
    .every((token) => {
      const parsed = parseToken(token);
      return parsed !== null && supportedTokens.has(parsed.field);
    });
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

function resolveEffects(group: GlobalSkillConditionGroup): ResolvedSkillEffects | null {
  const resolved: ResolvedSkillEffects = {
    speed: 0,
    acceleration: 0,
    navigation: 0,
    pressure: 0,
    staminaRecoveryRatio: 0,
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
        resolved.staminaRecoveryRatio += scaled;
        break;
      case 21:
        resolved.pressure += Math.abs(scaled);
        break;
      case 27:
        resolved.speed += scaled;
        break;
      case 28:
        resolved.navigation += scaled;
        break;
      case 31:
        resolved.acceleration += scaled;
        break;
      default:
        return null;
    }
  }

  return resolved;
}

export function canModelGlobalSkill(skill: GlobalSkill) {
  return skill.conditionGroups.some((group) => {
    const effects = resolveEffects(group);
    return effects !== null && supportsConditionExpression(group.condition) && supportsConditionExpression(group.precondition);
  });
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
      durationSeconds: group.baseTimeMs && group.baseTimeMs > 0 ? group.baseTimeMs / 1000 : 0,
      effects,
      conditionSummary: group.condition ?? group.precondition ?? "always",
    };
  }

  return null;
}
