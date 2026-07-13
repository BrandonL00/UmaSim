import type { Skill, SkillAlternative } from "../skills/types";
import type { StatBlock } from "../uma/types";
import { createGlobalSkillEngineMap, globalSkills } from "../../data/skills";
import {
  acceleration,
  baseSpeed,
  staminaCostPerSecond,
  targetSpeed,
} from "./formulas";
import {
  applyRunnerSpatialSnapshot,
  createRaceRuntimeState,
  getRaceStandings,
  getRunnerNeighbors,
  mergeStats,
  resetRivalState,
  snapshotRunnerState,
  type RuntimeRunner,
  type RunnerNeighbors,
} from "./engineState";
import {
  canModelGlobalSkill,
  getGlobalSkillModelingReport,
  resolveGlobalSkillActivation,
  type GlobalSkillContext,
  type RandomSegmentTarget,
  type SkillRandomState,
} from "./globalSkillModel";
import { getLaneType, updateRunnerPathing } from "./pathing";
import { createSeededRandom } from "./random";
import { buildTrafficSnapshot, resolveTrafficMovementPenalty } from "./traffic";
import { resolveOwnedUniqueSkill } from "./uniqueSkillModel";
import type {
  RaceCatalog,
  RacePhase,
  RaceResult,
  RaceTick,
  RaceSetup,
  RunnerTick,
  SimulationWarning,
  SkillEvent,
  SkillDebugEntry,
  SkillDebugTarget,
  Track,
  TrackSegment,
} from "./types";

type SimCatalog = RaceCatalog & {
  skills: Skill[];
};

type SimulateRaceOptions = {
  debugSkills?: boolean;
};

export const simulationTickSeconds = 0.5;
const maxRaceSeconds = 260;

