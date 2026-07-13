import type { RaceResult, RaceSetup, Track } from "./types";

export type RaceRunProvenance = {
  engineVersion: string;
  server: string;
  source: string;
  snapshotGeneratedAt: string;
};

export const raceRunHistoryStorageKey = "umasim.race-run-history.v1";
export const raceRunHistoryLimit = 1;

export type RaceRunLog = {
  version: 1;
  id: string;
  createdAt: string;
  track: {
    id: string;
    name: string;
    venue?: string;
    distanceMeters: number;
  };
  setup: RaceSetup;
  result: RaceResult;
  provenance?: RaceRunProvenance;
};

export type RaceRunHistoryDocument = {
  version: 1;
  exportedAt: string;
  runs: RaceRunLog[];
};

export function createRaceRunLog(
  setup: RaceSetup,
  track: Track,
  result: RaceResult,
  provenance?: RaceRunProvenance,
): RaceRunLog {
  return {
    version: 1,
    id: createRunLogId(),
    createdAt: new Date().toISOString(),
    track: {
      id: track.id,
      name: track.name,
      venue: track.venue,
      distanceMeters: track.distanceMeters,
    },
    setup,
    result,
    provenance,
  };
}

export function appendRaceRunLog(
  current: RaceRunLog[],
  log: RaceRunLog,
  limit = raceRunHistoryLimit,
): RaceRunLog[] {
  const deduped = current.filter((entry) => entry.id !== log.id);

  return [log, ...deduped].slice(0, limit);
}

export function createRaceRunHistoryDocument(runs: RaceRunLog[]): RaceRunHistoryDocument {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    runs,
  };
}

export function loadRaceRunHistory(): RaceRunLog[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  const stored = localStorage.getItem(raceRunHistoryStorageKey);
  if (!stored) {
    return [];
  }

  try {
    return parseRaceRunHistory(stored);
  } catch {
    return [];
  }
}

export function saveRaceRunHistory(runs: RaceRunLog[]) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(raceRunHistoryStorageKey, JSON.stringify(createRaceRunHistoryDocument(runs)));
  } catch {
    const trimmedRuns = runs.slice(0, Math.max(1, Math.floor(runs.length / 2)));
    localStorage.setItem(raceRunHistoryStorageKey, JSON.stringify(createRaceRunHistoryDocument(trimmedRuns)));
  }
}

function parseRaceRunHistory(rawJson: string): RaceRunLog[] {
  const parsed = JSON.parse(rawJson) as unknown;
  const candidates = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.runs)
      ? parsed.runs
      : [];

  return candidates.filter(isRaceRunLog).slice(0, raceRunHistoryLimit);
}

function isRaceRunLog(value: unknown): value is RaceRunLog {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    isRecord(value.track) &&
    typeof value.track.id === "string" &&
    typeof value.track.name === "string" &&
    typeof value.track.distanceMeters === "number" &&
    isRecord(value.setup) &&
    typeof value.setup.seed === "string" &&
    typeof value.setup.trackId === "string" &&
    Array.isArray(value.setup.runners) &&
    isRecord(value.result) &&
    Array.isArray(value.result.placements) &&
    Array.isArray(value.result.runners) &&
    Array.isArray(value.result.timeline) &&
    Array.isArray(value.result.skillEvents) &&
    Array.isArray(value.result.warnings)
  );
}

function createRunLogId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
