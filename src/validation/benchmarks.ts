import { simulateRace } from "../domain/race/simulateRace";
import type { BatchBenchmark, BatchBenchmarkResult } from "./types";

export function runBatchBenchmark(benchmark: BatchBenchmark): BatchBenchmarkResult {
  return {
    benchmark,
    races: benchmark.setups.map((setup) => simulateRace(setup, benchmark.catalog)),
  };
}

export function countWinners(result: BatchBenchmarkResult) {
  const counts = new Map<string, number>();

  for (const race of result.races) {
    const winner = race.placements[0]?.runnerId;
    if (!winner) continue;
    counts.set(winner, (counts.get(winner) ?? 0) + 1);
  }

  return counts;
}

