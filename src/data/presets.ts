import generatedGlobalTracks from "./generated/gametoraGlobalTracks.json";
import type { ChampionsMeetingPreset, RacePreset } from "../domain/race/presets";

export const racePresets = generatedGlobalTracks.racePresets as RacePreset[];
export const championsMeetingPresets = generatedGlobalTracks.championsMeetingPresets as ChampionsMeetingPreset[];

export const presetDataMeta = {
  generatedAt: generatedGlobalTracks.generatedAt,
  source: generatedGlobalTracks.source,
  racePresetCount: racePresets.length,
  championsMeetingPresetCount: championsMeetingPresets.length,
};
