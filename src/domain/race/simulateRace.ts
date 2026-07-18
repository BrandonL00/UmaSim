import type { Skill, SkillAlternative } from "../skills/types";
import type { StatBlock } from "../uma/types";
import { createGlobalSkillEngineMap, globalSkills, type GlobalSkill } from "../../data/skills";
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
  resolveForcedGlobalSkillActivation,
  resolveGlobalSkillActivation,
  type GlobalSkillContext,
  type RandomSegmentTarget,
  type SkillRandomState,
} from "./globalSkillModel";
import { getLaneType, updateRunnerPathing } from "./pathing";
import { createSeededRandom } from "./random";
import { activateRushAtDistance, advanceRushState } from "./rush";
import { updateDuelState } from "./dueling";
import { buildTrafficSnapshot, resolveTrafficMovementPenalty } from "./traffic";
import { areRaceOpponents } from "./teams";
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
  const runtime = createRaceRuntimeState(setup, track, catalog.skills, globalSkillById);
  const runners = runtime.runners;

  for (const runner of runners) {
    if (runner.build.gateBlock === undefined && runner.resolvedSkillIds.some((skillId) => {
      const skill = globalSkillById.get(skillId);
      return skill?.conditionGroups.some((group) =>
        group.condition?.includes("post_number") || group.precondition?.includes("post_number"),
      );
    })) {
      warnings.push({
        code: "missing_gate_block",
        message: `${runner.build.name} has a gate-block skill, but no gate block is set. That skill cannot activate.`,
      });
    }
  }

  for (let second = 0; second <= maxRaceSeconds; second += tickSeconds) {
    const snapshots: RunnerTick[] = [];
    let finishedCount = 0;
    const standings = getRaceStandings(runners);
    const evaluationOrder = standings.map((standing) => standing.runner);
    const duelParticipants = evaluationOrder.map(toDuelParticipant);
    resetRivalState(runners);

    for (const runner of evaluationOrder) {
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
      const hasOvertakeTarget = updateOvertakeTargetState(runner, standings, tickSeconds);
      const justEnteredLastStraight = Boolean(
        segment?.tags?.includes("finalStraight") && !runner.spatial.hasEnteredLastStraight,
      );
      if (segment?.tags?.includes("finalStraight")) runner.spatial.hasEnteredLastStraight = true;
      const changeOrder = applyRunnerSpatialSnapshot(runner, order, neighbors, traffic, tickSeconds);
      updateOvertakeHistory(runner, changeOrder, phase, segment);
      updateContinuousOrderRateHistory(runner, second, order, runners.length);
      runner.rush = activateRushAtDistance(runner.rush, runner.distanceMeters);
      runner.duel = updateDuelState(
        runner.duel,
        duelParticipants.find((participant) => participant.id === runner.build.id) ?? toDuelParticipant(runner),
        duelParticipants,
        Boolean(segment?.tags?.includes("finalStraight")),
        tickSeconds,
      );

      const expiredEffects = runner.activeEffects.filter((effect) => effect.expiresAt <= second);
      for (const effect of expiredEffects) {
        if (effect.naturalDeceleration && effect.currentSpeed > 0) {
          runner.speed += effect.currentSpeed;
        }
      }
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
        hasOvertakeTarget,
        justEnteredLastStraight,
        neighbors,
        standings,
      });
      runner.spatial.lastEvaluatedDistanceMeters = runner.distanceMeters;

      const navigationBonus = runner.activeEffects.reduce((sum, effect) => sum + effect.navigation, 0);
      const trafficPenalty = resolveTrafficMovementPenalty(runner.traffic, navigationBonus);
      updateRunnerPathing(runner, neighbors, runners.length, navigationBonus, trafficPenalty.laneChangeResistance);
      const delayedSeconds = Math.min(runner.startDelayRemainingSeconds, tickSeconds);
      runner.startDelayRemainingSeconds = Math.max(0, runner.startDelayRemainingSeconds - tickSeconds);
      const movementTickSeconds = tickSeconds - delayedSeconds;

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
      const speedDelta = runner.targetSpeed > runner.speed
        ? accel * movementTickSeconds
        : -0.36 * movementTickSeconds;
      runner.speed = clamp(runner.speed + speedDelta, 1, runner.targetSpeed * staminaRate * trafficPenalty.speedCapFactor);
      const actualSpeed = getActualRunnerSpeed(runner);
      runner.distanceMeters += actualSpeed * movementTickSeconds;
      const rushStaminaFactor = runner.rush.active ? 1.6 : 1;
      const staminaDrain = staminaCostPerSecond(runner.speed, phase) * movementTickSeconds * rushStaminaFactor;
      runner.stamina = Math.max(0, runner.stamina - staminaDrain);
      runner.rush = advanceRushState(runner.rush, movementTickSeconds, random);
      runner.topSpeed = Math.max(runner.topSpeed, actualSpeed);
      runner.speedTotal += actualSpeed;
      runner.tickCount += 1;
      runner.staminaSpent += staminaDrain;
      runner.spatial.lastOrder = order;

      if (runner.distanceMeters >= track.distanceMeters) {
        const overrun = runner.distanceMeters - track.distanceMeters;
        const correction = overrun / Math.max(actualSpeed, 1);
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
    .sort((left, right) =>
      (left.finishTime ?? Infinity) - (right.finishTime ?? Infinity)
      || (left.startOrder ?? 0) - (right.startOrder ?? 0),
    )
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
      const activationRoll = runner.triggers.skillActivationRolls?.[skillId];
      const witMissReason = activationRoll && !activationRoll.passed
        ? `Pre-race Wit check failed (${Math.round(activationRoll.chance * 1000) / 10}% chance).`
        : null;

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
          reason: event ? "Activated during this run." : witMissReason ?? "Fixture condition did not resolve before finish.",
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
          : witMissReason ?? (modeled
            ? sampledTargets.length
              ? "Sampled trigger window or condition gates did not line up in this run."
              : "Condition gates did not resolve before finish."
            : describeUnsupportedGlobalSkill(modelingReport)),
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
  hasOvertakeTarget: boolean;
  justEnteredLastStraight: boolean;
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
    hasOvertakeTarget,
    justEnteredLastStraight,
    neighbors,
    standings,
  } = args;

  const orderedSkillIds = [...runner.resolvedSkillIds].sort((left, right) =>
    Number(requiresSameTickSkillActivation(globalSkillById.get(left)))
      - Number(requiresSameTickSkillActivation(globalSkillById.get(right))));

  for (const skillId of orderedSkillIds) {
    if (runner.triggers.triggeredSkillIds.has(skillId)) {
      continue;
    }

    const skill = skillById.get(skillId);

    if (skill) {
      if (runner.triggers.skillActivationRolls?.[skillId]?.passed === false) {
        continue;
      }
      const alternative = skill.alternatives.find((candidate) =>
        doesAlternativeTrigger(candidate, runner, segment, phase, setup.weather, random),
      );

      if (!alternative) {
        continue;
      }

      runner.triggers.triggeredSkillIds.add(skill.id);
      runner.triggers.activationHistory.push({
        skillId: skill.id,
        second: round(second),
        phase,
        distanceRate: (runner.distanceMeters / track.distanceMeters) * 100,
        recoveredStamina: alternative.effects.some(
          (effect) => effect.kind === "staminaRecovery" && effect.amount > 0,
        ),
      });
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

    if (runner.triggers.skillActivationRolls?.[skillId]?.passed === false) {
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
      activatedSkillCountStart: runner.triggers.activationHistory.filter(
        (activation) => activation.phase === "early",
      ).length,
      activatedSkillCountMiddle: runner.triggers.activationHistory.filter(
        (activation) => activation.phase === "middle",
      ).length,
      activatedSkillCountEndAfter: runner.triggers.activationHistory.filter(
        (activation) => activation.phase === "late" || activation.phase === "lastSpurt",
      ).length,
      activatedSkillCountLaterHalf: runner.triggers.activationHistory.filter(
        (activation) => activation.distanceRate >= 50,
      ).length,
      activatedHealSkillCount: runner.triggers.activationHistory.filter(
        (activation) => activation.recoveredStamina,
      ).length,
      ...getRushedOpponentCounts(runner, standings),
      phase,
      segment,
      order,
      runnerCount,
      orderRate: (order / Math.max(runnerCount, 1)) * 100,
      distanceRate: (runner.distanceMeters / track.distanceMeters) * 100,
      distanceDiffTop: getDistanceDiffTop(runner, standings),
      distanceDiffRate: getDistanceDiffRate(runner, standings),
      remainDistance: Math.max(track.distanceMeters - runner.distanceMeters, 0),
      hpPercent: (runner.stamina / Math.max(runner.maxStamina, 1)) * 100,
      strategy: runner.build.strategy,
      weather: setup.weather,
      season: setup.season ?? "spring",
      popularityRank: runner.build.popularityRank,
      gateBlock: runner.build.gateBlock,
      runningStyleEqualPopularityOne:
        setup.runners.find((entry) => entry.popularityRank === 1)?.strategy === runner.build.strategy,
      sameSkillHorseCount: standings.filter((standing) =>
        standing.runner.resolvedSkillIds.includes(skillId),
      ).length,
      temptationCount: runner.rush.count,
      competeFightCount: runner.duel.count,
      groundCondition: setup.groundCondition,
      surface: track.surface,
      distanceCategory: track.distanceCategory,
      isBasisDistance: track.distanceMeters % 400 === 0,
      isFinalCornerLaterHalf: isRunnerInFinalCornerLaterHalf(segment, runner.distanceMeters),
      hasEnteredFinalCorner: runner.spatial.hasEnteredFinalCorner,
      isBadStart: runner.isBadStart,
      isLastStraight: justEnteredLastStraight,
      isLastStraightSegment: Boolean(segment?.tags?.includes("finalStraight")),
      isBehindIn: Boolean(
        neighbors.behindRunner && neighbors.behindRunner.spatial.lane < runner.spatial.lane,
      ),
      isSurrounded: isRunnerSurrounded(runner, standings),
      isTemptation: runner.rush.active,
      isActivateAnySkill: runner.triggers.activationHistory.some(
        (activation) => activation.second === round(second) && activation.skillId !== skillId,
      ),
      isActivateHealSkill: runner.triggers.activationHistory.some(
        (activation) => activation.second === round(second) && activation.recoveredStamina,
      ),
      rotation: track.direction ?? "straight",
      trackId: track.venueId,
      laneType: getLaneType(runner),
      isMoveLane: runner.spatial.moveLane,
      changeOrder,
      changeOrderUpMiddle: runner.spatial.overtakesMiddle,
      changeOrderUpEndAfter: runner.spatial.overtakesLateRace,
      changeOrderUpFinalCornerAfter: runner.spatial.overtakesAfterFinalCorner,
      isOvertake: hasOvertakeTarget,
      overtakeTargetTime: runner.spatial.asOvertakeTargetSeconds,
      overtakeTargetNoOrderUpTime: runner.spatial.overtakeTargetSeconds,
      orderRateIn20Continue: runner.spatial.orderRateIn20Continue,
      orderRateIn50Continue: runner.spatial.orderRateIn50Continue,
      orderRateIn80Continue: runner.spatial.orderRateIn80Continue,
      orderRateOut40Continue: runner.spatial.orderRateOut40Continue,
      orderRateOut50Continue: runner.spatial.orderRateOut50Continue,
      orderRateOut70Continue: runner.spatial.orderRateOut70Continue,
      ...getRunningStyleCounts(runner, setup.runners),
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
    runner.triggers.activationHistory.push({
      skillId,
      second: round(second),
      phase,
      distanceRate: (runner.distanceMeters / track.distanceMeters) * 100,
      recoveredStamina: activation.effects.staminaRecoveryRatio > 0,
    });
    applyResolvedEffects(
      runner,
      skillId,
      second,
      activation,
      selectPressureTarget(runner, standings),
      selectOpponentEffectTargets(runner, standings, activation.conditionSummary),
    );
    skillEvents.push({
      second: round(second),
      runnerId: runner.build.id,
      skillId,
      skillName: globalSkill.name,
      message: `${runner.build.name} activated ${globalSkill.name} (${describeResolvedEffects(activation.effects)})`,
      source: "global",
    });
    forceRareSkillActivations({
      runner,
      sourceSkillId: skillId,
      count: activation.effects.forcedRareSkillCount,
      context,
      second,
      phase,
      random,
      globalSkillById,
      skillEvents,
      standings,
      track,
    });
  }
}

function forceRareSkillActivations(args: {
  runner: RuntimeRunner;
  sourceSkillId: string;
  count: number;
  context: GlobalSkillContext;
  second: number;
  phase: RacePhase;
  random: () => number;
  globalSkillById: Map<string, GlobalSkill>;
  skillEvents: SkillEvent[];
  standings: Array<{ runner: RuntimeRunner; order: number }>;
  track: Track;
}) {
  const {
    runner,
    sourceSkillId,
    count,
    context,
    second,
    phase,
    random,
    globalSkillById,
    skillEvents,
    standings,
    track,
  } = args;

  if (count <= 0) return;

  const candidates = runner.resolvedSkillIds
    .filter((skillId) => skillId !== sourceSkillId && !runner.triggers.triggeredSkillIds.has(skillId))
    .map((skillId) => ({ skillId, skill: globalSkillById.get(skillId) }))
    .filter((entry): entry is { skillId: string; skill: GlobalSkill } => entry.skill?.rarity === "rare")
    .map((entry) => ({
      ...entry,
      activation: resolveForcedGlobalSkillActivation(entry.skill, {
        ...context,
        skillRandomState: runner.triggers.randomProfiles[entry.skillId],
      }),
    }))
    .filter((entry) => entry.activation !== null)
    .sort((left, right) => left.skillId.localeCompare(right.skillId));

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  for (const candidate of candidates.slice(0, count)) {
    const activation = candidate.activation!;
    runner.triggers.triggeredSkillIds.add(candidate.skillId);
    runner.triggers.activationHistory.push({
      skillId: candidate.skillId,
      second: round(second),
      phase,
      distanceRate: (runner.distanceMeters / track.distanceMeters) * 100,
      recoveredStamina: activation.effects.staminaRecoveryRatio > 0,
    });
    applyResolvedEffects(
      runner,
      candidate.skillId,
      second,
      activation,
      selectPressureTarget(runner, standings),
    );
    skillEvents.push({
      second: round(second),
      runnerId: runner.build.id,
      skillId: candidate.skillId,
      skillName: candidate.skill.name,
      message: `${runner.build.name} activated ${candidate.skill.name} (forced by 564 Escapades)`,
      source: "global",
    });
  }
}

function requiresSameTickSkillActivation(skill: GlobalSkill | undefined) {
  return skill?.conditionGroups.some((group) =>
    [group.precondition, group.condition].some((expression) =>
      expression?.includes("is_activate_any_skill") || expression?.includes("is_activate_heal_skill"),
    ),
  ) ?? false;
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

function isRunnerInFinalCornerLaterHalf(
  segment: TrackSegment | undefined,
  distanceMeters: number,
): boolean {
  if (!segment?.tags?.includes("finalCorner")) return false;

  return distanceMeters >= (segment.startMeters + segment.endMeters) / 2;
}

function updateOvertakeHistory(
  runner: RuntimeRunner,
  changeOrder: number,
  phase: RacePhase,
  segment: TrackSegment | undefined,
) {
  if (segment?.tags?.includes("finalCorner")) {
    runner.spatial.hasEnteredFinalCorner = true;
  }

  const overtakes = Math.max(-changeOrder, 0);
  if (overtakes === 0) return;

  if (phase === "middle") runner.spatial.overtakesMiddle += overtakes;
  if (phase === "late" || phase === "lastSpurt") runner.spatial.overtakesLateRace += overtakes;
  if (runner.spatial.hasEnteredFinalCorner) runner.spatial.overtakesAfterFinalCorner += overtakes;
}

function getDistanceDiffTop(
  runner: RuntimeRunner,
  standings: Array<{ runner: RuntimeRunner; order: number }>,
) {
  const leaderDistance = standings[0]?.runner.distanceMeters ?? runner.distanceMeters;
  return Math.max(leaderDistance - runner.distanceMeters, 0);
}

function getDistanceDiffRate(
  runner: RuntimeRunner,
  standings: Array<{ runner: RuntimeRunner; order: number }>,
) {
  const leaderDistance = standings[0]?.runner.distanceMeters ?? runner.distanceMeters;
  const lastDistance = standings.at(-1)?.runner.distanceMeters ?? runner.distanceMeters;
  const fieldSpread = leaderDistance - lastDistance;

  return fieldSpread > 0 ? ((leaderDistance - runner.distanceMeters) / fieldSpread) * 100 : 0;
}

function updateOvertakeTargetState(
  runner: RuntimeRunner,
  standings: Array<{ runner: RuntimeRunner; order: number }>,
  tickSeconds: number,
) {
  const others = standings.map((standing) => standing.runner).filter((candidate) => candidate !== runner);
  const hasTarget = others.some((candidate) => canCatchRunner(runner, candidate));
  const isTarget = others.some((candidate) => canCatchRunner(candidate, runner));

  runner.spatial.overtakeTargetSeconds = hasTarget
    ? runner.spatial.overtakeTargetSeconds + tickSeconds
    : 0;
  runner.spatial.asOvertakeTargetSeconds = isTarget
    ? runner.spatial.asOvertakeTargetSeconds + tickSeconds
    : 0;

  return hasTarget;
}

function canCatchRunner(chaser: RuntimeRunner, target: RuntimeRunner) {
  const gap = target.distanceMeters - chaser.distanceMeters;
  const closingSpeed = chaser.speed - target.speed;
  return gap > 0 && gap <= 20 && closingSpeed > 0 && gap / closingSpeed <= 15;
}

function isRunnerSurrounded(
  runner: RuntimeRunner,
  standings: Array<{ runner: RuntimeRunner; order: number }>,
) {
  const others = standings.map((standing) => standing.runner).filter((candidate) => candidate !== runner);
  const front = others.some((candidate) => {
    const gap = candidate.distanceMeters - runner.distanceMeters;
    return gap > 0 && gap <= 3 && Math.abs(candidate.spatial.lane - runner.spatial.lane) < 1.5;
  });
  const behind = others.some((candidate) => {
    const gap = runner.distanceMeters - candidate.distanceMeters;
    return gap > 0 && gap <= 3 && Math.abs(candidate.spatial.lane - runner.spatial.lane) < 1.5;
  });
  const side = others.some((candidate) => {
    const laneGap = Math.abs(candidate.spatial.lane - runner.spatial.lane);
    return Math.abs(candidate.distanceMeters - runner.distanceMeters) < 1.5 && laneGap > 0 && laneGap < 3;
  });

  return front && behind && side;
}

function getRunningStyleCounts(runner: RuntimeRunner, builds: RaceSetup["runners"]) {
  const otherBuilds = builds.filter((build) => build.id !== runner.build.id);
  const sameCount = builds.filter((build) => build.strategy === runner.build.strategy).length;

  return {
    runningStyleCountFrontOthers: otherBuilds.filter((build) => build.strategy === "front").length,
    runningStyleCountPaceOthers: otherBuilds.filter((build) => build.strategy === "pace").length,
    runningStyleCountLateOthers: otherBuilds.filter((build) => build.strategy === "late").length,
    runningStyleCountEndOthers: otherBuilds.filter((build) => build.strategy === "end").length,
    runningStyleCountSame: sameCount,
    runningStyleCountSameRate: (sameCount / Math.max(builds.length, 1)) * 100,
  };
}

function getRushedOpponentCounts(
  runner: RuntimeRunner,
  standings: Array<{ runner: RuntimeRunner; order: number }>,
) {
  const rushedOpponents = standings
    .map((standing) => standing.runner)
    .filter((candidate) => candidate.rush.active && areRaceOpponents(runner.build, candidate.build));

  return {
    temptationOpponentCountBehind: rushedOpponents.filter(
      (candidate) => candidate.distanceMeters < runner.distanceMeters,
    ).length,
    temptationOpponentCountInfront: rushedOpponents.filter(
      (candidate) => candidate.distanceMeters > runner.distanceMeters,
    ).length,
    rushedFrontOpponentCount: rushedOpponents.filter((candidate) => candidate.build.strategy === "front").length,
    rushedPaceOpponentCount: rushedOpponents.filter((candidate) => candidate.build.strategy === "pace").length,
    rushedLateOpponentCount: rushedOpponents.filter((candidate) => candidate.build.strategy === "late").length,
    rushedEndOpponentCount: rushedOpponents.filter((candidate) => candidate.build.strategy === "end").length,
  };
}

function updateContinuousOrderRateHistory(
  runner: RuntimeRunner,
  second: number,
  order: number,
  runnerCount: number,
) {
  if (second < 5) return;

  const orderRate = (order / Math.max(runnerCount, 1)) * 100;
  runner.spatial.orderRateIn20Continue &&= orderRate <= 20;
  runner.spatial.orderRateIn50Continue &&= orderRate <= 50;
  runner.spatial.orderRateIn80Continue &&= orderRate <= 80;
  runner.spatial.orderRateOut40Continue &&= orderRate > 40;
  runner.spatial.orderRateOut50Continue &&= orderRate > 50;
  runner.spatial.orderRateOut70Continue &&= orderRate > 70;
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
    currentSpeed: 0,
    naturalDeceleration: false,
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
  opponentTargets: RuntimeRunner[] = [],
) {
  if (!activation) {
    return;
  }

  runner.stamina = Math.min(
    runner.maxStamina,
    runner.stamina + runner.maxStamina * activation.effects.staminaRecoveryRatio,
  );

  if (activation.effects.opponentStaminaDrainRatio > 0) {
    for (const target of opponentTargets) {
      target.stamina = Math.max(
        0,
        target.stamina - target.maxStamina * activation.effects.opponentStaminaDrainRatio,
      );
    }
  }

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
      currentSpeed: 0,
      naturalDeceleration: false,
      acceleration: 0,
      navigation: 0,
      stats: {},
    });
  }

  runner.activeEffects.push({
    skillId,
    expiresAt: second + activation.durationSeconds,
    speed: activation.effects.speed,
    currentSpeed: activation.effects.currentSpeed + activation.effects.naturalDecelerationCurrentSpeed,
    naturalDeceleration: activation.effects.naturalDecelerationCurrentSpeed !== 0,
    acceleration: activation.effects.acceleration,
    navigation: activation.effects.navigation,
    stats: activation.effects.stats,
  });
}

