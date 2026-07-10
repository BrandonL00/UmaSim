import { globalSkillOptions, globalSkills } from "../../data/skills";
import { resolveActiveSkillIds, type SelectableSkill } from "../skills/selection";
import type { RunnerBuild, StatBlock } from "../uma/types";
import { adjustStats, staminaBudget } from "./formulas";
import {
  canModelGlobalSkill,
  resolveGlobalSkillActivation,
  type GlobalSkillContext,
  type SkillRandomState,
} from "./globalSkillModel";
import type { TrafficSnapshot } from "./traffic";
import type {
  GroundCondition,
  RacePhase,
  RaceSetup,
  RunnerTick,
  Track,
  TrackSegment,
  Weather,
} from "./types";

export type ActiveEffect = {
  skillId: string;
  expiresAt: number;
  speed: number;
  acceleration: number;
  navigation: number;
  stats: Partial<StatBlock>;
};

export type RunnerSpatialState = {
  lastEvaluatedDistanceMeters: number;
  lane: number;
  targetLane: number;
  laneChangeProgress: number;
  moveLane: 0 | 1 | 2;
  blockedFront: boolean;
  blockedFrontSeconds: number;
  blockedSide: boolean;
  blockedSideSeconds: number;
  nearCount: number;
  infrontNearLaneTime: number;
  behindNearLaneTime: number;
  behindNearLaneTimeSet1: number;
  bashinDiffInfront: number | null;
  bashinDiffBehind: number | null;
  lastOrder: number;
  overtakeCount: number;
  changeOrderHistory: number[];
};

export type RunnerTriggerState = {
  triggeredSkillIds: Set<string>;
  randomProfiles: Record<string, SkillRandomState>;
  activationHistory: Array<{
    skillId: string;
    second: number;
  }>;
};

export type RunnerRivalState = {
  pressuredByIds: string[];
  pressureTargetId: string | null;
};

export type RunnerTrafficState = {
  frontTrafficLevel: number;
  sideTrafficLevel: number;
  crowdDensity: number;
  frontRivalCount: number;
  sideRivalCount: number;
  innerLaneBlocked: boolean;
  outerLaneBlocked: boolean;
  escapeRouteAvailable: boolean;
  boxedIn: boolean;
};

export type RuntimeRunner = {
  build: RunnerBuild;
  adjustedStats: StatBlock;
  resolvedSkillIds: string[];
  distanceMeters: number;
  speed: number;
  targetSpeed: number;
  stamina: number;
  maxStamina: number;
  topSpeed: number;
  finishTime?: number;
  activeEffects: ActiveEffect[];
  speedTotal: number;
  tickCount: number;
  staminaSpent: number;
  spatial: RunnerSpatialState;
  triggers: RunnerTriggerState;
  rival: RunnerRivalState;
  traffic: RunnerTrafficState;
};

export type StandingSnapshot = {
  runner: RuntimeRunner;
  order: number;
};

export type RunnerNeighbors = {
  aheadRunner?: RuntimeRunner;
  behindRunner?: RuntimeRunner;
  bashinDiffInfront: number | null;
  bashinDiffBehind: number | null;
  nearCount: number;
  infrontNearLane: boolean;
  behindNearLane: boolean;
  behindNearLaneSet1: boolean;
  blockedFront: boolean;
  blockedSide: boolean;
};

export type RaceRuntimeState = {
  track: Track;
  weather: Weather;
  groundCondition: GroundCondition;
  runners: RuntimeRunner[];
};

export function createRaceRuntimeState(
  setup: RaceSetup,
  track: Track,
  catalogSkills: SelectableSkill[],
  random: () => number,
  globalSkillById: Map<string, (typeof globalSkills)[number]>,
): RaceRuntimeState {
  const selectionSkills = [...catalogSkills, ...globalSkillOptions];
  const runners = setup.runners.map((runner) =>
    createRuntimeRunner(setup, track, runner, selectionSkills, random, globalSkillById),
  );

  return {
    track,
    weather: setup.weather,
    groundCondition: setup.groundCondition,
    runners,
  };
}

