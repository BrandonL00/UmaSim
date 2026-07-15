import { describe, expect, it } from "vitest";
import { globalSkills } from "../data/skills";
import { buildGlobalSkillCoverageReport } from "../domain/race/globalSkillCoverage";

describe("Global skill coverage report", () => {
  it("accounts for every imported skill and identifies unsupported language", () => {
    const report = buildGlobalSkillCoverageReport(globalSkills);

    expect(report.skillCount).toBe(globalSkills.length);
    expect(report.modeledSkillCount + report.unsupportedSkillCount).toBe(report.skillCount);
    expect(report.unsupportedConditionTokens.length + report.unsupportedEffectTypes.length).toBeGreaterThan(0);
    expect(report.uniqueSkills.owner.modeledSkillCount + report.uniqueSkills.owner.unsupportedSkillCount)
      .toBe(report.uniqueSkills.owner.skillCount);
    expect(report.uniqueSkills.inherited.modeledSkillCount + report.uniqueSkills.inherited.unsupportedSkillCount)
      .toBe(report.uniqueSkills.inherited.skillCount);
    expect(report.uniqueSkills.owner.unsupportedSkills).toEqual([]);
    expect(report.uniqueSkills.inherited.unsupportedSkills).toEqual([]);
  });
});
