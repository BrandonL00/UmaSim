import { describe, expect, it } from "vitest";
import { globalSkills } from "../data/skills";
import { buildGlobalSkillCoverageReport } from "../domain/race/globalSkillCoverage";

describe("Global skill coverage report", () => {
  it("accounts for every imported skill and identifies unsupported language", () => {
    const report = buildGlobalSkillCoverageReport(globalSkills);

    expect(report.skillCount).toBe(globalSkills.length);
    expect(report.modeledSkillCount + report.unsupportedSkillCount).toBe(report.skillCount);
    expect(report.unsupportedConditionTokens.length + report.unsupportedEffectTypes.length).toBeGreaterThan(0);
  });
});
