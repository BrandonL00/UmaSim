import { describe, expect, it } from "vitest";
import { characterTemplates } from "../data/characters";

describe("character unique skill resolution", () => {
  it("prefers the stronger owner unique when a card lists multiple unique ids", () => {
    const goldShip = characterTemplates.find((character) => character.cardId === 100701);
    const vodka = characterTemplates.find((character) => character.cardId === 100801);

    expect(goldShip?.uniqueSkillId).toBe("gt-100071");
    expect(goldShip?.uniqueSkillName).toBe("Anchors Aweigh!");
    expect(goldShip?.inheritedUniqueSkillId).toBe("gt-900071");
    expect(goldShip?.uniqueSkillCandidateIds).toEqual(["gt-10071", "gt-100071"]);
    expect(vodka?.uniqueSkillId).toBe("gt-100081");
    expect(vodka?.uniqueSkillName).toBe("Cut and Drive!");
    expect(vodka?.inheritedUniqueSkillId).toBe("gt-900081");
  });

  it("keeps single-unique cards mapped directly to their owner unique", () => {
    const specialWeek = characterTemplates.find((character) => character.cardId === 100101);

    expect(specialWeek?.uniqueSkillId).toBe("gt-100011");
    expect(specialWeek?.uniqueSkillName).toBe("Shooting Star");
    expect(specialWeek?.inheritedUniqueSkillId).toBe("gt-900011");
  });
});