export function simulateRace(setup: RaceSetup, catalog: SimCatalog, options: SimulateRaceOptions = {}): RaceResult {
  const track = catalog.tracks.find((candidate) => candidate.id === setup.trackId);
  const tickSeconds = setup.tickSeconds ?? simulationTickSeconds;

  if (!track) {
    throw new Error(`Unknown track: ${setup.trackId}`);
  }
  if (!Number.isFinite(tickSeconds) || tickSeconds <= 0) {
    throw new Error("Simulation tick must be a positive number of seconds.");
  }

  const random = createSeededRandom(setup.seed);
  const warnings: SimulationWarning[] = [];
  const skillById = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  const globalSkillById = createGlobalSkillEngineMap();
  const skillEvents: SkillEvent[] = [];
  const timeline = [];
  const runtime = createRaceRuntimeState(setup, track, catalog.skills, random, globalSkillById);
  const runners = runtime.runners;

  for (let second = 0; second <= maxRaceSeconds; second += tickSeconds) {
    const snapshots: RunnerTick[] = [];
    let finishedCount = 0;
    const standings = getRaceStandings(runners);
    resetRivalState(runners);

    for (const runner of runners) {
      if (runner.finishTime !== undefined) {
        finishedCount += 1;
        snapshots.push(snapshotRunnerState(runner, track, getRacePhase(runner.distanceMeters, track.distanceMeters)));
        continue;
      }

      const phase = getRacePhase(runner.distanceMeters, track.distanceMeters);
      const segment = getCurrentSegment(track, runner.distanceMeters);
      const previousDistanceMeters = runner.spatial.lastEvaluatedDistanceMeters;
      const standing = standings.find((candidate) => candidate.runner === runner);
      const order = standing?.order ?? runners.length;
      const neighbors = getRunnerNeighbors(standings, standing?.order ?? runners.length, runner);
      const traffic = buildTrafficSnapshot(standings, runner);
      const changeOrder = applyRunnerSpatialSnapshot(runner, order, neighbors, traffic, tickSeconds);

      runner.activeEffects = runner.activeEffects.filter((effect) => effect.expiresAt > second);
      evaluateSkills({
        runner,
        setup,
        track,
        segment,
        phase,
        second,
        random,
        previousDistanceMeters,
        skillById,
        globalSkillById,
        skillEvents,
        order,
        runnerCount: runners.length,
        changeOrder,
        neighbors,
        standings,
      });
      runner.spatial.lastEvaluatedDistanceMeters = runner.distanceMeters;

      const navigationBonus = runner.activeEffects.reduce((sum, effect) => sum + effect.navigation, 0);
      const trafficPenalty = resolveTrafficMovementPenalty(runner.traffic, navigationBonus);
      updateRunnerPathing(runner, neighbors, runners.length, navigationBonus, trafficPenalty.laneChangeResistance);

      const speedBonus = runner.activeEffects.reduce((sum, effect) => sum + effect.speed, 0);
      const accelerationBonus = runner.activeEffects.reduce((sum, effect) => sum + effect.acceleration, 0);
      const dynamicStats = mergeStats(
        runner.adjustedStats,
        runner.activeEffects.reduce<Partial<StatBlock>>(
          (sum, effect) => ({
            speed: (sum.speed ?? 0) + (effect.stats.speed ?? 0),
            stamina: (sum.stamina ?? 0) + (effect.stats.stamina ?? 0),
            power: (sum.power ?? 0) + (effect.stats.power ?? 0),
            guts: (sum.guts ?? 0) + (effect.stats.guts ?? 0),
            wit: (sum.wit ?? 0) + (effect.stats.wit ?? 0),
          }),
          {},
        ),
      );
      const base = baseSpeed(track.distanceMeters);

      runner.targetSpeed = targetSpeed(
        base,
        dynamicStats.speed,
        phase,
        runner.build.strategy,
        runner.build.aptitudes.distance[track.distanceCategory],
        speedBonus,
      );

      const accel = acceleration(
        dynamicStats.power,
        segment?.slope === "uphill",
        runner.build.aptitudes.surface[track.surface],
        accelerationBonus,
      ) - trafficPenalty.accelerationPenalty;

      const staminaRate = runner.stamina > 0 ? 1 : 0.72;
      const speedDelta = runner.targetSpeed > runner.speed ? accel * tickSeconds : -0.36 * tickSeconds;
      runner.speed = clamp(runner.speed + speedDelta, 1, runner.targetSpeed * staminaRate * trafficPenalty.speedCapFactor);
      runner.distanceMeters += runner.speed * tickSeconds;
      const staminaDrain = staminaCostPerSecond(runner.speed, phase) * tickSeconds;
      runner.stamina = Math.max(0, runner.stamina - staminaDrain);
      runner.topSpeed = Math.max(runner.topSpeed, runner.speed);
      runner.speedTotal += runner.speed;
      runner.tickCount += 1;
      runner.staminaSpent += staminaDrain;
      runner.spatial.lastOrder = order;

      if (runner.distanceMeters >= track.distanceMeters) {
        const overrun = runner.distanceMeters - track.distanceMeters;
        const correction = overrun / Math.max(runner.speed, 1);
        runner.finishTime = round(second + tickSeconds - correction);
        runner.distanceMeters = track.distanceMeters;
      }

      snapshots.push(snapshotRunnerState(runner, track, phase));
    }

    timeline.push({
      second: round(second),
      runners: snapshots,
    });

    if (finishedCount === runners.length) {
      break;
    }
  }

  if (runners.some((runner) => runner.finishTime === undefined)) {
    warnings.push({
      code: "max_time_reached",
      message: "At least one runner did not finish before the simulation cutoff.",
    });
  }

  const placements = [...runners]
    .sort((left, right) => (left.finishTime ?? Infinity) - (right.finishTime ?? Infinity))
    .map((runner, index) => ({
      place: index + 1,
      runnerId: runner.build.id,
      runnerName: runner.build.name,
      finishTime: runner.finishTime ?? maxRaceSeconds,
    }));
  const winnerTime = placements[0]?.finishTime ?? maxRaceSeconds;

  const result: RaceResult = {
    seed: setup.seed,
    tickSeconds,
    placements,
    runners: runners.map((runner) => ({
      runnerId: runner.build.id,
      runnerName: runner.build.name,
      adjustedStats: runner.adjustedStats,
      topSpeed: round(runner.topSpeed),
      averageSpeed: round(runner.speedTotal / Math.max(runner.tickCount, 1)),
      remainingStamina: round(runner.stamina),
      staminaSpent: round(runner.staminaSpent),
      triggeredSkillCount: runner.triggers.triggeredSkillIds.size,
      finishTime: runner.finishTime ?? maxRaceSeconds,
      gapToWinner: round((runner.finishTime ?? maxRaceSeconds) - winnerTime),
    })),
    timeline,
    skillEvents,
    warnings,
  };

  if (options.debugSkills) {
    result.skillDebug = buildSkillDebugEntries(runners, track, timeline, skillEvents, skillById, globalSkillById);
  }

  return result;
}

