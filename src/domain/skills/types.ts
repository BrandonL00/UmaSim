import type { RacePhase, Weather } from "../race/types";
import type { Strategy } from "../uma/types";

export type SkillRarity = "normal" | "rare" | "unique" | "inherit";

export type SkillCondition = {
  phase?: RacePhase;
  segmentKind?: "straight" | "corner";
  strategy?: Strategy[];
  weather?: Weather[];
  randomChance?: number;
};

export type SkillEffect =
  | { kind: "speed"; amount: number }
  | { kind: "acceleration"; amount: number }
  | { kind: "staminaRecovery"; amount: number };

export type SkillAlternative = {
  condition: SkillCondition;
  durationSeconds: number;
  effects: SkillEffect[];
};

export type Skill = {
  id: string;
  name: string;
  rarity: SkillRarity;
  tags: string[];
  prerequisiteSkillIds?: string[];
  supersedesSkillIds?: string[];
  alternatives: SkillAlternative[];
};
