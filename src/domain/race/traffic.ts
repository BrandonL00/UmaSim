import type { RuntimeRunner, StandingSnapshot } from "./engineState";

export type TrafficRivalCandidate = {
  runner: RuntimeRunner;
  distanceGap: number;
  laneGap: number;
  score: number;
};

export type TrafficSnapshot = {
  frontRivals: TrafficRivalCandidate[];
  sideRivals: TrafficRivalCandidate[];
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

export type TrafficMovementPenalty = {
  speedCapFactor: number;
  accelerationPenalty: number;
  laneChangeResistance: number;
};

export type TrafficStateLike = Pick<
  TrafficSnapshot,
  "frontTrafficLevel" | "sideTrafficLevel" | "crowdDensity" | "boxedIn"
>;

export function buildTrafficSnapshot(
  standings: StandingSnapshot[],
  runner: RuntimeRunner,
): TrafficSnapshot {
  const frontRivals = standings
    .filter((candidate) => candidate.runner !== runner && candidate.runner.distanceMeters > runner.distanceMeters)
    .map((candidate) => createCandidate(runner, candidate.runner))
    .filter((candidate) => candidate.distanceGap <= 3 && candidate.laneGap <= 1)
    .sort(compareCandidates);

  const sideRivals = standings
    .filter((candidate) => candidate.runner !== runner)
    .map((candidate) => createCandidate(runner, candidate.runner))
    .filter(
      (candidate) =>
        candidate.distanceGap <= 1.6 &&
        candidate.laneGap === 1,
    )
    .sort(compareCandidates);

  const innerLaneBlocked = sideRivals.some((candidate) => candidate.runner.spatial.lane < runner.spatial.lane);
  const outerLaneBlocked = sideRivals.some((candidate) => candidate.runner.spatial.lane > runner.spatial.lane);
  const frontTrafficLevel = normalizeTraffic(frontRivals.length, 3);
  const sideTrafficLevel = normalizeTraffic(sideRivals.length, 2);
  const crowdDensity = normalizeTraffic(frontRivals.length + sideRivals.length, 4);
  const boxedIn = frontTrafficLevel >= 0.66 && innerLaneBlocked && outerLaneBlocked;

  return {
    frontRivals,
    sideRivals,
    frontTrafficLevel,
    sideTrafficLevel,
    crowdDensity,
    frontRivalCount: frontRivals.length,
    sideRivalCount: sideRivals.length,
    innerLaneBlocked,
    outerLaneBlocked,
    escapeRouteAvailable: !boxedIn && (!innerLaneBlocked || !outerLaneBlocked),
    boxedIn,
  };
}

function createCandidate(source: RuntimeRunner, target: RuntimeRunner): TrafficRivalCandidate {
  const distanceGap = Math.abs(target.distanceMeters - source.distanceMeters) / 2.5;
  const laneGap = Math.abs(target.spatial.lane - source.spatial.lane);

  return {
    runner: target,
    distanceGap,
    laneGap,
    score: distanceGap * 1.8 + laneGap * 1.2,
  };
}

function compareCandidates(left: TrafficRivalCandidate, right: TrafficRivalCandidate) {
  return left.score - right.score || left.runner.build.id.localeCompare(right.runner.build.id);
}

function normalizeTraffic(count: number, maxCount: number) {
  return Math.min(count / maxCount, 1);
}

export function resolveTrafficMovementPenalty(
  traffic: TrafficStateLike,
  navigationBonus: number,
): TrafficMovementPenalty {
  const navigationRelief = clamp(navigationBonus * 4, 0, 0.18);
  const frontPenalty = traffic.frontTrafficLevel * 0.09;
  const sidePenalty = traffic.sideTrafficLevel * 0.04;
  const boxedPenalty = traffic.boxedIn ? 0.08 : 0;
  const totalSpeedPenalty = clamp(frontPenalty + sidePenalty + boxedPenalty - navigationRelief, 0, 0.2);
  const accelerationPenalty = clamp(
    traffic.frontTrafficLevel * 0.02 + traffic.sideTrafficLevel * 0.01 + (traffic.boxedIn ? 0.015 : 0) - navigationBonus * 0.2,
    0,
    0.05,
  );
  const laneChangeResistance = clamp(
    traffic.sideTrafficLevel * 0.25 + (traffic.boxedIn ? 0.25 : 0) - navigationBonus * 1.2,
    0,
    0.5,
  );

  return {
    speedCapFactor: 1 - totalSpeedPenalty,
    accelerationPenalty,
    laneChangeResistance,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
