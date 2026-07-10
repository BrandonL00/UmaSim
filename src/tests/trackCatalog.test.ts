import { describe, expect, it } from "vitest";
import { globalTrackDataMeta, globalTracks } from "../data/tracks";

describe("Global track catalog", () => {
  it("contains imported Global course layouts", () => {
    expect(globalTrackDataMeta.server).toBe("global");
    expect(globalTracks).toHaveLength(78);
  });

  it("covers every course from start to finish with valid segments", () => {
    for (const track of globalTracks) {
      expect(track.segments[0].startMeters).toBe(0);
      expect(track.segments.at(-1)?.endMeters).toBe(track.distanceMeters);

      for (let index = 1; index < track.segments.length; index += 1) {
        expect(track.segments[index].startMeters).toBe(track.segments[index - 1].endMeters);
      }
    }
  });
});
