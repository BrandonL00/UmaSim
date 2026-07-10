import type { RaceResult } from "../domain/race/types";
import type {
  ValidationAssertion,
  ValidationAssertionResult,
  ValidationScenario,
  ValidationScenarioResult,
} from "./types";

export function runValidationScenario(
  scenario: ValidationScenario,
  simulate: (setup: ValidationScenario["setup"], catalog: ValidationScenario["catalog"]) => RaceResult,
): ValidationScenarioResult {
  const race = simulate(scenario.setup, scenario.catalog);
  const assertions = scenario.assertions.map((assertion) => evaluateAssertion(race, assertion));

  return {
    scenario,
    race,
    assertions,
  };
}

function evaluateAssertion(race: RaceResult, assertion: ValidationAssertion): ValidationAssertionResult {
  switch (assertion.kind) {
    case "winner": {
      const winner = race.placements[0]?.runnerId;
      return {
        ok: winner === assertion.runnerId,
        message: `expected winner ${assertion.runnerId}, got ${winner ?? "none"}`,
      };
    }
    case "skillActivates": {
      const matched = race.skillEvents.some(
        (event) =>
          event.skillId === assertion.skillId &&
          (assertion.runnerId === undefined || event.runnerId === assertion.runnerId),
      );

      return {
        ok: matched,
        message: `expected ${assertion.skillId} to activate${assertion.runnerId ? ` for ${assertion.runnerId}` : ""}`,
      };
    }
    case "skillDoesNotActivate": {
      const matched = race.skillEvents.some(
        (event) =>
          event.skillId === assertion.skillId &&
          (assertion.runnerId === undefined || event.runnerId === assertion.runnerId),
      );

      return {
        ok: !matched,
        message: `expected ${assertion.skillId} not to activate${assertion.runnerId ? ` for ${assertion.runnerId}` : ""}`,
      };
    }
    case "placementOrder": {
      const actual = race.placements.map((placement) => placement.runnerId);
      const expected = assertion.runnerIds;
      const ok = expected.every((runnerId, index) => actual[index] === runnerId);

      return {
        ok,
        message: `expected placement order ${expected.join(" > ")}, got ${actual.join(" > ")}`,
      };
    }
    default:
      return {
        ok: false,
        message: "unknown assertion",
      };
  }
}

