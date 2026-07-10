import { describe, expect, it } from "vitest";
import type { RuntimeRunner, RunnerNeighbors } from "../domain/race/engineState";
import { updateRunnerPathing } from "../domain/race/pathing";

function makeRunner(): RuntimeRunner {
  return {
    build: {
      id: "runner",
      name: "Runner",
      cardId: 1,
      characterId: 1,
      characterName: "Runner",
      outfitTitle: "Base",
      buildName: "Runner Build",
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
    distanceMeters: 0,
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

const blockedFrontNeighbors: RunnerNeighbors = {
  bashinDiffInfront: 0.5,
  bashinDiffBehind: 0.5,
  nearCount: 0,
  infrontNearLane: true,
  behindNearLane: true,
  behindNearLaneSet1: true,
  blockedFront: true,
  blockedSide: false,
};

describe("pathing", () => {
  it("moves outward when the runner is blocked in front", () => {
    const runner = makeRunner();

    updateRunnerPathing(runner, blockedFrontNeighbors, 9);
    expect(runner.spatial.targetLane).toBe(1);
    expect(runner.spatial.moveLane).toBe(2);

    updateRunnerPathing(runner, blockedFrontNeighbors, 9);
    expect(runner.spatial.lane).toBe(1);
  });

  it("drifts back inward once the path is clear", () => {
    const runner = makeRunner();
    runner.spatial.lane = 1;
    runner.spatial.targetLane = 1;
    runner.spatial.laneChangeProgress = 0;

    updateRunnerPathing(runner, { ...blockedFrontNeighbors, blockedFront: false }, 9);
    expect(runner.spatial.targetLane).toBe(0);
    expect(runner.spatial.moveLane).toBe(1);
  });

  it("applies navigation bonuses to lane-change progress", () => {
    const runner = makeRunner();

    updateRunnerPathing(runner, blockedFrontNeighbors, 9, 0.6);
    expect(runner.spatial.targetLane).toBe(1);
    expect(runner.spatial.lane).toBe(1);
  });

  it("moves outward when pressured by a rival", () => {
    const runner = makeRunner();
    runner.rival.pressuredByIds = ["rival-a"];

    updateRunnerPathing(runner, { ...blockedFrontNeighbors, blockedFront: false }, 9, 0);
    expect(runner.spatial.targetLane).toBe(1);
  });

  it("chooses an escape lane when boxed in", () => {
    const runner = makeRunner();
    runner.spatial.lane = 1;
    runner.traffic.boxedIn = true;
    runner.traffic.outerLaneBlocked = false;
    runner.traffic.innerLaneBlocked = true;

    updateRunnerPathing(runner, { ...blockedFrontNeighbors, blockedFront: false }, 9, 0);
    expect(runner.spatial.targetLane).toBe(2);
  });

  it("crowding resistance slows lane-change progress", () => {
    const runner = makeRunner();

    updateRunnerPathing(runner, blockedFrontNeighbors, 9, 0, 0.45);
    expect(runner.spatial.targetLane).toBe(1);
    expect(runner.spatial.lane).toBe(0);
    expect(runner.spatial.laneChangeProgress).toBeLessThan(0.2);
  });
});
