import { globalSkills, type GlobalSkill } from "../data/skills";
import type { GlobalSkillContext } from "../domain/race/globalSkillModel";

export type SourceDerivedSkillCase = {
  id: string;
  description: string;
  skill: GlobalSkill;
  context: GlobalSkillContext;
  negativeContext: GlobalSkillContext;
};

const baseContext: GlobalSkillContext = {
  second: 18,
  elapsedMs: 18000,
  previousDistanceMeters: 1190,
  distanceMeters: 1220,
  activatedSkillCount: 7,
  phase: "late",
  segment: {
    startMeters: 1200,
    endMeters: 1400,
    kind: "straight",
    slope: "flat",
    tags: ["finalCorner", "finalStraight"],
  },
  order: 4,
  runnerCount: 9,
  orderRate: 44.4,
  distanceRate: 78,
  remainDistance: 280,
  hpPercent: 72,
  strategy: "pace",
  weather: "sunny",
  groundCondition: "firm",
  surface: "turf",
  distanceCategory: "medium",
  rotation: "clockwise",
  trackId: 10001,
  laneType: 0,
  isMoveLane: 2,
  changeOrder: 0,
  isOvertake: false,
  bashinDiffInfront: 0.6,
  bashinDiffBehind: 0.8,
  nearCount: 1,
  infrontNearLaneTime: 1.5,
  behindNearLaneTime: 2.2,
  behindNearLaneTimeSet1: 2.2,
  blockedFront: true,
  blockedFrontSeconds: 1.5,
  blockedSideSeconds: 0,
};

function requireSkill(name: string, conditionFragment: string) {
  const skill = globalSkills.find(
    (candidate) =>
      candidate.name === name &&
      candidate.conditionGroups.some(
        (group) =>
          (group.condition ?? "").includes(conditionFragment) || (group.precondition ?? "").includes(conditionFragment),
      ),
  );

  if (!skill) {
    throw new Error(`Missing source-derived skill case for ${name} (${conditionFragment})`);
  }

  return skill;
}

export const sourceDerivedSkillCases: SourceDerivedSkillCase[] = [
  {
    id: "source-chasing-after-you",
    description: "Chasing After You should resolve in midpack during the second half and include pressure on runners ahead.",
    skill: requireSkill("Chasing After You", "order_rate>=40&order_rate<=70"),
    context: {
      ...baseContext,
      distanceRate: 62,
      orderRate: 55.5,
      phase: "late",
    },
    negativeContext: {
      ...baseContext,
      distanceRate: 40,
      orderRate: 55.5,
      phase: "middle",
    },
  },
  {
    id: "source-trigger-beat-inner-lane",
    description: "trigger:BEAT should resolve when the runner is on the inner lane at the final corner in midpack.",
    skill: requireSkill("trigger:BEAT", "lane_type==0"),
    context: {
      ...baseContext,
      order: 5,
      orderRate: 55.5,
      laneType: 0,
      segment: {
        ...baseContext.segment!,
        kind: "straight",
        tags: ["finalCorner", "finalStraight"],
      },
    },
    negativeContext: {
      ...baseContext,
      order: 5,
      orderRate: 55.5,
      laneType: 2,
      segment: {
        ...baseContext.segment!,
        kind: "straight",
        tags: ["finalCorner", "finalStraight"],
      },
    },
  },
  {
    id: "source-blocked-front-late",
    description: "I See Victory in My Future! should resolve when blocked from the front late-race in the pack.",
    skill: requireSkill("I See Victory in My Future!", "blocked_front==1"),
    context: {
      ...baseContext,
      phase: "late",
      order: 4,
      blockedFront: true,
    },
    negativeContext: {
      ...baseContext,
      phase: "late",
      order: 4,
      blockedFront: false,
    },
  },
  {
    id: "source-lights-of-vaudeville",
    description: "Lights of Vaudeville should resolve when breaking out on the final straight with behind-near-lane pressure.",
    skill: requireSkill("Lights of Vaudeville", "behind_near_lane_time_set1>=1"),
    context: {
      ...baseContext,
      orderRate: 28,
      behindNearLaneTimeSet1: 1.2,
      segment: {
        ...baseContext.segment!,
        kind: "straight",
        tags: ["finalCorner", "finalStraight"],
      },
    },
    negativeContext: {
      ...baseContext,
      orderRate: 28,
      behindNearLaneTimeSet1: 0,
      segment: {
        ...baseContext.segment!,
        kind: "straight",
        tags: ["finalCorner", "finalStraight"],
      },
    },
  },
  {
    id: "source-soft-step-medium-lane-change",
    description: "Soft Step should resolve during a medium-distance lane change after enough elapsed time.",
    skill: requireSkill("Soft Step", "is_move_lane==1"),
    context: {
      ...baseContext,
      elapsedMs: 12000,
      distanceCategory: "medium",
      isMoveLane: 2,
    },
    negativeContext: {
      ...baseContext,
      elapsedMs: 12000,
      distanceCategory: "medium",
      isMoveLane: 0,
    },
  },
];
