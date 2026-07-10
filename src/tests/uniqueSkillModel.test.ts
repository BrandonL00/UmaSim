import { describe, expect, it } from "vitest";
import type { GlobalSkill } from "../data/skills";
import { resolveOwnedUniqueSkill } from "../domain/race/uniqueSkillModel";

const baseSkill: GlobalSkill = {
  id: "100011",
  name: "Owner Unique",
  oldEnglishName: null,
  japaneseName: null,
  description: "Test unique",
  oldEnglishDescription: null,
  japaneseDescription: null,
  rarity: "unique",
  rarityValue: null,
  iconId: null,
  cost: null,
  activation: null,
  tags: ["unique"],
  versionIds: [],
  prerequisiteIds: [],
  supersedesIds: [],
  conditionGroups: [
    {
      condition: "phase_random==1",
      precondition: null,
      baseTimeMs: 20000,
      cooldownMs: null,
      effects: [{ type: 27, value: 2000 }],
    },
  ],
  geneVersion: null,
  sourceIds: {
    characterIds: [],
    characterEvoIds: [],
    scenarioIds: [],
  },
  availability: {
    globalReleased: true,
    hasGlobalConditionOverride: false,
    hasGlobalSourceOverride: false,
  },
};

describe("uniqueSkillModel", () => {
  it("scales owner unique effects by level", () => {
    const levelOne = resolveOwnedUniqueSkill(baseSkill, {
      ownedUniqueSkillId: "gt-100011",
      uniqueSkillLevel: 1,
    });
    const levelSix = resolveOwnedUniqueSkill(baseSkill, {
      ownedUniqueSkillId: "gt-100011",
      uniqueSkillLevel: 6,
    });

    expect(levelOne.conditionGroups[0]?.effects[0]?.value).toBe(2000);
    expect(levelSix.conditionGroups[0]?.effects[0]?.value).toBeGreaterThan(2000);
  });

  it("does not scale inherited unique variants through the owner path", () => {
    const inherited = resolveOwnedUniqueSkill(baseSkill, {
      ownedUniqueSkillId: "gt-999999",
      uniqueSkillLevel: 6,
    });

    expect(inherited.conditionGroups[0]?.effects[0]?.value).toBe(2000);
  });
});
