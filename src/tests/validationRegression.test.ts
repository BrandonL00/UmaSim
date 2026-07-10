import { describe, expect, it } from "vitest";
import { simulateRace } from "../domain/race/simulateRace";
import { runValidationScenario } from "../validation/assertions";
import { regressionScenarios } from "../validation/scenarios";

describe("validation regression layer", () => {
  for (const scenario of regressionScenarios) {
    it(scenario.id, () => {
      const result = runValidationScenario(scenario, simulateRace);

      expect(result.assertions.every((assertion) => assertion.ok)).toBe(true);
    });
  }
});

