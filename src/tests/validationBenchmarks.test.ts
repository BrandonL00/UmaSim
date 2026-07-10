import { describe, expect, it } from "vitest";
import { countWinners, runBatchBenchmark } from "../validation/benchmarks";
import { statisticalBenchmarks } from "../validation/scenarios";

describe("validation benchmark layer", () => {
  it("fast-runner-win-rate", () => {
    const benchmark = statisticalBenchmarks.find((candidate) => candidate.id === "fast-runner-win-rate");

    expect(benchmark).toBeDefined();

    const result = runBatchBenchmark(benchmark!);
    const winners = countWinners(result);
    const fastWins = winners.get("fast-runner") ?? 0;

    expect(fastWins).toBeGreaterThanOrEqual(20);
  });
});