function createRuntimeRunner(
  setup: RaceSetup,
  track: Track,
  runner: RunnerBuild,
  selectionSkills: SelectableSkill[],
  random: () => number,
  globalSkillById: Map<string, (typeof globalSkills)[number]>,
): RuntimeRunner {
  const adjustedStats = adjustStats(runner.stats, runner.mood, setup.groundCondition, track.surface);
  const resolvedSkillIds = resolveActiveSkillIds([runner.uniqueSkillId, ...runner.skillIds], selectionSkills);
  const passiveStats = applyPassiveGlobalSkillStats(resolvedSkillIds, adjustedStats, globalSkillById, {
    second: 0,
    elapsedMs: 0,
    previousDistanceMeters: 0,
    distanceMeters: 0,
    activatedSkillCount: 0,
    phase: "early",
    order: 1,
    runnerCount: setup.runners.length,
    orderRate: setup.runners.length > 0 ? 100 / setup.runners.length : 100,
    distanceRate: 0,
    remainDistance: track.distanceMeters,
    hpPercent: 100,
    strategy: runner.strategy,
    weather: setup.weather,
    groundCondition: setup.groundCondition,
    surface: track.surface,
    distanceCategory: track.distanceCategory,
    rotation: track.direction ?? "straight",
    trackId: track.venueId,
    laneType: 0,
    isMoveLane: 0,
    changeOrder: 0,
    isOvertake: false,
    bashinDiffInfront: null,
    bashinDiffBehind: null,
    nearCount: 0,
    infrontNearLaneTime: 0,
    behindNearLaneTime: 0,
    behindNearLaneTimeSet1: 0,
    blockedFront: false,
    blockedFrontSeconds: 0,
    blockedSideSeconds: 0,
  });
  const randomProfiles = buildSkillRandomProfiles(resolvedSkillIds, globalSkillById, track, random);
  const startingSpeed = 3 + random() * 0.35;
  const maxStamina = staminaBudget(passiveStats.stamina, passiveStats.guts);

  return {
    build: runner,
    adjustedStats: passiveStats,
    resolvedSkillIds,
    distanceMeters: 0,
    speed: startingSpeed,
    targetSpeed: startingSpeed,
    stamina: maxStamina,
    maxStamina,
    topSpeed: startingSpeed,
    activeEffects: [],
    speedTotal: 0,
    tickCount: 0,
    staminaSpent: 0,
    spatial: {
      lastEvaluatedDistanceMeters: 0,
      lane: 0,
      targetLane: 0,
      laneChangeProgress: 0,
      moveLane: 0,
      blockedFront: false,
      blockedFrontSeconds: 0,
      blockedSide: false,
      blockedSideSeconds: 0,
      nearCount: 0,
      infrontNearLaneTime: 0,
      behindNearLaneTime: 0,
      behindNearLaneTimeSet1: 0,
      bashinDiffInfront: null,
      bashinDiffBehind: null,
      lastOrder: 1,
      overtakeCount: 0,
      changeOrderHistory: [],
    },
    triggers: {
      triggeredSkillIds: new Set<string>(),
      randomProfiles,
      activationHistory: [],
    },
    rival: {
      pressuredByIds: [],
      pressureTargetId: null,
    },
    traffic: {
      frontTrafficLevel: 0,
      sideTrafficLevel: 0,
      crowdDensity: 0,
      frontRivalCount: 0,
      sideRivalCount: 0,
      innerLaneBlocked: false,
      outerLaneBlocked: false,
      escapeRouteAvailable: true,
      boxedIn: false,
    },
  };
}

function buildSkillRandomProfiles(
  skillIds: string[],
  globalSkillById: Map<string, (typeof globalSkills)[number]>,
  track: Track,
  random: () => number,
) {
  const entries = skillIds.map((skillId) => {
    const globalSkill = globalSkillById.get(skillId);
    return [skillId, globalSkill ? buildSkillRandomProfile(globalSkill, track, random) : {}] as const;
  });

  return Object.fromEntries(entries);
}

