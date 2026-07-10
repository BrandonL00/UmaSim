import { describe, expect, it } from "vitest";
import type { RuntimeRunner, StandingSnapshot } from "../domain/race/engineState";
import { buildTrafficSnapshot, resolveTrafficMovementPenalty } from "../domain/race/traffic";

function makeRunner(id: string, lane: number, distanceMeters: number): RuntimeRunner {
  return {
    build: {
      id,
      name: id,
      cardId: 1,
      characterId: 1,
      characterName: id,
      outfitTitle: "Base",
      buildName: `${id} Build`,
      variant: null,
      strategy: "pace",
      mood: "normal",
      uniqueSkillId: "missing",
      uniqueSkillLevel: 1,
      stats: { speed: 800, stamina: 700, power: 700, guts: 500, wit: 500 },
      aptitudes: {
        surface: { turf: "A", dirt: "G" },
        distance: { sprint: "A", mile: "A", medium: "B", long: "C" },
        strategy: { front: "C", pace: "A", late: "B", end: "D" },
      },
      skillIds: [],
    },
    adjustedStats: { speed: 800, stamina: 700, power: 700, guts: 500, wit: 500 },
    resolvedSkillIds: [],
    distanceMeters,
    speed: 10,
    targetSpeed: 10,
    stamina: 1000,
    maxStamina: 1000,
    topSpeed: 10,
    activeEffects: [],
    speedTotal: 0,
    tickCount: 0,
    staminaSpent: 0,
    spatial: {
      lastEvaluatedDistanceMeters: distanceMeters,
      lane,
      targetLane: lane,
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
      triggeredSkillIds: new Set(),
      randomProfiles: {},
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

describe("traffic snapshot", () => {
  it("marks a runner boxed in when front and both sides are crowded", () => {
    const runner = makeRunner("self", 1, 100);
    const ahead = makeRunner("ahead", 1, 102);
    const inner = makeRunner("inner", 0, 100.8);
    const outer = makeRunner("outer", 2, 100.6);

    const standings: StandingSnapshot[] = [
      { runner: ahead, order: 1 },
      { runner: outer, order: 2 },
      { runner: inner, order: 3 },
      { runner, order: 4 },
    ];

    const traffic = buildTrafficSnapshot(standings, runner);

    expect(traffic.frontRivalCount).toBeGreaterThan(0);
    expect(traffic.sideRivalCount).toBeGreaterThanOrEqual(2);
    expect(traffic.boxedIn).toBe(true);
    expect(traffic.escapeRouteAvailable).toBe(false);
  });

  it("applies stronger movement penalties in boxed-in traffic and lets navigation offset them", () => {
    const runner = makeRunner("self", 1, 100);
    const ahead = makeRunner("ahead", 1, 102);
    const inner = makeRunner("inner", 0, 100.8);
    const outer = makeRunner("outer", 2, 100.6);

    const standings: StandingSnapshot[] = [
      { runner: ahead, order: 1 },
      { runner: outer, order: 2 },
      { runner: inner, order: 3 },
      { runner, order: 4 },
    ];

    const traffic = buildTrafficSnapshot(standings, runner);
    const noNavigation = resolveTrafficMovementPenalty(traffic, 0);
    const withNavigation = resolveTrafficMovementPenalty(traffic, 0.05);

    expect(noNavigation.speedCapFactor).toBeLessThan(1);
    expect(noNavigation.accelerationPenalty).toBeGreaterThan(0);
    expect(noNavigation.laneChangeResistance).toBeGreaterThan(0);
    expect(withNavigation.speedCapFactor).toBeGreaterThan(noNavigation.speedCapFactor);
    expect(withNavigation.accelerationPenalty).toBeLessThanOrEqual(noNavigation.accelerationPenalty);
    expect(withNavigation.laneChangeResistance).toBeLessThan(noNavigation.laneChangeResistance);
  });
});