function selectPressureTarget(
  runner: RuntimeRunner,
  standings: Array<{ runner: RuntimeRunner; order: number }>,
) {
  const opponentStandings = standings.filter((standing) =>
    areRaceOpponents(runner.build, standing.runner.build));
  const traffic = buildTrafficSnapshot(opponentStandings, runner);
  const directAhead = traffic.frontRivals[0]?.runner;
  if (directAhead) {
    return directAhead;
  }
  return traffic.sideRivals[0]?.runner;
}

function selectOpponentEffectTargets(
  runner: RuntimeRunner,
  standings: Array<{ runner: RuntimeRunner; order: number }>,
  conditionSummary: string,
) {
  const opponents = standings
    .map((standing) => standing.runner)
    .filter((candidate) => candidate.rush.active && areRaceOpponents(runner.build, candidate.build));

  if (conditionSummary.includes("temptation_opponent_count_behind")) {
    return opponents.filter((candidate) => candidate.distanceMeters < runner.distanceMeters);
  }
  if (conditionSummary.includes("temptation_opponent_count_infront")) {
    return opponents.filter((candidate) => candidate.distanceMeters > runner.distanceMeters);
  }
  return [];
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
}) {
  const parts: string[] = [];

  if (effects.speed) parts.push(`${effects.speed > 0 ? "+" : ""}${effects.speed.toFixed(2)} speed`);
  if (effects.currentSpeed) {
    parts.push(`${effects.currentSpeed > 0 ? "+" : ""}${effects.currentSpeed.toFixed(2)} current speed`);
  }
  if (effects.naturalDecelerationCurrentSpeed) {
    parts.push(`${effects.naturalDecelerationCurrentSpeed > 0 ? "+" : ""}${effects.naturalDecelerationCurrentSpeed.toFixed(2)} surge`);
  }
  if (effects.forcedRareSkillCount) parts.push(`force ${effects.forcedRareSkillCount} rare skill${effects.forcedRareSkillCount === 1 ? "" : "s"}`);
  if (effects.acceleration) parts.push(`${effects.acceleration > 0 ? "+" : ""}${effects.acceleration.toFixed(2)} accel`);
  if (effects.navigation) parts.push(`${effects.navigation > 0 ? "+" : ""}${effects.navigation.toFixed(2)} navigation`);
  if (effects.pressure) parts.push(`${effects.pressure > 0 ? "-" : ""}${effects.pressure.toFixed(2)} rival speed`);
  if (effects.startDelayMultiplier !== 1) parts.push(`${effects.startDelayMultiplier.toFixed(2)}× start delay`);
  if (effects.staminaRecoveryRatio) {
    parts.push(`${effects.staminaRecoveryRatio > 0 ? "+" : ""}${(effects.staminaRecoveryRatio * 100).toFixed(1)}% stamina`);
  }
  if (effects.opponentStaminaDrainRatio) {
    parts.push(`-${(effects.opponentStaminaDrainRatio * 100).toFixed(1)}% opponent stamina`);
  }

  for (const [key, value] of Object.entries(effects.stats)) {
    if (!value) continue;
    parts.push(`${value > 0 ? "+" : ""}${Math.round(value)} ${key}`);
  }

  return parts.join(", ") || "condition met";
}

function toDuelParticipant(runner: RuntimeRunner) {
  return {
    id: runner.build.id,
    distanceMeters: runner.distanceMeters,
    speed: getActualRunnerSpeed(runner),
    hpPercent: (runner.stamina / Math.max(runner.maxStamina, 1)) * 100,
  };
}

function getActualRunnerSpeed(runner: RuntimeRunner) {
  return runner.speed + runner.activeEffects.reduce((sum, effect) => sum + effect.currentSpeed, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
