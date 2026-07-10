import { describe, expect, it } from "vitest";
import { createGlobalSkillEngineMap, type GlobalSkill } from "../data/skills";
import {
  canModelGlobalSkill,
  getGlobalSkillModelingReport,
  resolveGlobalSkillActivation,
  type GlobalSkillContext,
} from "../domain/race/globalSkillModel";

const baseContext: GlobalSkillContext = {
  second: 12,
  elapsedMs: 12000,
  previousDistanceMeters: 480,
  distanceMeters: 520,
  activatedSkillCount: 7,
  phase: "middle",
  segment: {
    startMeters: 400,
    endMeters: 600,
    kind: "corner",
    slope: "flat",
  },
  order: 3,
  runnerCount: 9,
  orderRate: 33.3,
  distanceRate: 52,
  remainDistance: 900,
  hpPercent: 82,
  strategy: "pace",
  weather: "sunny",
  groundCondition: "firm",
  surface: "turf",
  distanceCategory: "mile",
  rotation: "clockwise",
  trackId: 10001,
  laneType: 0,
  isMoveLane: 2,
  changeOrder: 0,
  isOvertake: false,
  bashinDiffInfront: 0.8,
  bashinDiffBehind: 0.7,
  nearCount: 1,
  infrontNearLaneTime: 1.5,
  behindNearLaneTime: 2,
  behindNearLaneTimeSet1: 2,
  blockedFront: true,
  blockedFrontSeconds: 1.5,
  blockedSideSeconds: 0,
  skillRandomState: {
    phaseRandomTargets: { 1: 52 },
    distanceRateAfterRandomTargets: { 50: 52 },
    straightRandom: {
      segmentStartMeters: 450,
      segmentEndMeters: 620,
      targetMeters: 500,
    },
    allCornerRandom: {
      segmentStartMeters: 450,
      segmentEndMeters: 620,
      targetMeters: 500,
    },
    finalCornerRandom: {
      segmentStartMeters: 450,
      segmentEndMeters: 620,
      targetMeters: 500,
    },
  },
};

function makeSkill(condition: string): GlobalSkill {
  return {
    id: "skill-test",
    name: "Skill Test",
    oldEnglishName: null,
    japaneseName: null,
    description: "Test skill",
    oldEnglishDescription: null,
    japaneseDescription: null,
    rarity: "normal",
    rarityValue: null,
    iconId: null,
    cost: null,
    activation: null,
    tags: [],
    versionIds: [],
    prerequisiteIds: [],
    supersedesIds: [],
    conditionGroups: [
      {
        condition,
        precondition: null,
        baseTimeMs: 20000,
        cooldownMs: null,
        effects: [{ type: 27, value: 1500 }],
      },
    ],
    geneVersion: null,
    sourceIds: {
      characterIds: [],
      characterEvoIds: [],
      scenarioIds: [],
    },
    availability: {
      globalReleased: true,
      hasGlobalConditionOverride: false,
      hasGlobalSourceOverride: false,
    },
  };
}

