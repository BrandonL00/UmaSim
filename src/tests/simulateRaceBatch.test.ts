import { describe, expect, it } from "vitest";
import { catalog } from "../data/catalog";
import { replayBatchRun, simulateRaceBatch } from "../domain/race/simulateRaceBatch";

describe("simulateRaceBatch", () => {
  const setup = {
    seed: "batch-test",
    trackId: catalog.tracks[0].id,
    groundCondition: "firm" as const,
    weather: "sunny" as const,
    runners: catalog.runners.slice(0, 2),
  };

  it("is deterministic and produces per-runner aggregates", () => {
    const first = simulateRaceBatch(setup, catalog, 12);
    const second = simulateRaceBatch(setup, catalog, 12);

    expect(second.runners).toEqual(first.runners);
    expect(first.runs[0]?.seed).toBe("batch-test::analysis-1");
    expect(first.runners).toHaveLength(2);
    expect(first.runners.every((runner) => runner.winRate >= 0 && runner.winRate <= 100)).toBe(true);
    expect(first.runners.every((runner) => runner.skills.every((skill) => skill.activationRate >= 0))).toBe(true);
  });

  it("recreates an exact replay from a selected compact batch run", () => {
    const batch = simulateRaceBatch(setup, catalog, 12);
    const replay = replayBatchRun(batch, catalog, 7);
    const summary = batch.runs.find((run) => run.index === 7);

    expect(replay.seed).toBe(summary?.seed);
    expect(replay.placements).toEqual(summary?.placements);
    expect(replay.skillEvents).toEqual(summary?.skillEvents);
  });
});
