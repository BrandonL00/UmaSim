/**
 * Every non-passive skill receives one pre-race Wit check. The game uses the
 * build's Base Wit rather than a temporary in-race stat bonus.
 */
export function calculateSkillActivationChance(baseWit: number) {
  return Math.max(0.2, Math.min(1, 1 - 90 / Math.max(baseWit, 1)));
}

export type SkillActivationRoll = {
  chance: number;
  passed: boolean;
};

export function rollSkillActivation(baseWit: number, random: () => number): SkillActivationRoll {
  const chance = calculateSkillActivationChance(baseWit);
  return { chance, passed: random() < chance };
}

/** Uses an isolated deterministic roll so adding proc checks does not perturb race RNG. */
export function rollSeededSkillActivation(baseWit: number, seed: string, runnerId: string, skillId: string): SkillActivationRoll {
  let hash = 2166136261;
  for (const character of `${seed}:${runnerId}:${skillId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return rollSkillActivation(baseWit, () => (hash >>> 0) / 4294967296);
}