describe("globalSkillModel lane tokens", () => {
  it("supports lane_type conditions", () => {
    const activation = resolveGlobalSkillActivation(makeSkill("lane_type==0"), baseContext);
    const miss = resolveGlobalSkillActivation(makeSkill("lane_type==2"), baseContext);

    expect(activation).not.toBeNull();
    expect(miss).toBeNull();
  });

  it("supports is_move_lane conditions", () => {
    const activation = resolveGlobalSkillActivation(makeSkill("is_move_lane==2"), baseContext);
    const miss = resolveGlobalSkillActivation(makeSkill("is_move_lane==1"), baseContext);

    expect(activation).not.toBeNull();
    expect(miss).toBeNull();
  });

  it("global-skill-unsupported-expression-is-rejected", () => {
    const unsupported = makeSkill("unresearched_hidden_flag==1");

    expect(canModelGlobalSkill(unsupported)).toBe(false);
    expect(resolveGlobalSkillActivation(unsupported, baseContext)).toBeNull();
    expect(getGlobalSkillModelingReport(unsupported).unsupportedConditionTokens).toEqual(["unresearched_hidden_flag==1"]);
  });

  it("reports unsupported effect types without modeling the skill", () => {
    const unsupported = {
      ...makeSkill("always==1"),
      conditionGroups: [{ ...makeSkill("always==1").conditionGroups[0]!, effects: [{ type: 99, value: 100 }] }],
    };

    expect(getGlobalSkillModelingReport(unsupported).unsupportedEffectTypes).toEqual([99]);
    expect(canModelGlobalSkill(unsupported)).toBe(false);
  });

  it("supports near-lane timer conditions and navigation effects", () => {
    const activation = resolveGlobalSkillActivation(
      {
        ...makeSkill("infront_near_lane_time>=1&behind_near_lane_time_set1>=1"),
        conditionGroups: [
          {
            condition: "infront_near_lane_time>=1&behind_near_lane_time_set1>=1",
            precondition: null,
            baseTimeMs: 20000,
            cooldownMs: null,
            effects: [{ type: 28, value: 350 }],
          },
        ],
      },
      baseContext,
    );

    expect(activation).not.toBeNull();
    expect(activation?.effects.navigation).toBeCloseTo(0.035);
  });

  it("supports pressure effects from type 21", () => {
    const activation = resolveGlobalSkillActivation(
      {
        ...makeSkill("distance_rate>=50&order_rate>=40&order_rate<=70"),
        conditionGroups: [
          {
            condition: "distance_rate>=50&order_rate>=40&order_rate<=70",
            precondition: null,
            baseTimeMs: 20000,
            cooldownMs: null,
            effects: [{ type: 21, value: -500 }],
          },
        ],
      },
      {
        ...baseContext,
        orderRate: 55.5,
      },
    );

    expect(activation).not.toBeNull();
    expect(activation?.effects.pressure).toBeCloseTo(0.05);
  });

  it("treats phase_random as a sampled trigger window instead of a pure phase check", () => {
    const activation = resolveGlobalSkillActivation(makeSkill("phase_random==1"), baseContext);
    const miss = resolveGlobalSkillActivation(
      makeSkill("phase_random==1"),
      {
        ...baseContext,
        previousDistanceMeters: 420,
        distanceMeters: 430,
        distanceRate: 43,
      },
    );

    expect(activation).not.toBeNull();
    expect(miss).toBeNull();
  });

  it("supports sampled distance_rate_after_random windows", () => {
    const activation = resolveGlobalSkillActivation(makeSkill("distance_rate_after_random==50"), baseContext);
    const miss = resolveGlobalSkillActivation(
      makeSkill("distance_rate_after_random==50"),
      {
        ...baseContext,
        skillRandomState: {
          ...baseContext.skillRandomState,
          distanceRateAfterRandomTargets: { 50: 68 },
        },
      },
    );

    expect(activation).not.toBeNull();
    expect(miss).toBeNull();
  });

  it("supports sampled straight and corner random tokens", () => {
    expect(resolveGlobalSkillActivation(makeSkill("straight_random==1"), {
      ...baseContext,
      segment: {
        startMeters: 450,
        endMeters: 620,
        kind: "straight",
        slope: "flat",
      },
    })).not.toBeNull();

    expect(resolveGlobalSkillActivation(makeSkill("all_corner_random==1"), baseContext)).not.toBeNull();
  });

  it("models inherited unique gene versions and activate_count_all gates", () => {
    const skills = createGlobalSkillEngineMap();
    const barcarole = skills.get("gt-910151");

    expect(barcarole?.name).toBe("Barcarole of Blessings");
    expect(resolveGlobalSkillActivation(barcarole!, {
      ...baseContext,
      remainDistance: 400,
      orderRate: 35,
      activatedSkillCount: 7,
    })).not.toBeNull();
    expect(resolveGlobalSkillActivation(barcarole!, {
      ...baseContext,
      remainDistance: 400,
      orderRate: 35,
      activatedSkillCount: 3,
    })?.effects.speed).toBeLessThan(
      resolveGlobalSkillActivation(barcarole!, {
        ...baseContext,
        remainDistance: 400,
        orderRate: 35,
        activatedSkillCount: 7,
      })!.effects.speed,
    );
  });
});
