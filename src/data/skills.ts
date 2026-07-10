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
