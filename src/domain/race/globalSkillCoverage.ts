import type { GlobalSkill } from "../../data/skills";
import { getGlobalSkillModelingReport } from "./globalSkillModel";

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
};

/** Summarizes unsupported imported Global-skill language without guessing behavior. */
export function buildGlobalSkillCoverageReport(skills: readonly GlobalSkill[]): GlobalSkillCoverageReport {
  const unsupportedConditionTokens = new Map<string, GlobalSkillCoverageRow>();
  const unsupportedEffectTypes = new Map<string, GlobalSkillCoverageRow>();
  let modeledSkillCount = 0;

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
