import { describe, expect, it } from "vitest";
import { appendRaceRunLog, createRaceRunLog } from "../domain/race/runHistory";
import type { RaceResult, RaceSetup, Track } from "../domain/race/types";

const setup: RaceSetup = {
  seed: "test-seed",
  trackId: "tokyo-1600",
  groundCondition: "firm",
  weather: "sunny",
  runners: [
    {
      id: "runner-1",
      name: "Test Runner",
      characterName: "Test Runner",
      cardId: 1,
      characterId: 1,
      outfitTitle: "Test Outfit",
      variant: null,
      buildName: "Debug Build",
      stats: { speed: 900, stamina: 700, power: 800, guts: 500, wit: 600 },
      aptitudes: {
        surface: { turf: "A", dirt: "G" },
        distance: { sprint: "C", mile: "A", medium: "B", long: "D" },
        strategy: { front: "A", pace: "B", late: "C", end: "G" },
      },
      strategy: "front",
      mood: "normal",
      uniqueSkillId: "gt-1",
      uniqueSkillLevel: 3,
      skillIds: ["gt-100171"],
    },
  ],
};

const track: Track = {
  id: "tokyo-1600",
  name: "Tokyo Turf 1600m",
  venue: "Tokyo",
  surface: "turf",
  distanceMeters: 1600,
  distanceCategory: "mile",
  segments: [{ startMeters: 0, endMeters: 1600, kind: "straight" }],
};

const result: RaceResult = {
  seed: "test-seed",
  tickSeconds: 0.5,
  placements: [{ place: 1, runnerId: "runner-1", runnerName: "Test Runner", finishTime: 91.25 }],
  runners: [
    {
      runnerId: "runner-1",
      runnerName: "Test Runner",
      adjustedStats: { speed: 900, stamina: 700, power: 800, guts: 500, wit: 600 },
      topSpeed: 19.2,
      averageSpeed: 17.5,
      remainingStamina: 120,
      staminaSpent: 580,
      triggeredSkillCount: 1,
      finishTime: 91.25,
      gapToWinner: 0,
    },
  ],
  timeline: [{ second: 0, runners: [] }],
  skillEvents: [
    {
      second: 22.5,
      runnerId: "runner-1",
      skillId: "gt-100171",
      skillName: "Inherited Unique",
      message: "Activated.",
      source: "global",
    },
  ],
  skillDebug: [
    {
      runnerId: "runner-1",
      skillId: "gt-100171",
      skillName: "Inherited Unique",
      source: "global",
      status: "activated",
      conditionSummary: "sample",
      sampledTargets: [],
      activation: { second: 22.5, distanceMeters: 400, distanceRate: 25 },
      reason: "Matched sampled window.",
    },
  ],
  warnings: [],
};

describe("race run history", () => {
  it("captures setup, result, track summary, and debug details", () => {
    const log = createRaceRunLog(setup, track, result, {
      engineVersion: "0.1.0",
      server: "global",
      source: "gametora.com",
      snapshotGeneratedAt: "2026-06-19T04:44:06.665Z",
    });

    expect(log.track.name).toBe("Tokyo Turf 1600m");
    expect(log.setup.runners[0].buildName).toBe("Debug Build");
    expect(log.result.skillEvents).toHaveLength(1);
    expect(log.result.skillDebug?.[0].skillId).toBe("gt-100171");
    expect(log.provenance).toMatchObject({ engineVersion: "0.1.0", server: "global" });
  });

  it("keeps newest logs first and respects the limit", () => {
    const first = createRaceRunLog(setup, track, result);
    const second = createRaceRunLog({ ...setup, seed: "next-seed" }, track, { ...result, seed: "next-seed" });

    const logs = appendRaceRunLog([first], second, 1);

    expect(logs).toHaveLength(1);
    expect(logs[0].result.seed).toBe("next-seed");
  });
});