function buildSkillDebugEntries(
  runners: RuntimeRunner[],
  track: Track,
  timeline: RaceTick[],
  skillEvents: SkillEvent[],
  skillById: Map<string, Skill>,
  globalSkillById: Map<string, (typeof globalSkills)[number]>,
): SkillDebugEntry[] {
  const eventsByRunnerSkill = new Map(skillEvents.map((event) => [`${event.runnerId}:${event.skillId}`, event]));

  return runners.flatMap((runner) =>
    runner.resolvedSkillIds.map((skillId): SkillDebugEntry | null => {
      const event = eventsByRunnerSkill.get(`${runner.build.id}:${skillId}`);
      const fixtureSkill = skillById.get(skillId);

      if (fixtureSkill) {
        return {
          runnerId: runner.build.id,
          skillId,
          skillName: fixtureSkill.name,
          source: "fixture",
          status: event ? "activated" : "missed",
          conditionSummary: fixtureSkill.alternatives.map((alternative) => describeFixtureCondition(alternative)).join(" | "),
          sampledTargets: [],
          activation: event ? getSkillActivationDebug(event, track, timeline) : undefined,
          reason: event ? "Activated during this run." : "Fixture condition or chance roll did not resolve before finish.",
        };
      }

      const globalSkillBase = globalSkillById.get(skillId);
      if (!globalSkillBase) {
        return null;
      }

      const globalSkill = resolveOwnedUniqueSkill(globalSkillBase, {
        ownedUniqueSkillId: runner.build.uniqueSkillId,
        uniqueSkillLevel: runner.build.uniqueSkillLevel,
      });
      const modelingReport = getGlobalSkillModelingReport(globalSkill);
      const modeled = modelingReport.modeled;
      const sampledTargets = describeSkillRandomState(runner.triggers.randomProfiles[skillId], track);

      return {
        runnerId: runner.build.id,
        skillId,
        skillName: globalSkill.name,
        source: "global",
        status: event ? "activated" : modeled ? "missed" : "unmodeled",
        conditionSummary: globalSkill.conditionGroups
          .map((group) => group.condition ?? group.precondition ?? "always")
          .join(" | "),
        sampledTargets,
        activation: event ? getSkillActivationDebug(event, track, timeline) : undefined,
        reason: event
          ? "Activated during this run."
          : modeled
            ? sampledTargets.length
              ? "Sampled trigger window or condition gates did not line up in this run."
              : "Condition gates did not resolve before finish."
            : describeUnsupportedGlobalSkill(modelingReport),
      };
    }).filter((entry): entry is SkillDebugEntry => Boolean(entry)),
  );
}

function describeUnsupportedGlobalSkill(report: ReturnType<typeof getGlobalSkillModelingReport>) {
  const reasons = [
    report.unsupportedConditionTokens.length
      ? `Unsupported condition: ${report.unsupportedConditionTokens.join(", ")}.`
      : null,
    report.unsupportedEffectTypes.length
      ? `Unsupported effect type: ${report.unsupportedEffectTypes.join(", ")}.`
      : null,
  ].filter(Boolean);

  return reasons.join(" ") || "No supported condition-and-effect alternative is available in the current engine.";
}

function getSkillActivationDebug(event: SkillEvent, track: Track, timeline: RaceTick[]) {
  const timelineFrame =
    timeline.find((tick) => tick.second >= event.second)?.runners.find((runner) => runner.runnerId === event.runnerId) ??
    timeline.at(-1)?.runners.find((runner) => runner.runnerId === event.runnerId);
  const distanceMeters = timelineFrame?.distanceMeters ?? 0;

  return {
    second: event.second,
    distanceMeters,
    distanceRate: (distanceMeters / track.distanceMeters) * 100,
  };
}

