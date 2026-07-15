import { describe, expect, it } from "vitest";
import { createGlobalSkillEngineMap, type GlobalSkill } from "../data/skills";
import {
  canModelGlobalSkill,
  getGlobalSkillModelingReport,
  resolveForcedGlobalSkillActivation,
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
  it("models rushed-opponent team conditions and targets the stamina drain away from the owner", () => {
    const activation = resolveGlobalSkillActivation(
      {
        ...makeSkill("temptation_opponent_count_behind>=1"),
        conditionGroups: [{
          ...makeSkill("temptation_opponent_count_behind>=1").conditionGroups[0]!,
          effects: [{ type: 9, value: -100 }],
        }],
      },
      { ...baseContext, temptationOpponentCountBehind: 2 },
    );

    expect(activation).not.toBeNull();
    expect(activation?.effects.opponentStaminaDrainRatio).toBeCloseTo(0.01);
    expect(activation?.effects.staminaRecoveryRatio).toBe(0);
  });

  it("supports strategy-specific rushed opponent counts", () => {
    const condition = "running_style_temptation_opponent_count_nige>=1&is_temptation==0";

    expect(resolveGlobalSkillActivation(
      makeSkill(condition),
      { ...baseContext, rushedFrontOpponentCount: 1, isTemptation: false },
    )).not.toBeNull();
    expect(resolveGlobalSkillActivation(
      makeSkill(condition),
      { ...baseContext, rushedFrontOpponentCount: 0, isTemptation: false },
    )).toBeNull();
  });

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

  it("models type 22 as an immediate surge with natural deceleration", () => {
    const skill: GlobalSkill = {
      ...makeSkill("always==1"),
      conditionGroups: [{
        ...makeSkill("always==1").conditionGroups[0]!,
        effects: [{ type: 22, value: 3500 }],
      }],
    };

    const activation = resolveGlobalSkillActivation(skill, baseContext);
    expect(activation?.effects.naturalDecelerationCurrentSpeed).toBeCloseTo(0.35);
    expect(activation?.effects.speed).toBe(0);
  });

  it("converts source base time to distance-scaled seconds", () => {
    const activation = resolveGlobalSkillActivation(makeSkill("always==1"), baseContext);

    // 20,000 source units = 2 base seconds; this context represents a 1,420 m course.
    expect(activation?.durationSeconds).toBeCloseTo(2.84);
  });

  it("models type 37 as a forced rare-skill count and can bypass conditions", () => {
    const skill: GlobalSkill = {
      ...makeSkill("unmodeled_condition==99"),
      conditionGroups: [{
        ...makeSkill("always==1").conditionGroups[0]!,
        condition: "unmodeled_condition==99",
        effects: [{ type: 37, value: 20000 }],
      }],
    };

    expect(resolveGlobalSkillActivation(skill, baseContext)).toBeNull();
    expect(resolveForcedGlobalSkillActivation(skill, baseContext)?.effects.forcedRareSkillCount).toBe(2);
  });

  it("samples random_lot once per skill profile", () => {
    expect(resolveGlobalSkillActivation(makeSkill("random_lot==50"), {
      ...baseContext,
      skillRandomState: { randomLotRoll: 49.99 },
    })).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("random_lot==50"), {
      ...baseContext,
      skillRandomState: { randomLotRoll: 50 },
    })).toBeNull();
  });

  it("supports fixed start delay, flat rush chance, and all-stat passive effects", () => {
    const skill: GlobalSkill = {
      ...makeSkill("always==1"),
      conditionGroups: [{
        ...makeSkill("always==1").conditionGroups[0]!,
        effects: [
          { type: 14, value: 850 },
          { type: 29, value: -30000 },
          { type: 32, value: 100000 },
        ],
      }],
    };
    const effects = resolveGlobalSkillActivation(skill, baseContext)?.effects;

    expect(effects?.fixedStartDelaySeconds).toBeCloseTo(0.085);
    expect(effects?.rushProbabilityModifier).toBeCloseTo(-0.03);
    expect(effects?.stats).toEqual({ speed: 10, stamina: 10, power: 10, guts: 10, wit: 10 });
  });

  it("supports exact course and final-corner geometry conditions", () => {
    expect(resolveGlobalSkillActivation(makeSkill("is_basis_distance==1"), {
      ...baseContext,
      isBasisDistance: true,
    })).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("is_basis_distance==1"), {
      ...baseContext,
      isBasisDistance: false,
    })).toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("is_finalcorner_laterhalf==1"), {
      ...baseContext,
      isFinalCornerLaterHalf: true,
    })).not.toBeNull();
  });

  it("supports activation counts by phase and recovery family", () => {
    const context = {
      ...baseContext,
      activatedSkillCountStart: 3,
      activatedSkillCountMiddle: 2,
      activatedHealSkillCount: 1,
    };

    expect(resolveGlobalSkillActivation(makeSkill("activate_count_start>=3"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("activate_count_middle>=2"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("activate_count_heal>=1"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("activate_count_heal>=2"), context)).toBeNull();
  });

  it("resolves start-delay multipliers and bad-start conditions", () => {
    const startSkill = {
      ...makeSkill("always==1"),
      conditionGroups: [{
        ...makeSkill("always==1").conditionGroups[0]!,
        baseTimeMs: 0,
        effects: [{ type: 10, value: 4000 }],
      }],
    };

    expect(resolveGlobalSkillActivation(startSkill, baseContext)?.effects.startDelayMultiplier).toBeCloseTo(0.4);
    expect(resolveGlobalSkillActivation(makeSkill("is_badstart==1"), {
      ...baseContext,
      isBadStart: true,
    })).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("is_badstart==1"), {
      ...baseContext,
      isBadStart: false,
    })).toBeNull();
  });

  it("supports leader-gap and overtake-history conditions", () => {
    const context = {
      ...baseContext,
      distanceDiffTop: 7.4,
      distanceDiffRate: 28,
      changeOrderUpMiddle: 2,
      changeOrderUpEndAfter: 3,
      changeOrderUpFinalCornerAfter: 1,
      isLastStraight: true,
    };

    expect(resolveGlobalSkillActivation(makeSkill("distance_diff_top>=7"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("distance_diff_top_float>=74"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("distance_diff_rate<=30"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("change_order_up_middle>=2"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("change_order_up_end_after>=3"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("change_order_up_finalcorner_after>=1"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("is_last_straight_onetime==1"), context)).not.toBeNull();
  });

  it("supports traffic, overtake-target, and strategy-field conditions", () => {
    const context = {
      ...baseContext,
      hasEnteredFinalCorner: true,
      isBehindIn: true,
      isSurrounded: true,
      overtakeTargetTime: 2,
      overtakeTargetNoOrderUpTime: 3,
      runningStyleCountFrontOthers: 1,
      runningStyleCountPaceOthers: 2,
      runningStyleCountLateOthers: 3,
      runningStyleCountEndOthers: 1,
      runningStyleCountSame: 3,
      runningStyleCountSameRate: 33.3,
    };

    for (const condition of [
      "is_finalcorner==1",
      "is_behind_in==1",
      "is_surrounded==1",
      "overtake_target_time>=2",
      "overtake_target_no_order_up_time>=3",
      "running_style_count_nige_otherself>=1",
      "running_style_count_senko_otherself>=2",
      "running_style_count_sashi_otherself>=3",
      "running_style_count_oikomi_otherself>=1",
      "running_style_count_same>=3",
      "running_style_count_same_rate>=30",
    ]) {
      expect(resolveGlobalSkillActivation(makeSkill(condition), context), condition).not.toBeNull();
    }
  });

  it("supports configured race seasons", () => {
    expect(resolveGlobalSkillActivation(makeSkill("season==2"), {
      ...baseContext,
      season: "summer",
    })).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("season==2"), {
      ...baseContext,
      season: "winter",
    })).toBeNull();
  });

  it("supports explicit popularity ranks and gate blocks", () => {
    const context = {
      ...baseContext,
      popularityRank: 4,
      gateBlock: 7,
    };

    expect(resolveGlobalSkillActivation(makeSkill("popularity>=4"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("post_number==7"), context)).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("post_number==7"), {
      ...baseContext,
      gateBlock: undefined,
    })).toBeNull();
  });

  it("supports continuous order bands and same-tick skill chaining", () => {
    const context = {
      ...baseContext,
      isActivateAnySkill: true,
      orderRateIn20Continue: true,
      orderRateIn50Continue: true,
      orderRateIn80Continue: true,
      orderRateOut40Continue: true,
      orderRateOut50Continue: true,
      orderRateOut70Continue: true,
    };

    for (const condition of [
      "is_activate_any_skill==1",
      "order_rate_in20_continue==1",
      "order_rate_in50_continue==1",
      "order_rate_in80_continue==1",
      "order_rate_out40_continue==1",
      "order_rate_out50_continue==1",
      "order_rate_out70_continue==1",
    ]) {
      expect(resolveGlobalSkillActivation(makeSkill(condition), context), condition).not.toBeNull();
    }
  });

  it("supports field-relative, shared-skill, and late-race activation conditions", () => {
    const context = {
      ...baseContext,
      activatedSkillCountEndAfter: 3,
      activatedSkillCountLaterHalf: 2,
      isActivateHealSkill: true,
      isLastStraightSegment: true,
      runningStyleEqualPopularityOne: true,
      sameSkillHorseCount: 5,
    };

    for (const condition of [
      "activate_count_end_after>=3",
      "activate_count_later_half>=2",
      "is_activate_heal_skill==1",
      "is_last_straight==1",
      "running_style_equal_popularity_one==1",
      "same_skill_horse_count>=5",
    ]) {
      expect(resolveGlobalSkillActivation(makeSkill(condition), context), condition).not.toBeNull();
    }
  });

  it("maps downhill and cherry-blossom season values to the source condition language", () => {
    expect(resolveGlobalSkillActivation(makeSkill("slope==2"), {
      ...baseContext,
      segment: { ...baseContext.segment!, slope: "downhill" },
    })).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("season==5"), {
      ...baseContext,
      season: "cherryBlossom",
    })).not.toBeNull();
  });

  it("supports Rushed state and occurrence-count conditions", () => {
    expect(resolveGlobalSkillActivation(makeSkill("is_temptation==1"), {
      ...baseContext,
      isTemptation: true,
    })).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("temptation_count==0"), {
      ...baseContext,
      temptationCount: 0,
    })).not.toBeNull();
    expect(resolveGlobalSkillActivation(makeSkill("temptation_count==0"), {
      ...baseContext,
      temptationCount: 1,
    })).toBeNull();
  });

  it("supports Dueling occurrence-count conditions", () => {
    expect(resolveGlobalSkillActivation(makeSkill("compete_fight_count>0"), {
      ...baseContext,
      competeFightCount: 1,
    })).not.toBeNull();
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