function buildSkillRandomProfile(
  skill: (typeof globalSkills)[number],
  track: Track,
  random: () => number,
): SkillRandomState {
  const expressions = skill.conditionGroups
    .flatMap((group) => [group.condition, group.precondition])
    .filter((expression): expression is string => Boolean(expression));

  const profile: SkillRandomState = {};

  const phaseRandomValues = extractTokenValues(expressions, "phase_random");
  if (phaseRandomValues.length) {
    profile.phaseRandomTargets = Object.fromEntries(
      phaseRandomValues.map((value) => [value, samplePhaseDistanceRate(value, "full", random)]),
    );
  }

  const phaseFirstHalfValues = extractTokenValues(expressions, "phase_firsthalf_random");
  if (phaseFirstHalfValues.length) {
    profile.phaseFirstHalfRandomTargets = Object.fromEntries(
      phaseFirstHalfValues.map((value) => [value, samplePhaseDistanceRate(value, "firstHalf", random)]),
    );
  }

  const phaseLaterHalfValues = extractTokenValues(expressions, "phase_laterhalf_random");
  if (phaseLaterHalfValues.length) {
    profile.phaseLaterHalfRandomTargets = Object.fromEntries(
      phaseLaterHalfValues.map((value) => [value, samplePhaseDistanceRate(value, "laterHalf", random)]),
    );
  }

  const afterRandomThresholds = extractTokenValues(expressions, "distance_rate_after_random");
  if (afterRandomThresholds.length) {
    profile.distanceRateAfterRandomTargets = Object.fromEntries(
      afterRandomThresholds.map((value) => [value, sampleRange(value, 100, random)]),
    );
  }

  if (containsToken(expressions, "straight_random")) {
    profile.straightRandom = sampleSegmentTarget(track.segments.filter((segment) => segment.kind === "straight"), random);
  }
  if (containsToken(expressions, "all_corner_random")) {
    profile.allCornerRandom = sampleSegmentTarget(track.segments.filter((segment) => segment.kind === "corner"), random);
  }
  if (containsToken(expressions, "corner_random")) {
    const allowedIndices = extractTokenValues(expressions, "corner_random");
    profile.cornerRandom = sampleIndexedSegmentTarget(
      track.segments
        .map((segment, index) => ({ segment, index: index + 1 }))
        .filter(({ segment }) => segment.kind === "corner")
        .filter(({ index }) => allowedIndices.length === 0 || allowedIndices.includes(index)),
      random,
    );
  }
  if (containsToken(expressions, "last_straight_random")) {
    const lastStraight =
      track.segments.filter((segment) => segment.tags?.includes("finalStraight")) ??
      [];
    profile.lastStraightRandom = sampleSegmentTarget(
      lastStraight.length ? lastStraight : track.segments.filter((segment) => segment.kind === "straight").slice(-1),
      random,
    );
  }
  if (containsToken(expressions, "is_finalcorner_random")) {
    profile.finalCornerRandom = sampleSegmentTarget(
      track.segments.filter((segment) => segment.tags?.includes("finalCorner")),
      random,
    );
  }
  if (containsToken(expressions, "up_slope_random")) {
    profile.upSlopeRandom = sampleSegmentTarget(
      track.segments.filter((segment) => segment.slope === "uphill"),
      random,
    );
  }
  if (containsToken(expressions, "down_slope_random")) {
    profile.downSlopeRandom = sampleSegmentTarget(
      track.segments.filter((segment) => segment.slope === "downhill"),
      random,
    );
  }

  return profile;
}

function containsToken(expressions: string[], token: string) {
  return expressions.some((expression) => expression.includes(token));
}

function extractTokenValues(expressions: string[], token: string) {
  const values = new Set<number>();
  const pattern = new RegExp(`${token}==(-?\\d+(?:\\.\\d+)?)`, "g");

  for (const expression of expressions) {
    for (const match of expression.matchAll(pattern)) {
      values.add(Number(match[1]));
    }
  }

  return [...values];
}

