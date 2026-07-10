import { describe, expect, it } from "vitest";
import {
  createUmaLibraryDocument,
  mergeUmaLibrary,
  parseUmaJson,
} from "../domain/uma/repository";
import type { StoredUma } from "../domain/uma/types";

const validUma: StoredUma = {
  id: "saved-special-week",
  name: "Special Week",
  cardId: 100101,
  characterId: 1001,
  characterName: "Special Week",
  outfitTitle: "[Special Dreamer]",
  variant: null,
  buildName: "Medium Pace Build",
  stats: { speed: 900, stamina: 800, power: 700, guts: 500, wit: 600 },
  aptitudes: {
    surface: { turf: "A", dirt: "G" },
    distance: { sprint: "F", mile: "C", medium: "A", long: "A" },
    strategy: { front: "G", pace: "A", late: "A", end: "C" },
  },
  strategy: "pace",
  uniqueSkillId: "gt-100011",
  uniqueSkillLevel: 3,
  skillIds: ["gt-200512"],
};

describe("Uma repository", () => {
  it("imports a single raw Uma object", () => {
    expect(parseUmaJson(JSON.stringify(validUma))).toEqual([validUma]);
  });

  it("imports a versioned library document", () => {
    const parsed = parseUmaJson(JSON.stringify({ version: 3, umas: [validUma] }));

    expect(parsed).toEqual([validUma]);
  });

  it("discards mood from legacy stored JSON", () => {
    const [parsed] = parseUmaJson(JSON.stringify({ ...validUma, mood: "great" }));

    expect(parsed).toEqual(validUma);
    expect(parsed).not.toHaveProperty("mood");
    expect(createUmaLibraryDocument([parsed]).umas[0]).not.toHaveProperty("mood");
  });

  it("rejects malformed runner data", () => {
    expect(() => parseUmaJson('{"name":"Broken"}')).toThrow("characterName");
  });

  it("merges imported Umas by id", () => {
    const updated = {
      ...validUma,
      buildName: "Special Week Updated",
      stats: { ...validUma.stats, speed: 1000 },
    };

    expect(mergeUmaLibrary([validUma], [updated])).toEqual([updated]);
  });
});
