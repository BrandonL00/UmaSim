import { describe, expect, it } from "vitest";
import { resolveGlobalSkillActivation } from "../domain/race/globalSkillModel";
import { sourceDerivedSkillCases } from "../validation/sourceCases";

describe("validation source-derived layer", () => {
  for (const testCase of sourceDerivedSkillCases) {
    it(testCase.id, () => {
      const positive = resolveGlobalSkillActivation(testCase.skill, testCase.context);
      const negative = resolveGlobalSkillActivation(testCase.skill, testCase.negativeContext);

      expect(positive, testCase.description).not.toBeNull();
      expect(negative, `${testCase.id} negative control`).toBeNull();
    });
  }
});