function samplePhaseDistanceRate(
  phaseValue: number,
  portion: "full" | "firstHalf" | "laterHalf",
  random: () => number,
) {
  const bounds = getPhaseBounds(phaseValue);

  if (!bounds) {
    return 0;
  }

  const midpoint = (bounds.start + bounds.end) / 2;
  if (portion === "firstHalf") {
    return sampleRange(bounds.start, midpoint, random);
  }
  if (portion === "laterHalf") {
    return sampleRange(midpoint, bounds.end, random);
  }

  return sampleRange(bounds.start, bounds.end, random);
}

function getPhaseBounds(phaseValue: number) {
  switch (phaseValue) {
    case 0:
      return { start: 0, end: 33 };
    case 1:
      return { start: 33, end: 67 };
    case 2:
      return { start: 67, end: 82 };
    case 3:
      return { start: 82, end: 100 };
    default:
      return null;
  }
}

function sampleRange(start: number, end: number, random: () => number) {
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  return low + (high - low) * random();
}

function sampleSegmentTarget(segments: Track["segments"], random: () => number) {
  if (!segments.length) {
    return undefined;
  }

  const segment = segments[Math.floor(random() * segments.length)] ?? segments[0];
  return {
    segmentStartMeters: segment.startMeters,
    segmentEndMeters: segment.endMeters,
    targetMeters: sampleRange(segment.startMeters, segment.endMeters, random),
  };
}

function sampleIndexedSegmentTarget(
  segments: Array<{ segment: Track["segments"][number]; index: number }>,
  random: () => number,
) {
  if (!segments.length) {
    return undefined;
  }

  const selected = segments[Math.floor(random() * segments.length)] ?? segments[0];
  return {
    index: selected.index,
    segmentStartMeters: selected.segment.startMeters,
    segmentEndMeters: selected.segment.endMeters,
    targetMeters: sampleRange(selected.segment.startMeters, selected.segment.endMeters, random),
  };
}

export function getRaceStandings(runners: RuntimeRunner[]): StandingSnapshot[] {
  return [...runners]
    .sort((left, right) => right.distanceMeters - left.distanceMeters || left.build.id.localeCompare(right.build.id))
    .map((runner, index) => ({
      runner,
      order: index + 1,
    }));
}

export function getRunnerNeighbors(
  standings: StandingSnapshot[],
  order: number,
  runner: RuntimeRunner,
): RunnerNeighbors {
  const ahead = standings[order - 2]?.runner;
  const behind = standings[order]?.runner;
  const bashinDiffInfront = ahead ? Math.max((ahead.distanceMeters - runner.distanceMeters) / 2.5, 0) : null;
  const bashinDiffBehind = behind ? Math.max((runner.distanceMeters - behind.distanceMeters) / 2.5, 0) : null;
  const laneGapAhead = ahead ? Math.abs(ahead.spatial.lane - runner.spatial.lane) : null;
  const laneGapBehind = behind ? Math.abs(behind.spatial.lane - runner.spatial.lane) : null;
  const infrontNearLane =
    bashinDiffInfront !== null && bashinDiffInfront <= 1 && laneGapAhead !== null && laneGapAhead <= 1;
  const behindNearLane =
    bashinDiffBehind !== null && bashinDiffBehind <= 1 && laneGapBehind !== null && laneGapBehind <= 1;
  const behindNearLaneSet1 = behindNearLane && runner.spatial.lane === 0;
  const nearCount = standings.filter(
    (candidate) => candidate.runner !== runner && Math.abs(candidate.runner.distanceMeters - runner.distanceMeters) <= 2.5,
  ).length;

  return {
    aheadRunner: ahead,
    behindRunner: behind,
    bashinDiffInfront,
    bashinDiffBehind,
    nearCount,
    infrontNearLane,
    behindNearLane,
    behindNearLaneSet1,
    blockedFront: bashinDiffInfront !== null && bashinDiffInfront <= 1,
    blockedSide: nearCount >= 1,
  };
}

