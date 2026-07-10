import type { Skill } from "../skills/types";
import { simulateRace } from "./simulateRace";
import type { RaceCatalog, RaceResult, RaceSetup } from "./types";

export type BatchCatalog = RaceCatalog & { skills: Skill[] };

export type BatchSkillSummary = {
  skillId: string;
  skillName: string;
  activationCount: number;
  activationRate: number;
  modeled: boolean;
};

export type BatchRunnerSummary = {
  runnerId: string;
  runnerName: string;
  wins: number;
  winRate: number;
  topThreeRate: number;
  averagePlace: number;
  averageFinishTime: number;
  finishTimeP90: number;
  averageRemainingStamina: number;
  skills: BatchSkillSummary[];
};

export type RaceBatchResult = {
  baseSeed: string;
  setup: RaceSetup;
  runCount: number;
  runs: BatchRunSummary[];
  runners: BatchRunnerSummary[];
};

export type BatchRunSummary = {
  index: number;
  seed: string;
  placements: RaceResult["placements"];
  skillEvents: RaceResult["skillEvents"];
};

/** Runs a deterministic seed family and retains only compact per-run summaries. */
export function simulateRaceBatch(setup: RaceSetup, catalog: BatchCatalog, runCount: number): RaceBatchResult {
  if (!Number.isInteger(runCount) || runCount < 1) {
    throw new Error("Batch run count must be a positive integer.");
  }

  const races = Array.from({ length: runCount }, (_, index) =>
    simulateRace({ ...setup, seed: createBatchSeed(setup.seed, index) }, catalog, { debugSkills: index === 0 }),
  );
  const firstRace = races[0]!;
  const debugByRunner = new Map<string, NonNullable<RaceResult["skillDebug"]>>();

  for (const entry of firstRace.skillDebug ?? []) {
    debugByRunner.set(entry.runnerId, [...(debugByRunner.get(entry.runnerId) ?? []), entry]);
  }

  return {
    baseSeed: setup.seed,
    setup,
    runCount,
    runs: races.map((race, index) => ({
      index: index + 1,
      seed: race.seed,
      placements: race.placements,
      skillEvents: race.skillEvents,
    })),
    runners: setup.runners
      .map((runner) => summarizeRunner(runner.id, runner.name, races, debugByRunner.get(runner.id) ?? []))
      .sort((left, right) => left.averagePlace - right.averagePlace || left.runnerName.localeCompare(right.runnerName)),
  };
}

/** Regenerates a detailed, inspectable replay from a compact batch run record. */
export function replayBatchRun(batch: RaceBatchResult, catalog: BatchCatalog, runIndex: number) {
  const run = batch.runs.find((candidate) => candidate.index === runIndex);

  if (!run) {
    throw new Error(`Unknown batch run ${runIndex}.`);
  }

  return simulateRace({ ...batch.setup, seed: run.seed }, catalog, { debugSkills: true });
}

function summarizeRunner(
  runnerId: string,
  runnerName: string,
  races: RaceResult[],
  debugEntries: NonNullable<RaceResult["skillDebug"]>,
): BatchRunnerSummary {
  const placements = races.map((race) => race.placements.find((placement) => placement.runnerId === runnerId)!);
  const summaries = races.map((race) => race.runners.find((runner) => runner.runnerId === runnerId)!);
  const activationCounts = new Map<string, number>();

  for (const race of races) {
    const triggered = new Set(
      race.skillEvents.filter((event) => event.runnerId === runnerId).map((event) => event.skillId),
    );
    triggered.forEach((skillId) => activationCounts.set(skillId, (activationCounts.get(skillId) ?? 0) + 1));
  }

  const finishTimes = summaries.map((summary) => summary.finishTime).sort((left, right) => left - right);

  return {
    runnerId,
    runnerName,
    wins: placements.filter((placement) => placement.place === 1).length,
    winRate: percentage(placements.filter((placement) => placement.place === 1).length, races.length),
    topThreeRate: percentage(placements.filter((placement) => placement.place <= 3).length, races.length),
    averagePlace: average(placements.map((placement) => placement.place)),
    averageFinishTime: average(summaries.map((summary) => summary.finishTime)),
    finishTimeP90: percentile(finishTimes, 0.9),
    averageRemainingStamina: average(summaries.map((summary) => summary.remainingStamina)),
    skills: debugEntries.map((entry) => ({
      skillId: entry.skillId,
      skillName: entry.skillName,
      activationCount: activationCounts.get(entry.skillId) ?? 0,
      activationRate: percentage(activationCounts.get(entry.skillId) ?? 0, races.length),
      modeled: entry.status !== "unmodeled",
    })),
  };
}

function createBatchSeed(baseSeed: string, index: number) {
  return `${baseSeed}::analysis-${index + 1}`;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function percentage(value: number, total: number) {
  return (value / Math.max(total, 1)) * 100;
}

function percentile(sortedValues: number[], percentileValue: number) {
  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[index] ?? 0;
}
