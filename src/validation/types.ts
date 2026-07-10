import type { RaceCatalog, RaceResult, RaceSetup } from "../domain/race/types";

export type ValidationScenario = {
  id: string;
  description: string;
  setup: RaceSetup;
  catalog: RaceCatalog & { skills: Array<any> };
  assertions: ValidationAssertion[];
};

export type ValidationAssertion =
  | {
      kind: "winner";
      runnerId: string;
    }
  | {
      kind: "skillActivates";
      skillId: string;
      runnerId?: string;
    }
  | {
      kind: "skillDoesNotActivate";
      skillId: string;
      runnerId?: string;
    }
  | {
      kind: "placementOrder";
      runnerIds: string[];
    };

export type ValidationAssertionResult = {
  ok: boolean;
  message: string;
};

export type ValidationScenarioResult = {
  scenario: ValidationScenario;
  race: RaceResult;
  assertions: ValidationAssertionResult[];
};

export type BatchBenchmark = {
  id: string;
  description: string;
  setups: RaceSetup[];
  catalog: RaceCatalog & { skills: Array<any> };
};

export type BatchBenchmarkResult = {
  benchmark: BatchBenchmark;
  races: RaceResult[];
};