function describeFixtureCondition(alternative: SkillAlternative) {
  const parts = [
    alternative.condition.phase ? `phase ${alternative.condition.phase}` : null,
    alternative.condition.segmentKind ? alternative.condition.segmentKind : null,
    alternative.condition.strategy?.length ? `strategy ${alternative.condition.strategy.join("/")}` : null,
    alternative.condition.weather?.length ? `weather ${alternative.condition.weather.join("/")}` : null,
    alternative.condition.randomChance !== undefined
      ? `${Math.round(alternative.condition.randomChance * 100)}% chance`
      : null,
  ].filter(Boolean);

  return parts.join(", ") || "always";
}

function describeSkillRandomState(state: SkillRandomState | undefined, track: Track): SkillDebugTarget[] {
  if (!state) {
    return [];
  }

  const targets: SkillDebugTarget[] = [];
  addRateTargets(targets, "phase random", state.phaseRandomTargets, track);
  addRateTargets(targets, "phase first half", state.phaseFirstHalfRandomTargets, track);
  addRateTargets(targets, "phase later half", state.phaseLaterHalfRandomTargets, track);
  addRateTargets(targets, "after distance", state.distanceRateAfterRandomTargets, track);
  addSegmentTarget(targets, "straight random", state.straightRandom, track);
  addSegmentTarget(targets, "corner random", state.cornerRandom, track);
  addSegmentTarget(targets, "any corner random", state.allCornerRandom, track);
  addSegmentTarget(targets, "last straight random", state.lastStraightRandom, track);
  addSegmentTarget(targets, "final corner random", state.finalCornerRandom, track);
  addSegmentTarget(targets, "uphill random", state.upSlopeRandom, track);
  addSegmentTarget(targets, "downhill random", state.downSlopeRandom, track);
  return targets;
}

function addRateTargets(
  targets: SkillDebugTarget[],
  label: string,
  values: Partial<Record<number, number>> | undefined,
  track: Track,
) {
  if (!values) {
    return;
  }

  for (const [key, distanceRate] of Object.entries(values)) {
    if (distanceRate === undefined) {
      continue;
    }

    targets.push({
      label: `${label} ${key}`,
      distanceMeters: (distanceRate / 100) * track.distanceMeters,
      distanceRate,
    });
  }
}

function addSegmentTarget(
  targets: SkillDebugTarget[],
  label: string,
  target: RandomSegmentTarget | undefined,
  track: Track,
) {
  if (!target) {
    return;
  }

  targets.push({
    label,
    distanceMeters: target.targetMeters,
    distanceRate: (target.targetMeters / track.distanceMeters) * 100,
  });
}

