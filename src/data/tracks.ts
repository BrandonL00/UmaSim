import type { Track } from "../domain/race/types";
import generatedGlobalTracks from "./generated/gametoraGlobalTracks.json";

export const globalTrackDataMeta = {
  generatedAt: generatedGlobalTracks.generatedAt,
  server: generatedGlobalTracks.server,
  ruleset: generatedGlobalTracks.ruleset,
  source: generatedGlobalTracks.source,
  count: generatedGlobalTracks.count,
};

export const globalTracks = generatedGlobalTracks.tracks as Track[];
