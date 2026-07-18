import generatedGlobalSkills from "./generated/gametoraGlobalSkills.json";

export type GlobalSkillConditionGroup = {
  condition: string | null;
  precondition: string | null;
  baseTimeMs: number | null;
  cooldownMs: number | null;
  effects: Array<{
    type: number;
    value: number;
  }>;
};

export type GlobalSkill = {
  id: string;
  name: string;
  oldEnglishName: string | null;
  japaneseName: string | null;
  description: string;
  oldEnglishDescription: string | null;
  japaneseDescription: string | null;
  rarity: "normal" | "rare" | "unique" | "evolved";
  rarityValue: number | null;
  iconId: number | null;
  cost: number | null;
  activation: number | null;
  tags: string[];
  versionIds: string[];
  prerequisiteIds: string[];
  supersedesIds: string[];
  conditionGroups: GlobalSkillConditionGroup[];
  geneVersion: {
    id: string;
    name: string;
    description: string;
    cost: number | null;
    rarity: "normal" | "rare" | "unique" | "evolved";
    iconId: number | null;
    conditionGroups: GlobalSkillConditionGroup[];
  } | null;
  sourceIds: {
    characterIds: number[];
    characterEvoIds: number[];
    scenarioIds: number[];
  };
  availability: {
    globalReleased: boolean;
    hasGlobalConditionOverride: boolean;
    hasGlobalSourceOverride: boolean;
  };
};

export const globalSkillDataMeta = {
  generatedAt: generatedGlobalSkills.generatedAt,
  server: generatedGlobalSkills.server,
  source: generatedGlobalSkills.source,
  count: generatedGlobalSkills.count,
};

export const globalSkills = generatedGlobalSkills.skills as GlobalSkill[];

export function createGlobalSkillEngineMap(): Map<string, GlobalSkill> {
  const entries = globalSkills.flatMap((skill): Array<[string, GlobalSkill]> => {
    const ownerEntry: [string, GlobalSkill] = [`gt-${skill.id}`, skill];

    if (!skill.geneVersion) {
      return [ownerEntry];
    }

    const inheritedSkill: GlobalSkill = {
      ...skill,
      id: skill.geneVersion.id,
      name: skill.geneVersion.name,
      description: skill.geneVersion.description,
      rarity: skill.geneVersion.rarity,
      iconId: skill.geneVersion.iconId,
      cost: skill.geneVersion.cost,
      conditionGroups: skill.geneVersion.conditionGroups,
      geneVersion: null,
    };

    return [ownerEntry, [`gt-${skill.geneVersion.id}`, inheritedSkill]];
  });

  return new Map(entries);
}

function getCirclePrerequisiteIds(skill: GlobalSkill): string[] {
  if (!skill.name.includes("◎")) return [];

  const baseName = skill.name.replace("◎", "").trim();
  const prerequisite = globalSkills.find(
    (candidate) =>
      candidate.name.includes("○") &&
      candidate.name.replace("○", "").trim() === baseName,
  );

  return prerequisite ? [prerequisite.id] : [];
}

export const globalSkillOptions = globalSkills.map((skill) => ({
  ...(() => {
    const prerequisiteIds = [...new Set([...skill.prerequisiteIds, ...getCirclePrerequisiteIds(skill)])];
    return {
      prerequisiteIds: prerequisiteIds.map((id) => `gt-${id}`),
      supersedesIds: prerequisiteIds.map((id) => `gt-${id}`),
    };
  })(),
  id: `gt-${skill.id}`,
  sourceId: skill.id,
  name: skill.name,
  description: skill.description,
  rarity: skill.rarity,
  tags: [skill.rarity, ...skill.tags],
  modeled: false,
}));

export const inheritedUniqueSkillOptions = globalSkills
  .filter((skill) => skill.geneVersion)
  .map((skill) => ({
    id: `gt-${skill.geneVersion!.id}`,
    sourceId: skill.geneVersion!.id,
    name: skill.geneVersion!.name,
    description: skill.geneVersion!.description,
    rarity: skill.geneVersion!.rarity,
    tags: ["inherit", "unique"],
    prerequisiteIds: [] as string[],
    supersedesIds: [] as string[],
    modeled: false,
  }));

/**
 * Skills present in source data but intentionally outside the Global engine
 * catalog. They can be retained on imported builds so the omission is visible,
 * but they are never passed to the simulator until their scenario mechanics are
 * modeled.
 */
export const unmodeledSourceSkillOptions = [
  {
    id: "gt-210012",
    sourceId: "210012",
    name: "Ignited Spirit SPD",
    aliases: ["Aoharu Ignition・Speed", "アオハル点火・速"],
    description: "Aoharu Team speed skill. Its effect scales with Aoharu team rank.",
    rarity: "normal" as const,
    tags: ["scenario", "aoharu", "unmodeled"],
    prerequisiteIds: [] as string[],
    supersedesIds: [] as string[],
    modeled: false,
    unmodeledReason: "Aoharu Team rank scaling is not modeled yet, so this skill will not affect simulations.",
  },
  {
    id: "gt-210022",
    sourceId: "210022",
    name: "Ignited Spirit STA",
    aliases: ["Aoharu Ignition・Stamina", "アオハル点火・体"],
    description: "Aoharu Team stamina skill. Its effect scales with Aoharu team rank.",
    rarity: "normal" as const,
    tags: ["scenario", "aoharu", "unmodeled"],
    prerequisiteIds: [] as string[],
    supersedesIds: [] as string[],
    modeled: false,
    unmodeledReason: "Aoharu Team rank scaling is not modeled yet, so this skill will not affect simulations.",
  },
  {
    id: "gt-210032",
    sourceId: "210032",
    name: "Ignited Spirit PWR",
    aliases: ["Aoharu Ignition・Power", "アオハル点火・力"],
    description: "Aoharu Team power skill. Its effect scales with Aoharu team rank.",
    rarity: "normal" as const,
    tags: ["scenario", "aoharu", "unmodeled"],
    prerequisiteIds: [] as string[],
    supersedesIds: [] as string[],
    modeled: false,
    unmodeledReason: "Aoharu Team rank scaling is not modeled yet, so this skill will not affect simulations.",
  },
  {
    id: "gt-210042",
    sourceId: "210042",
    name: "Ignited Spirit GUTS",
    aliases: ["Aoharu Ignition・Guts", "アオハル点火・根"],
    description: "Aoharu Team guts skill. Its effect scales with Aoharu team rank.",
    rarity: "normal" as const,
    tags: ["scenario", "aoharu", "unmodeled"],
    prerequisiteIds: [] as string[],
    supersedesIds: [] as string[],
    modeled: false,
    unmodeledReason: "Aoharu Team rank scaling is not modeled yet, so this skill will not affect simulations.",
  },
  {
    id: "gt-210052",
    sourceId: "210052",
    name: "Ignited Spirit WIT",
    aliases: ["Aoharu Ignition・Wisdom", "アオハル点火・賢"],
    description: "Aoharu Team wisdom skill. Its effect scales with Aoharu team rank.",
    rarity: "normal" as const,
    tags: ["scenario", "aoharu", "unmodeled"],
    prerequisiteIds: [] as string[],
    supersedesIds: [] as string[],
    modeled: false,
    unmodeledReason: "Aoharu Team rank scaling is not modeled yet, so this skill will not affect simulations.",
  },
] as const;
