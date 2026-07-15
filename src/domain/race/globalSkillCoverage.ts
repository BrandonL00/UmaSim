import type { GlobalSkill } from "../../data/skills";
import {
  getGlobalSkillModelingReport,
  type GlobalSkillModelingReport,
} from "./globalSkillModel";

export type GlobalSkillCoverageRow = {
  value: string;
  count: number;
  modeledCount: number;
};

export type GlobalSkillCoverageReport = {
  skillCount: number;
  modeledSkillCount: number;
  unsupportedSkillCount: number;
  unsupportedConditionTokens: GlobalSkillCoverageRow[];
  unsupportedEffectTypes: GlobalSkillCoverageRow[];
  uniqueSkills: {
    owner: UniqueSkillCoverage;
    inherited: UniqueSkillCoverage;
  };
};

export type UnmodeledUniqueSkillRow = {
  id: string;
  name: string;
  report: GlobalSkillModelingReport;
};

export type UniqueSkillCoverage = {
  skillCount: number;
  modeledSkillCount: number;
  unsupportedSkillCount: number;
  unsupportedSkills: UnmodeledUniqueSkillRow[];
};

/** Summarizes unsupported imported Global-skill language without guessing behavior. */
export function buildGlobalSkillCoverageReport(skills: readonly GlobalSkill[]): GlobalSkillCoverageReport {
  const unsupportedConditionTokens = new Map<string, GlobalSkillCoverageRow>();
  const unsupportedEffectTypes = new Map<string, GlobalSkillCoverageRow>();
  let modeledSkillCount = 0;
  const ownerUniqueSkills = skills.filter((skill) => skill.rarity === "unique");
  const inheritedUniqueSkills = ownerUniqueSkills.flatMap((skill) => {
    if (!skill.geneVersion) return [];

    return [{
      ...skill,
      id: skill.geneVersion.id,
      name: skill.geneVersion.name,
      description: skill.geneVersion.description,
      rarity: skill.geneVersion.rarity,
      iconId: skill.geneVersion.iconId,
      cost: skill.geneVersion.cost,
      conditionGroups: skill.geneVersion.conditionGroups,
      geneVersion: null,
    } satisfies GlobalSkill];
  });

  for (const skill of skills) {
    const report = getGlobalSkillModelingReport(skill);
    if (report.modeled) {
      modeledSkillCount += 1;
    }

    addValues(unsupportedConditionTokens, report.unsupportedConditionTokens, report.modeled);
    addValues(unsupportedEffectTypes, report.unsupportedEffectTypes.map(String), report.modeled);
  }

  return {
    skillCount: skills.length,
    modeledSkillCount,
    unsupportedSkillCount: skills.length - modeledSkillCount,
    unsupportedConditionTokens: sortRows(unsupportedConditionTokens),
    unsupportedEffectTypes: sortRows(unsupportedEffectTypes),
    uniqueSkills: {
      owner: buildUniqueSkillCoverage(ownerUniqueSkills),
      inherited: buildUniqueSkillCoverage(inheritedUniqueSkills),
    },
  };
}

function buildUniqueSkillCoverage(skills: readonly GlobalSkill[]): UniqueSkillCoverage {
  const unsupportedSkills = skills.flatMap((skill) => {
    const report = getGlobalSkillModelingReport(skill);
    return report.modeled ? [] : [{ id: skill.id, name: skill.name, report }];
  });

  return {
    skillCount: skills.length,
    modeledSkillCount: skills.length - unsupportedSkills.length,
    unsupportedSkillCount: unsupportedSkills.length,
    unsupportedSkills,
  };
}

function addValues(rows: Map<string, GlobalSkillCoverageRow>, values: string[], modeled: boolean) {
  for (const value of values) {
    const current = rows.get(value) ?? { value, count: 0, modeledCount: 0 };
    current.count += 1;
    current.modeledCount += Number(modeled);
    rows.set(value, current);
  }
}

function sortRows(rows: Map<string, GlobalSkillCoverageRow>) {
  return [...rows.values()].sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}
