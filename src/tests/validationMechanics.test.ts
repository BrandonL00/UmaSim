import { describe, expect, it } from "vitest";
import { simulateRace } from "../domain/race/simulateRace";
import { runValidationScenario } from "../validation/assertions";
import { mechanicScenarios } from "../validation/scenarios";

describe("validation mechanics layer", () => {
  for (const scenario of mechanicScenarios) {
    it(scenario.id, () => {
      const result = runValidationScenario(scenario, simulateRace);

      expect(result.assertions.every((assertion) => assertion.ok)).toBe(true);
    });
  }
});

