import type { GroundCondition, RaceSeason, Track, Weather } from "./types";

export type RacePreset = {
  id: string;
  sourceRaceId: number;
  bannerId: number | null;
  name: string;
  trackId: string;
  season: RaceSeason;
  entryCount: number | null;
  time: number | null;
  grade: number | null;
};

export type ChampionsMeetingPreset = {
  id: string;
  sourceEventId: number;
  name: string;
  server: "global" | "jp";
  resourceId: number;
  start: number;
  end: number;
  trackId: string | null;
  trackCandidateIds: string[];
  distanceMeters: number;
  surface: Track["surface"];
  direction: NonNullable<Track["direction"]>;
  season: RaceSeason | null;
  weather: Weather | null;
  groundCondition: GroundCondition | null;
};

export function formatChampionsMeetingPresetName(preset: ChampionsMeetingPreset): string {
  const prefix = preset.server === "global" ? "CM" : "JP CM";
  return `${prefix}${preset.sourceEventId} — ${preset.name}`;
}
