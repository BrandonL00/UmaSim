import type { GlobalSkill, GlobalSkillConditionGroup } from "../../data/skills";

type UniqueSkillScalingContext = {
  ownedUniqueSkillId: string;
  uniqueSkillLevel: number;
};

export function resolveOwnedUniqueSkill(
  skill: GlobalSkill,
  context: UniqueSkillScalingContext,
): GlobalSkill {
  if (`gt-${skill.id}` !== context.ownedUniqueSkillId) {
    return skill;
  }

  return {
    ...skill,
    conditionGroups: scaleUniqueConditionGroups(skill.conditionGroups, context.uniqueSkillLevel),
  };
}

function scaleUniqueConditionGroups(
  groups: GlobalSkillConditionGroup[],
  uniqueSkillLevel: number,
): GlobalSkillConditionGroup[] {
  const normalizedLevel = Math.min(Math.max(Math.round(uniqueSkillLevel), 1), 6);
  const multiplier = getUniqueLevelEffectMultiplier(normalizedLevel);

  if (multiplier === 1) {
    return groups;
  }

  return groups.map((group) => ({
    ...group,
    effects: group.effects.map((effect) => ({
      ...effect,
      value: Math.round(effect.value * multiplier),
    })),
  }));
}

export function getUniqueLevelEffectMultiplier(uniqueSkillLevel: number) {
  const normalizedLevel = Math.min(Math.max(Math.round(uniqueSkillLevel), 1), 6);
  const multipliers: Record<number, number> = {
    1: 1,
    2: 1.025,
    3: 1.05,
    4: 1.075,
    5: 1.1,
    6: 1.125,
  };

  // Provisional owner-unique scaling until we wire in a source-verified table.
  return multipliers[normalizedLevel] ?? 1;
}
