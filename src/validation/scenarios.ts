import { catalog } from "../data/catalog";
import type { Skill } from "../domain/skills/types";
import type { RunnerBuild } from "../domain/uma/types";
import type { BatchBenchmark, ValidationScenario } from "./types";

const laneSkill: Skill = {
  id: "lane-test-skill",
  name: "Lane Test Skill",
  rarity: "normal",
  tags: ["validation"],
  alternatives: [
    {
      condition: { phase: "early" },
      durationSeconds: 1,
      effects: [{ kind: "speed", amount: 0.12 }],
    },
  ],
};

const rainySkill: Skill = {
  id: "rain-validation-skill",
  name: "Rain Validation Skill",
  rarity: "normal",
  tags: ["validation", "weather"],
  alternatives: [
    {
      condition: { phase: "early", weather: ["rainy"] },
      durationSeconds: 1,
      effects: [{ kind: "speed", amount: 0.12 }],
    },
  ],
};

const cornerSkill: Skill = {
  id: "corner-validation-skill",
  name: "Corner Validation Skill",
  rarity: "normal",
  tags: ["validation", "corner"],
  alternatives: [
    {
      condition: { phase: "middle", segmentKind: "corner" },
      durationSeconds: 1,
      effects: [{ kind: "speed", amount: 0.14 }],
    },
  ],
};

function cloneRunner(runner: RunnerBuild, overrides: Partial<RunnerBuild>): RunnerBuild {
  return {
    ...runner,
    ...overrides,
    stats: overrides.stats ?? runner.stats,
    aptitudes: overrides.aptitudes ?? runner.aptitudes,
    skillIds: overrides.skillIds ?? runner.skillIds,
  };
}

export const regressionScenarios: ValidationScenario[] = [
  {
    id: "weather-gated-skill-rainy",
    description: "Rain-only fixture skill should activate in rainy races.",
    setup: {
      seed: "validation-rainy",
      trackId: catalog.tracks[0].id,
      groundCondition: "firm",
      weather: "rainy",
      runners: [
        cloneRunner(catalog.runners[0], {
          id: "rain-runner",
          uniqueSkillId: "missing-unique-skill",
          skillIds: ["rain-validation-skill"],
        }),
      ],
    },
    catalog: {
      ...catalog,
      skills: [rainySkill],
    },
    assertions: [
      { kind: "winner", runnerId: "rain-runner" },
      { kind: "skillActivates", skillId: "rain-validation-skill", runnerId: "rain-runner" },
    ],
  },
  {
    id: "placement-order-fast-vs-slow",
    description: "A much faster runner should finish ahead in a simple two-runner setup.",
    setup: {
      seed: "validation-order",
      trackId: catalog.tracks[0].id,
      groundCondition: "firm",
      weather: "sunny",
      runners: [
        cloneRunner(catalog.runners[0], {
          id: "fast-runner",
          uniqueSkillId: "missing-unique-skill",
          skillIds: [],
          stats: { ...catalog.runners[0].stats, speed: 1250, stamina: 900, power: 950 },
        }),
        cloneRunner(catalog.runners[1], {
          id: "slow-runner",
          uniqueSkillId: "missing-unique-skill",
          skillIds: [],
          stats: { ...catalog.runners[1].stats, speed: 650, stamina: 650, power: 650 },
        }),
      ],
    },
    catalog: {
      ...catalog,
      skills: [],
    },
    assertions: [
      { kind: "winner", runnerId: "fast-runner" },
      { kind: "placementOrder", runnerIds: ["fast-runner", "slow-runner"] },
    ],
  },
];

export const mechanicScenarios: ValidationScenario[] = [
  {
    id: "weather-gated-skill-sunny-block",
    description: "Rain-only fixture skill should not activate in sunny races.",
    setup: {
      seed: "validation-sunny",
      trackId: catalog.tracks[0].id,
      groundCondition: "firm",
      weather: "sunny",
      runners: [
        cloneRunner(catalog.runners[0], {
          id: "sun-runner",
          uniqueSkillId: "missing-unique-skill",
          skillIds: ["rain-validation-skill"],
        }),
      ],
    },
    catalog: {
      ...catalog,
      skills: [rainySkill],
    },
    assertions: [{ kind: "skillDoesNotActivate", skillId: "rain-validation-skill", runnerId: "sun-runner" }],
  },
  {
    id: "corner-skill-activation",
    description: "A corner-gated fixture skill should activate on a course with corners.",
    setup: {
      seed: "validation-corner",
      trackId: catalog.tracks[0].id,
      groundCondition: "firm",
      weather: "sunny",
      runners: [
        cloneRunner(catalog.runners[0], {
          id: "corner-runner",
          uniqueSkillId: "missing-unique-skill",
          skillIds: ["corner-validation-skill"],
        }),
      ],
    },
    catalog: {
      ...catalog,
      skills: [cornerSkill],
    },
    assertions: [{ kind: "skillActivates", skillId: "corner-validation-skill", runnerId: "corner-runner" }],
  },
];

export const statisticalBenchmarks: BatchBenchmark[] = [
  {
    id: "fast-runner-win-rate",
    description: "Across a fixed seed batch, the much faster runner should dominate wins.",
    setups: Array.from({ length: 24 }, (_, index) => ({
      seed: `benchmark-fast-${index + 1}`,
      trackId: catalog.tracks[0].id,
      groundCondition: "firm" as const,
      weather: "sunny" as const,
      runners: [
        cloneRunner(catalog.runners[0], {
          id: "fast-runner",
          uniqueSkillId: "missing-unique-skill",
          skillIds: [],
          stats: { ...catalog.runners[0].stats, speed: 1250, stamina: 900, power: 950 },
        }),
        cloneRunner(catalog.runners[1], {
          id: "slow-runner",
          uniqueSkillId: "missing-unique-skill",
          skillIds: [],
          stats: { ...catalog.runners[1].stats, speed: 650, stamina: 650, power: 650 },
        }),
      ],
    })),
    catalog: {
      ...catalog,
      skills: [],
    },
  },
];