export function applyRunnerSpatialSnapshot(
  runner: RuntimeRunner,
  order: number,
  neighbors: RunnerNeighbors,
  traffic: TrafficSnapshot,
  tickSeconds: number,
) {
  const changeOrder = order - runner.spatial.lastOrder;

  runner.spatial.blockedFront = neighbors.blockedFront;
  runner.spatial.blockedFrontSeconds = neighbors.blockedFront
    ? runner.spatial.blockedFrontSeconds + tickSeconds
    : 0;
  runner.spatial.blockedSide = neighbors.blockedSide;
  runner.spatial.blockedSideSeconds = neighbors.blockedSide
    ? runner.spatial.blockedSideSeconds + tickSeconds
    : 0;
  runner.spatial.nearCount = neighbors.nearCount;
  runner.spatial.infrontNearLaneTime = neighbors.infrontNearLane
    ? runner.spatial.infrontNearLaneTime + tickSeconds
    : 0;
  runner.spatial.behindNearLaneTime = neighbors.behindNearLane
    ? runner.spatial.behindNearLaneTime + tickSeconds
    : 0;
  runner.spatial.behindNearLaneTimeSet1 = neighbors.behindNearLaneSet1
    ? runner.spatial.behindNearLaneTimeSet1 + tickSeconds
    : 0;
  runner.spatial.bashinDiffInfront = neighbors.bashinDiffInfront;
  runner.spatial.bashinDiffBehind = neighbors.bashinDiffBehind;
  runner.spatial.changeOrderHistory = [...runner.spatial.changeOrderHistory.slice(-7), changeOrder];
  runner.traffic.frontTrafficLevel = traffic.frontTrafficLevel;
  runner.traffic.sideTrafficLevel = traffic.sideTrafficLevel;
  runner.traffic.crowdDensity = traffic.crowdDensity;
  runner.traffic.frontRivalCount = traffic.frontRivalCount;
  runner.traffic.sideRivalCount = traffic.sideRivalCount;
  runner.traffic.innerLaneBlocked = traffic.innerLaneBlocked;
  runner.traffic.outerLaneBlocked = traffic.outerLaneBlocked;
  runner.traffic.escapeRouteAvailable = traffic.escapeRouteAvailable;
  runner.traffic.boxedIn = traffic.boxedIn;

  if (changeOrder < 0) {
    runner.spatial.overtakeCount += Math.abs(changeOrder);
  }

  return changeOrder;
}

export function snapshotRunnerState(
  runner: RuntimeRunner,
  track: Track,
  phase: RacePhase,
): RunnerTick {
  return {
    runnerId: runner.build.id,
    distanceMeters: round(Math.min(runner.distanceMeters, track.distanceMeters)),
    speed: round(runner.speed),
    targetSpeed: round(runner.targetSpeed),
    stamina: round(runner.stamina),
    phase,
  };
}

export function mergeStats(base: StatBlock, modifier: Partial<StatBlock>): StatBlock {
  return {
    speed: Math.max(1, base.speed + (modifier.speed ?? 0)),
    stamina: Math.max(1, base.stamina + (modifier.stamina ?? 0)),
    power: Math.max(1, base.power + (modifier.power ?? 0)),
    guts: Math.max(1, base.guts + (modifier.guts ?? 0)),
    wit: Math.max(1, base.wit + (modifier.wit ?? 0)),
  };
}

function applyPassiveGlobalSkillStats(
  skillIds: string[],
  adjustedStats: StatBlock,
  globalSkillById: Map<string, (typeof globalSkills)[number]>,
  context: GlobalSkillContext,
) {
  return skillIds.reduce((stats, skillId) => {
    const skill = globalSkillById.get(skillId);

    if (!skill || !canModelGlobalSkill(skill)) {
      return stats;
    }

    const activation = resolveGlobalSkillActivation(skill, context);

    if (!activation || activation.durationSeconds > 0) {
      return stats;
    }

    return mergeStats(stats, activation.effects.stats);
  }, adjustedStats);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resetRivalState(runners: RuntimeRunner[]) {
  for (const runner of runners) {
    runner.rival.pressuredByIds = [];
    runner.rival.pressureTargetId = null;
  }
}
