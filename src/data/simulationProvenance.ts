import { raceEngineVersion } from "../domain/race/engineVersion";
import { characterDataMeta } from "./characters";
import { globalSkillDataMeta } from "./skills";
import { globalTrackDataMeta } from "./tracks";

export type SimulationProvenance = {
  engineVersion: string;
  server: "global";
  source: "gametora.com";
  snapshotGeneratedAt: string;
  datasets: {
    characters: { generatedAt: string; manifestHash: string };
    skills: { generatedAt: string; manifestHash: string };
    tracks: { generatedAt: string; trackHash: string; raceHash: string };
  };
};

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing ${label} in generated data metadata.`);
  }

  return value;
}

const generatedAt = [
  characterDataMeta.generatedAt,
  globalSkillDataMeta.generatedAt,
  globalTrackDataMeta.generatedAt,
].sort();

export const simulationProvenance: SimulationProvenance = {
  engineVersion: raceEngineVersion,
  server: "global",
  source: "gametora.com",
  snapshotGeneratedAt: generatedAt.at(-1) ?? globalSkillDataMeta.generatedAt,
  datasets: {
    characters: {
      generatedAt: characterDataMeta.generatedAt,
      manifestHash: requireString(characterDataMeta.source.manifestHash, "character manifest hash"),
    },
    skills: {
      generatedAt: globalSkillDataMeta.generatedAt,
      manifestHash: requireString(globalSkillDataMeta.source.manifestHash, "skill manifest hash"),
    },
    tracks: {
      generatedAt: globalTrackDataMeta.generatedAt,
      trackHash: requireString(globalTrackDataMeta.source.trackHash, "track hash"),
      raceHash: requireString(globalTrackDataMeta.source.raceHash, "race hash"),
    },
  },
};

export function formatSnapshotDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(isoDate));
}
