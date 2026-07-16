import { describe, expect, it } from "vitest";
import { championsMeetingPresets, presetDataMeta, racePresets } from "../data/presets";
import { formatChampionsMeetingPresetName } from "../domain/race/presets";
import { globalTracks } from "../data/tracks";

describe("race preset catalog", () => {
  const trackIds = new Set(globalTracks.map((track) => track.id));

  it("contains the imported Global race catalog", () => {
    expect(presetDataMeta.racePresetCount).toBe(285);
    expect(racePresets).toHaveLength(285);
    expect(racePresets.every((preset) => trackIds.has(preset.trackId))).toBe(true);
    expect(racePresets.every((preset) => preset.bannerId)).toBe(true);
  });

  it("preserves the Global and JP Champions Meeting archive", () => {
    expect(presetDataMeta.championsMeetingPresetCount).toBe(62);
    expect(championsMeetingPresets.some((preset) => preset.server === "global")).toBe(true);
    expect(championsMeetingPresets.some((preset) => preset.server === "jp")).toBe(true);

    for (const preset of championsMeetingPresets) {
      expect(preset.trackCandidateIds.every((trackId) => trackIds.has(trackId))).toBe(true);
    }
  });

  it("keeps exact race conditions for applyable Champions Meetings", () => {
    const applyable = championsMeetingPresets.filter((preset) => preset.trackId);

    expect(applyable.length).toBeGreaterThan(0);
    for (const preset of applyable) {
      expect(trackIds.has(preset.trackId!)).toBe(true);
      expect(preset.season).not.toBeNull();
      expect(preset.weather).not.toBeNull();
      expect(preset.groundCondition).not.toBeNull();
    }
  });

  it("labels Champions Meeting presets by their server timeline and event number", () => {
    const firstGlobal = championsMeetingPresets.find((preset) => preset.server === "global" && preset.sourceEventId === 1);
    const firstJapan = championsMeetingPresets.find((preset) => preset.server === "jp" && preset.sourceEventId === 1);

    expect(firstGlobal && formatChampionsMeetingPresetName(firstGlobal)).toBe("CM1 — Taurus Cup");
    expect(firstJapan && formatChampionsMeetingPresetName(firstJapan)).toBe("JP CM1 — Taurus Cup");
  });
});