function evaluateSkills(args: {
  runner: RuntimeRunner;
  setup: RaceSetup;
  track: Track;
  segment?: TrackSegment;
  phase: RacePhase;
  second: number;
  random: () => number;
  previousDistanceMeters: number;
  skillById: Map<string, Skill>;
  globalSkillById: Map<string, (typeof globalSkills)[number]>;
  skillEvents: SkillEvent[];
  order: number;
  runnerCount: number;
  changeOrder: number;
  neighbors: RunnerNeighbors;
  standings: Array<{ runner: RuntimeRunner; order: number }>;
}) {
  const {
    runner,
    setup,
    track,
    segment,
    phase,
    second,
    random,
    previousDistanceMeters,
    skillById,
    globalSkillById,
    skillEvents,
    order,
    runnerCount,
    changeOrder,
    neighbors,
    standings,
  } = args;

  for (const skillId of runner.resolvedSkillIds) {
    if (runner.triggers.triggeredSkillIds.has(skillId)) {
      continue;
    }

    const skill = skillById.get(skillId);

    if (skill) {
      const alternative = skill.alternatives.find((candidate) =>
        doesAlternativeTrigger(candidate, runner, segment, phase, setup.weather, random),
      );

      if (!alternative) {
        continue;
      }

      runner.triggers.triggeredSkillIds.add(skill.id);
      runner.triggers.activationHistory.push({ skillId: skill.id, second: round(second) });
      applyAlternativeEffects(runner, skill.id, second, alternative);
      skillEvents.push({
        second: round(second),
        runnerId: runner.build.id,
        skillId: skill.id,
        skillName: skill.name,
        message: `${runner.build.name} activated ${skill.name} (${describeEffects(alternative.effects)})`,
        source: "fixture",
      });
      continue;
    }

    const globalSkillBase = globalSkillById.get(skillId);

    if (!globalSkillBase) {
      continue;
    }

    const globalSkill = resolveOwnedUniqueSkill(globalSkillBase, {
      ownedUniqueSkillId: runner.build.uniqueSkillId,
      uniqueSkillLevel: runner.build.uniqueSkillLevel,
    });

    if (!canModelGlobalSkill(globalSkill)) {
      continue;
    }

    const context: GlobalSkillContext = {
      second,
      elapsedMs: second * 1000,
      previousDistanceMeters,
      distanceMeters: runner.distanceMeters,
      activatedSkillCount: runner.triggers.triggeredSkillIds.size,
      phase,
      segment,
      order,
      runnerCount,
      orderRate: (order / Math.max(runnerCount, 1)) * 100,
      distanceRate: (runner.distanceMeters / track.distanceMeters) * 100,
      remainDistance: Math.max(track.distanceMeters - runner.distanceMeters, 0),
      hpPercent: (runner.stamina / Math.max(runner.maxStamina, 1)) * 100,
      strategy: runner.build.strategy,
      weather: setup.weather,
      groundCondition: setup.groundCondition,
      surface: track.surface,
      distanceCategory: track.distanceCategory,
      rotation: track.direction ?? "straight",
      trackId: track.venueId,
      laneType: getLaneType(runner),
      isMoveLane: runner.spatial.moveLane,
      changeOrder,
      isOvertake: changeOrder < 0,
      bashinDiffInfront: neighbors.bashinDiffInfront,
      bashinDiffBehind: neighbors.bashinDiffBehind,
      nearCount: neighbors.nearCount,
      infrontNearLaneTime: runner.spatial.infrontNearLaneTime,
      behindNearLaneTime: runner.spatial.behindNearLaneTime,
      behindNearLaneTimeSet1: runner.spatial.behindNearLaneTimeSet1,
      blockedFront: neighbors.blockedFront,
      blockedFrontSeconds: runner.spatial.blockedFrontSeconds,
      blockedSideSeconds: runner.spatial.blockedSideSeconds,
      skillRandomState: runner.triggers.randomProfiles[skillId],
    };
    const activation = resolveGlobalSkillActivation(globalSkill, context);

    if (!activation) {
      continue;
    }

    runner.triggers.triggeredSkillIds.add(skillId);
    runner.triggers.activationHistory.push({ skillId, second: round(second) });
    applyResolvedEffects(runner, skillId, second, activation, selectPressureTarget(runner, standings));
    skillEvents.push({
      second: round(second),
      runnerId: runner.build.id,
      skillId,
      skillName: globalSkill.name,
      message: `${runner.build.name} activated ${globalSkill.name} (${describeResolvedEffects(activation.effects)})`,
      source: "global",
    });
  }
}

function doesAlternativeTrigger(
  alternative: SkillAlternative,
  runner: RuntimeRunner,
  segment: TrackSegment | undefined,
  phase: RacePhase,
  weather: RaceSetup["weather"],
  random: () => number,
): boolean {
  const condition = alternative.condition;

  if (condition.phase && condition.phase !== phase) {
    return false;
  }

  if (condition.segmentKind && segment?.kind !== condition.segmentKind) {
    return false;
  }

  if (condition.strategy && !condition.strategy.includes(runner.build.strategy)) {
    return false;
  }

  if (condition.weather && !condition.weather.includes(weather)) {
    return false;
  }

  if (condition.randomChance !== undefined && random() > condition.randomChance) {
    return false;
  }

  return true;
}

export function getRacePhase(distanceMeters: number, trackDistance: number): RacePhase {
  const progress = distanceMeters / trackDistance;

  if (progress >= 0.82) {
    return "lastSpurt";
  }

  if (progress >= 0.67) {
    return "late";
  }

  if (progress >= 0.33) {
    return "middle";
  }

  return "early";
}

function getCurrentSegment(track: Track, distanceMeters: number): TrackSegment | undefined {
  return track.segments.find(
    (segment) => distanceMeters >= segment.startMeters && distanceMeters < segment.endMeters,
  );
}

