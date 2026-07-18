import { describe, expect, it } from "vitest";
import {
  BuildNameRequiredError,
  CharacterCardAmbiguityError,
  createSkillSelectionKey,
  getMissingBuildNameRequests,
  parseHarvestedUmaJson,
  parseHarvestedUmaJsonWithReport,
  SkillAmbiguityError,
} from "../data/umaImport";

const harvestedUma = {
  character: "special week",
  buildName: "Special Week Screenshot",
  stats: {
    speed: 1000,
    stamina: 800,
    power: 900,
    guts: 500,
    wit: 700,
  },
  strategy: "Pace Chaser",
  uniqueSkillLevel: 4,
  skills: ["Swinging Maestro"],
};

describe("harvested Uma import", () => {
  it("asks for a build name when the import does not provide one", () => {
    const { buildName: _buildName, ...unnamed } = harvestedUma;

    expect(() => parseHarvestedUmaJson(JSON.stringify({ ...unnamed, skills: [] }))).toThrow(BuildNameRequiredError);

    const [runner] = parseHarvestedUmaJson(JSON.stringify({ ...unnamed, skills: [] }), {
      buildNameSelections: { 0: "Spring target build" },
    });
    expect(runner.buildName).toBe("Spring target build");
  });

  it("collects every missing build name in a batch before import resolution", () => {
    const { buildName: _firstBuildName, ...first } = harvestedUma;
    const requests = getMissingBuildNameRequests(JSON.stringify({
      umas: [first, { ...first, character: "Silence Suzuka" }],
    }));

    expect(requests).toEqual([
      { candidateIndex: 0, suggestedName: "special week Build" },
      { candidateIndex: 1, suggestedName: "Silence Suzuka Build" },
    ]);
  });

  it("resolves character and skill names into stored IDs", () => {
    const [runner] = parseHarvestedUmaJson(JSON.stringify(harvestedUma));

    expect(runner.characterName).toBe("Special Week");
    expect(runner.cardId).toBe(100101);
    expect(runner.outfitTitle).toBe("[Special Dreamer]");
    expect(runner.buildName).toBe("Special Week Screenshot");
    expect(runner.strategy).toBe("pace");
    expect(runner.uniqueSkillId).toBe("gt-100011");
    expect(runner.uniqueSkillLevel).toBe(4);
    expect(runner).not.toHaveProperty("mood");
    expect(runner.aptitudes.distance.medium).toBe("A");
    expect(runner.skillIds).toEqual(expect.arrayContaining(["gt-200351", "gt-200352"]));
    expect(runner.skillIds).not.toContain("gt-100011");
  });

  it("supports unique substring character searches", () => {
    const { strategy: _strategy, ...withoutStrategy } = harvestedUma;
    const [runner] = parseHarvestedUmaJson(
      JSON.stringify({
        ...withoutStrategy,
        character: "silence suz",
        skills: [],
      }),
    );

    expect(runner.uniqueSkillId).toBe("gt-100021");
    expect(runner.strategy).toBe("front");
  });

  it("accepts skill objects with a name field", () => {
    const [runner] = parseHarvestedUmaJson(
      JSON.stringify({
        ...harvestedUma,
        skills: [{ name: "Swinging Maestro" }],
      }),
    );

    expect(runner.skillIds).toContain("gt-200351");
  });

  it("resolves outfit aliases", () => {
    const [runner] = parseHarvestedUmaJson(
      JSON.stringify({
        ...harvestedUma,
        character: "Camping Taiki",
        buildName: "Camping Mile Build",
        skills: [],
      }),
    );

    expect(runner.cardId).toBe(101002);
    expect(runner.variant).toBe("camping");
    expect(runner.outfitTitle).toContain("Bubblegum");
  });

  it("returns outfit choices and resumes with an internal selection", () => {
    const ambiguous = {
      ...harvestedUma,
      character: "Bubblegum Memories Taiki Shuttle",
      skills: [],
    };
    let ambiguity: CharacterCardAmbiguityError | null = null;

    try {
      parseHarvestedUmaJson(JSON.stringify(ambiguous));
    } catch (error) {
      if (error instanceof CharacterCardAmbiguityError) ambiguity = error;
    }

    expect(ambiguity).not.toBeNull();
    expect(ambiguity?.choices.map((choice) => choice.cardId)).toEqual(
      expect.arrayContaining([101001, 101002]),
    );

    const [selected] = parseHarvestedUmaJson(JSON.stringify(ambiguous), {
      cardSelections: { 0: 101002 },
    });
    expect(selected.cardId).toBe(101002);
    expect(selected.variant).toBe("camping");
  });

  it("resolves explicit skill tiers without prompting", () => {
    const [runner] = parseHarvestedUmaJson(
      JSON.stringify({
        ...harvestedUma,
        skills: [{ name: "Mile Straightaways", tier: "double-circle" }],
      }),
    );

    expect(runner.skillIds).toContain("gt-201031");
    expect(runner.skillIds).toContain("gt-201032");
  });

  it("returns skill tier choices and resumes with an internal selection", () => {
    const ambiguous = {
      ...harvestedUma,
      skills: ["Mile Straightaways"],
    };
    let ambiguity: SkillAmbiguityError | null = null;

    try {
      parseHarvestedUmaJson(JSON.stringify(ambiguous));
    } catch (error) {
      if (error instanceof SkillAmbiguityError) ambiguity = error;
    }

    expect(ambiguity).not.toBeNull();
    expect(ambiguity?.choices.map((choice) => choice.name)).toEqual(
      expect.arrayContaining(["Mile Straightaways ◎", "Mile Straightaways ○"]),
    );

    const [selected] = parseHarvestedUmaJson(JSON.stringify(ambiguous), {
      skillSelections: { [createSkillSelectionKey(0, 0)]: "gt-201031" },
    });
    expect(selected.skillIds).toContain("gt-201031");
  });

  it("reports unknown characters and keeps importing when a skill is unsupported", () => {
    expect(() =>
      parseHarvestedUmaJson(JSON.stringify({ ...harvestedUma, character: "Not A Real Uma" })),
    ).toThrow("No known character");

    const result = parseHarvestedUmaJsonWithReport(JSON.stringify({
      ...harvestedUma,
      skills: ["Swinging Maestro", "Not A Real Skill"],
    }));

    expect(result.runners[0]?.skillIds).toContain("gt-200351");
    expect(result.warnings).toEqual([expect.objectContaining({
      candidateIndex: 0,
      skillName: "Not A Real Skill",
      reason: expect.stringContaining("not in the simulator's skill dictionary"),
      retained: false,
    })]);
  });

  it("retains known scenario skills while disclosing that they are unmodeled", () => {
    const result = parseHarvestedUmaJsonWithReport(JSON.stringify({
      ...harvestedUma,
      skills: ["Ignited Spirit SPD"],
    }));

    expect(result.runners[0]?.skillIds).toEqual(["gt-210012"]);
    expect(result.warnings[0]).toEqual(expect.objectContaining({
      skillName: "Ignited Spirit SPD",
      reason: expect.stringContaining("Aoharu Team rank scaling"),
      retained: true,
    }));
  });
});
