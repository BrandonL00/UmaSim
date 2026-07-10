import { describe, expect, it } from "vitest";
import { catalog } from "../data/catalog";
import { globalSkills } from "../data/skills";
import { simulateRace } from "../domain/race/simulateRace";
import type { RaceSetup } from "../domain/race/types";
import type { Skill } from "../domain/skills/types";

const setup: RaceSetup = {
  seed: "test-seed",
  trackId: catalog.tracks[0].id,
  groundCondition: "firm",
  weather: "sunny",
  runners: catalog.runners,
};

describe("simulateRace", () => {
  it("returns deterministic results for the same seed and setup", () => {
    const first = simulateRace(setup, catalog);
    const second = simulateRace(setup, catalog);

    expect(second.placements).toEqual(first.placements);
    expect(second.skillEvents).toEqual(first.skillEvents);
  });

  it("finishes all sample runners", () => {
    const result = simulateRace(setup, catalog);

    expect(result.placements).toHaveLength(catalog.runners.length);
    expect(result.warnings).toHaveLength(0);
    expect(result.placements.every((placement) => placement.finishTime > 0)).toBe(true);
  });

  it("records skill activations as explainable events", () => {
    const result = simulateRace(setup, catalog);

    expect(result.skillEvents.length).toBeGreaterThan(0);
    expect(result.skillEvents[0]).toEqual(
      expect.objectContaining({
        runnerId: expect.any(String),
        skillId: expect.any(String),
        skillName: expect.any(String),
      }),
    );
  });

  it("does not activate a prerequisite when its upgrade is owned", () => {
    const prerequisite: Skill = {
      id: "test-white",
      name: "Test White",
      rarity: "normal",
      tags: [],
      alternatives: [
        {
          condition: { phase: "early" },
          durationSeconds: 1,
          effects: [{ kind: "speed", amount: 0.1 }],
        },
      ],
    };
    const upgrade: Skill = {
      id: "test-gold",
      name: "Test Gold",
      rarity: "rare",
      tags: [],
      prerequisiteSkillIds: ["test-white"],
      supersedesSkillIds: ["test-white"],
      alternatives: [
        {
          condition: { phase: "early" },
          durationSeconds: 1,
          effects: [{ kind: "speed", amount: 0.2 }],
        },
      ],
    };
    const runner = {
      ...catalog.runners[0],
      id: "upgrade-test-runner",
      skillIds: ["test-white", "test-gold"],
    };
    const result = simulateRace(
      {
        ...setup,
        runners: [runner],
      },
      {
        ...catalog,
        skills: [prerequisite, upgrade],
      },
    );

    expect(result.skillEvents.map((event) => event.skillId)).toContain("test-gold");
    expect(result.skillEvents.map((event) => event.skillId)).not.toContain("test-white");
  });

  it("only activates weather-gated skills in matching weather", () => {
    const rainSkill: Skill = {
      id: "rain-test",
      name: "Rain Test",
      rarity: "normal",
      tags: ["weather"],
      alternatives: [
        {
          condition: { phase: "early", weather: ["rainy"] },
          durationSeconds: 1,
          effects: [{ kind: "speed", amount: 0.1 }],
        },
      ],
    };
    const runner = {
      ...catalog.runners[0],
      id: "weather-test-runner",
      skillIds: ["rain-test"],
    };
    const weatherCatalog = {
      ...catalog,
      skills: [rainSkill],
    };

    const sunnyResult = simulateRace({ ...setup, weather: "sunny", runners: [runner] }, weatherCatalog);
    const rainyResult = simulateRace({ ...setup, weather: "rainy", runners: [runner] }, weatherCatalog);

    expect(sunnyResult.skillEvents).toHaveLength(0);
    expect(rainyResult.skillEvents.map((event) => event.skillId)).toContain("rain-test");
  });

  it("applies passive global skill stat bonuses before the race starts", () => {
    const runner = {
      ...catalog.runners[0],
      id: "green-skill-runner",
      skillIds: ["gt-200012"],
    };
    const result = simulateRace(
      {
        ...setup,
        trackId: "gt-10401",
        runners: [runner],
      },
      catalog,
    );

    expect(result.runners[0]?.adjustedStats.speed).toBeGreaterThan(runner.stats.speed);
  });

  it("activates supported global skills and records them in the log", () => {
    const leader = {
      ...catalog.runners[0],
      id: "global-skill-leader",
      uniqueSkillId: "missing-unique-skill",
      stats: { ...catalog.runners[0].stats, speed: 1200 },
      skillIds: [],
    };
    const runner = {
      ...catalog.runners[1]!,
      id: "global-skill-runner",
      uniqueSkillId: "missing-unique-skill",
      stats: { ...catalog.runners[1]!.stats, speed: 700 },
      skillIds: ["gt-10071"],
    };
    const result = simulateRace(
      {
        ...setup,
        trackId: "gt-10401",
        runners: [leader, runner],
      },
      catalog,
    );

    expect(result.skillEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "gt-10071",
          source: "global",
        }),
      ]),
    );
  });

  it("applies pressure effects from supported global skills to the runner ahead", () => {
    const chasingAfterYou = globalSkills.find((skill) => skill.name === "Chasing After You");
    expect(chasingAfterYou).toBeDefined();

    const leader = {
      ...catalog.runners[0],
      id: "pressure-leader",
      uniqueSkillId: "missing-unique-skill",
      skillIds: [],
      stats: { ...catalog.runners[0].stats, speed: 980, stamina: 900, power: 860 },
    };
    const pressureRunner = {
      ...catalog.runners[1]!,
      id: "pressure-runner",
      uniqueSkillId: "missing-unique-skill",
      skillIds: [`gt-${chasingAfterYou!.id}`],
      strategy: "pace" as const,
      stats: { ...catalog.runners[1]!.stats, speed: 930, stamina: 860, power: 820 },
    };
    const fillerA = {
      ...catalog.runners[2]!,
      id: "pressure-filler-a",
      uniqueSkillId: "missing-unique-skill",
      skillIds: [],
      stats: { ...catalog.runners[2]!.stats, speed: 700, stamina: 700, power: 680 },
    };
    const fillerB = {
      ...catalog.runners[3]!,
      id: "pressure-filler-b",
      uniqueSkillId: "missing-unique-skill",
      skillIds: [],
      stats: { ...catalog.runners[3]!.stats, speed: 650, stamina: 650, power: 640 },
    };

    const control = simulateRace(
      {
        ...setup,
        trackId: "gt-10401",
        runners: [{ ...pressureRunner, skillIds: [] }, leader, fillerA, fillerB],
      },
      catalog,
    );
    const pressured = simulateRace(
      {
        ...setup,
        trackId: "gt-10401",
        runners: [pressureRunner, leader, fillerA, fillerB],
      },
      catalog,
    );

    expect(pressured.skillEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runnerId: "pressure-runner",
          skillId: `gt-${chasingAfterYou!.id}`,
          source: "global",
        }),
      ]),
    );

    const controlLeader = control.runners.find((runner) => runner.runnerId === "pressure-leader");
    const pressuredLeader = pressured.runners.find((runner) => runner.runnerId === "pressure-leader");
    expect(controlLeader).toBeDefined();
    expect(pressuredLeader).toBeDefined();
    expect((pressuredLeader?.gapToWinner ?? 0)).toBeGreaterThanOrEqual(controlLeader?.gapToWinner ?? 0);
  });

  it("pressure interactions can materially improve a close matchup for the pressure runner", () => {
    const chasingAfterYou = globalSkills.find((skill) => skill.name === "Chasing After You");
    expect(chasingAfterYou).toBeDefined();

    const leader = {
      ...catalog.runners[0],
      id: "close-leader",
      uniqueSkillId: "missing-unique-skill",
      skillIds: [],
      strategy: "pace" as const,
      stats: { ...catalog.runners[0].stats, speed: 930, stamina: 850, power: 800 },
    };
    const pressureRunner = {
      ...catalog.runners[1]!,
      id: "close-pressure-runner",
      uniqueSkillId: "missing-unique-skill",
      skillIds: [`gt-${chasingAfterYou!.id}`],
      strategy: "pace" as const,
      stats: { ...catalog.runners[1]!.stats, speed: 920, stamina: 860, power: 810 },
    };
    const fillerA = {
      ...catalog.runners[2]!,
      id: "close-filler-a",
      uniqueSkillId: "missing-unique-skill",
      skillIds: [],
      stats: { ...catalog.runners[2]!.stats, speed: 700, stamina: 700, power: 680 },
    };
    const fillerB = {
      ...catalog.runners[3]!,
      id: "close-filler-b",
      uniqueSkillId: "missing-unique-skill",
      skillIds: [],
      stats: { ...catalog.runners[3]!.stats, speed: 680, stamina: 680, power: 660 },
    };

    const control = simulateRace(
      {
        ...setup,
        trackId: "gt-10401",
        runners: [{ ...pressureRunner, skillIds: [] }, leader, fillerA, fillerB],
      },
      catalog,
    );
    const pressured = simulateRace(
      {
        ...setup,
        trackId: "gt-10401",
        runners: [pressureRunner, leader, fillerA, fillerB],
      },
      catalog,
    );

    const controlPressureRunner = control.runners.find((runner) => runner.runnerId === "close-pressure-runner");
    const pressuredPressureRunner = pressured.runners.find((runner) => runner.runnerId === "close-pressure-runner");
    const controlLeader = control.runners.find((runner) => runner.runnerId === "close-leader");
    const pressuredLeader = pressured.runners.find((runner) => runner.runnerId === "close-leader");

    expect(controlPressureRunner).toBeDefined();
    expect(pressuredPressureRunner).toBeDefined();
    expect(controlLeader).toBeDefined();
    expect(pressuredLeader).toBeDefined();

    expect((pressuredPressureRunner?.gapToWinner ?? Infinity)).toBeLessThanOrEqual(
      controlPressureRunner?.gapToWinner ?? Infinity,
    );
    expect((pressuredLeader?.gapToWinner ?? 0)).toBeGreaterThanOrEqual(controlLeader?.gapToWinner ?? 0);
  });
});