function applyAlternativeEffects(
  runner: RuntimeRunner,
  skillId: string,
  second: number,
  alternative: SkillAlternative,
) {
  let speed = 0;
  let accelerationBonus = 0;
  let navigation = 0;
  let staminaRecovery = 0;

  for (const effect of alternative.effects) {
    if (effect.kind === "speed") {
      speed += effect.amount;
    }

    if (effect.kind === "acceleration") {
      accelerationBonus += effect.amount;
    }

    if (effect.kind === "staminaRecovery") {
      staminaRecovery += effect.amount;
    }
  }

  runner.stamina = Math.min(runner.maxStamina, runner.stamina + staminaRecovery);
  runner.activeEffects.push({
    skillId,
    expiresAt: second + alternative.durationSeconds,
    speed,
    acceleration: accelerationBonus,
    navigation,
    stats: {},
  });
}

function applyResolvedEffects(
  runner: RuntimeRunner,
  skillId: string,
  second: number,
  activation: ReturnType<typeof resolveGlobalSkillActivation>,
  pressureTarget?: RuntimeRunner,
) {
  if (!activation) {
    return;
  }

  runner.stamina = Math.min(
    runner.maxStamina,
    runner.stamina + runner.maxStamina * activation.effects.staminaRecoveryRatio,
  );

  if (activation.durationSeconds <= 0) {
    runner.adjustedStats = mergeStats(runner.adjustedStats, activation.effects.stats);
    return;
  }

  if (activation.effects.pressure && pressureTarget) {
    pressureTarget.rival.pressuredByIds = [...pressureTarget.rival.pressuredByIds, runner.build.id];
    runner.rival.pressureTargetId = pressureTarget.build.id;
    pressureTarget.activeEffects.push({
      skillId: `${skillId}::pressure`,
      expiresAt: second + activation.durationSeconds,
      speed: -activation.effects.pressure,
      acceleration: 0,
      navigation: 0,
      stats: {},
    });
  }

  runner.activeEffects.push({
    skillId,
    expiresAt: second + activation.durationSeconds,
    speed: activation.effects.speed,
    acceleration: activation.effects.acceleration,
    navigation: activation.effects.navigation,
    stats: activation.effects.stats,
  });
}

function selectPressureTarget(
  runner: RuntimeRunner,
  standings: Array<{ runner: RuntimeRunner; order: number }>,
) {
  const traffic = buildTrafficSnapshot(standings, runner);
  const directAhead = traffic.frontRivals[0]?.runner;
  if (directAhead) {
    return directAhead;
  }
  return traffic.sideRivals[0]?.runner;
}

function describeEffects(effects: SkillAlternative["effects"]) {
  return effects
    .map((effect) => {
      if (effect.kind === "speed") return `+${effect.amount.toFixed(2)} speed`;
      if (effect.kind === "acceleration") return `+${effect.amount.toFixed(2)} accel`;
      return `+${Math.round(effect.amount)} stamina`;
    })
    .join(", ");
}

function describeResolvedEffects(effects: {
  speed: number;
  acceleration: number;
  navigation: number;
  pressure: number;
  staminaRecoveryRatio: number;
  stats: Partial<StatBlock>;
}) {
  const parts: string[] = [];

  if (effects.speed) parts.push(`${effects.speed > 0 ? "+" : ""}${effects.speed.toFixed(2)} speed`);
  if (effects.acceleration) parts.push(`${effects.acceleration > 0 ? "+" : ""}${effects.acceleration.toFixed(2)} accel`);
  if (effects.navigation) parts.push(`${effects.navigation > 0 ? "+" : ""}${effects.navigation.toFixed(2)} navigation`);
  if (effects.pressure) parts.push(`${effects.pressure > 0 ? "-" : ""}${effects.pressure.toFixed(2)} rival speed`);
  if (effects.staminaRecoveryRatio) {
    parts.push(`${effects.staminaRecoveryRatio > 0 ? "+" : ""}${(effects.staminaRecoveryRatio * 100).toFixed(1)}% stamina`);
  }

  for (const [key, value] of Object.entries(effects.stats)) {
    if (!value) continue;
    parts.push(`${value > 0 ? "+" : ""}${Math.round(value)} ${key}`);
  }

  return parts.join(", ") || "condition met";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
