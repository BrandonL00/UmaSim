import { characterTemplates, type CharacterTemplate } from "./characters";
import { skills as modeledSkills } from "./fixtures";
import { globalSkillOptions, globalSkills, unmodeledSourceSkillOptions } from "./skills";
import { selectSkillWithPrerequisites } from "../domain/skills/selection";
import { parseUmaJson } from "../domain/uma/repository";
import type { StoredUma, Strategy } from "../domain/uma/types";

type NamedEntry = {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  rarity: string;
  prerequisiteIds?: string[];
  supersedesIds?: string[];
};

export type CharacterCardChoice = Pick<
  CharacterTemplate,
  "cardId" | "name" | "outfitTitle" | "variant" | "thumbImg" | "uniqueSkillName"
>;

export class CharacterCardAmbiguityError extends Error {
  constructor(
    public readonly candidateIndex: number,
    public readonly query: string,
    public readonly choices: CharacterCardChoice[],
  ) {
    super(`"${query}" matches multiple character cards.`);
    this.name = "CharacterCardAmbiguityError";
  }
}

export type SkillChoice = {
  skillId: string;
  name: string;
  description: string;
  rarity: string;
  tier: string | null;
  prerequisiteNames: string[];
};

export class SkillAmbiguityError extends Error {
  constructor(
    public readonly candidateIndex: number,
    public readonly skillIndex: number,
    public readonly query: string,
    public readonly choices: SkillChoice[],
  ) {
    super(`"${query}" matches multiple skills.`);
    this.name = "SkillAmbiguityError";
  }
}

export class BuildNameRequiredError extends Error {
  constructor(
    public readonly candidateIndex: number,
    public readonly characterName: string,
  ) {
    super(`Uma ${candidateIndex + 1} needs a build name.`);
    this.name = "BuildNameRequiredError";
  }
}

export type MissingBuildNameRequest = {
  candidateIndex: number;
  suggestedName: string;
};

/** A source skill that was deliberately left out of the imported build. */
export type UmaImportWarning = {
  candidateIndex: number;
  skillName: string;
  reason: string;
  retained: boolean;
};

export type UmaImportResult = {
  runners: StoredUma[];
  warnings: UmaImportWarning[];
};

type ParseHarvestedUmaOptions = {
  buildNameSelections?: Record<number, string>;
  cardSelections?: Record<number, number>;
  skillSelections?: Record<string, string>;
};

class AmbiguousValueError<T> extends Error {
  constructor(
    public readonly query: string,
    public readonly matches: T[],
  ) {
    super(`"${query}" is ambiguous.`);
  }
}

const skillEntries: NamedEntry[] = [
  ...modeledSkills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    aliases: [skill.name],
    description: skill.tags.join(", "),
    rarity: skill.rarity,
    prerequisiteIds: skill.prerequisiteSkillIds,
    supersedesIds: skill.supersedesSkillIds,
  })),
  ...globalSkillOptions.map((skill) => {
    const source = globalSkills.find((candidate) => candidate.id === skill.sourceId);
    return {
      id: skill.id,
      name: skill.name,
      aliases: [
        skill.name,
        source?.oldEnglishName,
        source?.japaneseName,
      ].filter((alias): alias is string => Boolean(alias)),
      description: skill.description,
      rarity: skill.rarity,
      prerequisiteIds: skill.prerequisiteIds,
      supersedesIds: skill.supersedesIds,
    };
  }),
  ...unmodeledSourceSkillOptions.map((skill) => ({
    id: skill.id,
    name: skill.name,
    aliases: [skill.name, ...skill.aliases],
    description: skill.description,
    rarity: skill.rarity,
    prerequisiteIds: skill.prerequisiteIds,
    supersedesIds: skill.supersedesIds,
  })),
];

const strategyAliases: Record<string, Strategy> = {
  front: "front",
  runner: "front",
  "front runner": "front",
  escape: "front",
  pace: "pace",
  leader: "pace",
  "pace chaser": "pace",
  late: "late",
  betweener: "late",
  "late surger": "late",
  end: "end",
  chaser: "end",
  "end closer": "end",
};

export function parseHarvestedUmaJson(
  rawJson: string,
  options: ParseHarvestedUmaOptions = {},
): StoredUma[] {
  return parseHarvestedUmaJsonWithReport(rawJson, options).runners;
}

/**
 * Imports every runner that can be represented by the current engine, retaining
 * an explicit warning for each unknown or intentionally unsupported skill.
 */
export function parseHarvestedUmaJsonWithReport(
  rawJson: string,
  options: ParseHarvestedUmaOptions = {},
): UmaImportResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid JSON.");
  }

  const candidates = extractCandidates(parsed);

  const results = candidates.map((candidate, index) => {
    if (isStoredRunner(candidate) && isRecord(candidate)) {
      const selectedBuildName = options.buildNameSelections?.[index];
      if (!firstString(candidate.buildName) && !selectedBuildName) {
        throw new BuildNameRequiredError(index, firstString(candidate.characterName) ?? "Imported Uma");
      }
      return { runner: parseUmaJson(JSON.stringify({ ...candidate, buildName: selectedBuildName ?? candidate.buildName }))[0], warnings: [] };
    }

    return adaptHarvestedRunner(
      candidate,
      index,
      options.cardSelections?.[index] ?? null,
      options.skillSelections ?? {},
      options.buildNameSelections?.[index],
    );
  });

  return {
    runners: results.map((result) => result.runner),
    warnings: results.flatMap((result) => result.warnings),
  };
}

/** Identifies every missing build name before the importer begins interactive resolution. */
export function getMissingBuildNameRequests(
  rawJson: string,
  buildNameSelections: Record<number, string> = {},
): MissingBuildNameRequest[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid JSON.");
  }

  return extractCandidates(parsed).flatMap((candidate, candidateIndex) => {
    if (!isRecord(candidate)) return [];
    if (firstString(candidate.buildName, candidate.name, buildNameSelections[candidateIndex])) return [];

    const characterName = firstString(candidate.character, candidate.characterName, candidate.uma, candidate.umaName) ?? "Imported Uma";
    return [{
      candidateIndex,
      suggestedName: `${characterName} Build`,
    }];
  });
}

function adaptHarvestedRunner(
  candidate: unknown,
  index: number,
  selectedCardId: number | null,
  skillSelections: Record<string, string>,
  selectedBuildName: string | undefined,
): { runner: StoredUma; warnings: UmaImportWarning[] } {
  if (!isRecord(candidate)) {
    throw new Error(`Uma ${index + 1} must be an object.`);
  }

  const characterQuery = firstString(
    candidate.character,
    candidate.characterName,
    candidate.uma,
    candidate.umaName,
  );
  const variantQuery = firstString(candidate.variant, candidate.outfit, candidate.outfitTitle);
  if (!characterQuery && selectedCardId === null) {
    throw new Error(`Uma ${index + 1} needs a character name.`);
  }

  const character = resolveCharacterCard(selectedCardId, characterQuery, variantQuery, index);
  const buildName = firstString(candidate.buildName, candidate.name, selectedBuildName);
  if (!buildName) {
    throw new BuildNameRequiredError(index, character.name);
  }
  const strategy = resolveStrategy(candidate.strategy, character.defaultStrategy);
  const skillInputs = extractSkillInputs(candidate.skills ?? candidate.skillNames);
  const warnings: UmaImportWarning[] = [];
  const resolvedSkillIds = skillInputs.flatMap((skill, skillIndex) => {
    try {
      const skillId = resolveSkillId(
        skill,
        index,
        skillIndex,
        skillSelections[createSkillSelectionKey(index, skillIndex)] ?? null,
      );
      const knownUnmodeledSkill = unmodeledSourceSkillOptions.find((candidate) => candidate.id === skillId);
      if (knownUnmodeledSkill) {
        warnings.push({
          candidateIndex: index,
          skillName: knownUnmodeledSkill.name,
          reason: knownUnmodeledSkill.unmodeledReason,
          retained: true,
        });
      }
      return [skillId];
    } catch (error) {
      if (isUnknownSkillError(error)) {
        warnings.push({
          candidateIndex: index,
          skillName: skill.name,
          reason: getUnsupportedSkillReason(skill.name),
          retained: false,
        });
        return [];
      }
      throw error;
    }
  });
  const selectedSkillIds = resolvedSkillIds.reduce<string[]>(
    (selected, skillId) => selectSkillWithPrerequisites(selected, skillId, skillEntries),
    [],
  );

  const storedCandidate = {
    id: firstString(candidate.id) ?? createBuildId(character, buildName, index),
    name: character.name,
    cardId: character.cardId,
    characterId: character.characterId,
    characterName: character.name,
    outfitTitle: character.outfitTitle,
    variant: character.variant,
    buildName,
    stats: candidate.stats,
    aptitudes: candidate.aptitudes ?? character.aptitudes,
    strategy,
    uniqueSkillId: character.uniqueSkillId,
    uniqueSkillLevel: candidate.uniqueSkillLevel ?? 1,
    skillIds: selectedSkillIds,
  };

  return { runner: parseUmaJson(JSON.stringify(storedCandidate))[0], warnings };
}

function isUnknownSkillError(error: unknown) {
  return error instanceof Error && error.message.startsWith("No known skill matched");
}

function getUnsupportedSkillReason(skillName: string) {
  return "It is not in the simulator's skill dictionary, so it was not added to avoid inventing its behavior.";
}

function resolveCharacterCard(
  cardId: number | null,
  characterQuery: string | null,
  variantQuery: string | null,
  candidateIndex: number,
): CharacterTemplate {
  if (cardId !== null) {
    const exactCard = characterTemplates.find((character) => character.cardId === cardId);
    if (!exactCard) {
      throw new Error(`No Global character card matched cardId ${cardId}.`);
    }
    return exactCard;
  }

  const query = [variantQuery, characterQuery].filter(Boolean).join(" ");
  const entries = characterTemplates.map((character) => ({
    value: character,
    names: [character.displayName, ...character.aliases],
  }));

  if (!variantQuery && characterQuery) {
    const rawQuery = characterQuery.trim().toLowerCase();
    const normalizedQuery = normalizeSearch(characterQuery);
    const baseMatches = characterTemplates.filter(
      (character) =>
        !character.variant &&
        Math.max(
          matchScore(rawQuery, normalizedQuery, character.name),
          matchScore(rawQuery, normalizedQuery, character.nameJp),
        ) >= 70,
    );

    if (baseMatches.length === 1) {
      return baseMatches[0];
    }
  }

  try {
    return resolveNamedValue(query, entries, "character card");
  } catch (error) {
    if (error instanceof AmbiguousValueError) {
      throw new CharacterCardAmbiguityError(
        candidateIndex,
        query,
        error.matches.map((character) => ({
          cardId: character.cardId,
          name: character.name,
          outfitTitle: character.outfitTitle,
          variant: character.variant,
          thumbImg: character.thumbImg,
          uniqueSkillName: character.uniqueSkillName,
        })),
      );
    }
    throw error;
  }
}

function resolveSkillId(
  input: SkillInput,
  candidateIndex: number,
  skillIndex: number,
  selectedSkillId: string | null,
): string {
  if (selectedSkillId) {
    if (!skillEntries.some((skill) => skill.id === selectedSkillId)) {
      throw new Error(`Unknown selected skill ${selectedSkillId}.`);
    }
    return selectedSkillId;
  }

  const tier = normalizeTierHint(input.tier);
  const candidates = tier
    ? skillEntries.filter((skill) => getSkillTier(skill.name) === tier)
    : skillEntries;
  const entries = candidates.map((skill) => ({
    value: skill,
    names: skill.aliases,
  }));

  try {
    return resolveNamedValue(input.name, entries, "skill").id;
  } catch (error) {
    if (error instanceof AmbiguousValueError) {
      const matches = error.matches as NamedEntry[];
      throw new SkillAmbiguityError(
        candidateIndex,
        skillIndex,
        input.name,
        matches.map((skill) => ({
          skillId: skill.id,
          name: skill.name,
          description: skill.description,
          rarity: skill.rarity,
          tier: getSkillTier(skill.name),
          prerequisiteNames: (skill.prerequisiteIds ?? [])
            .map((id: string) => skillEntries.find((candidate) => candidate.id === id)?.name)
            .filter((name: string | undefined): name is string => Boolean(name)),
        })),
      );
    }
    throw error;
  }
}

function resolveNamedValue<T>(
  query: string,
  entries: Array<{ value: T; names: string[] }>,
  label: string,
): T {
  const rawQuery = query.trim().toLowerCase();
  const normalizedQuery = normalizeSearch(query);
  const scored = entries
    .map((entry) => {
      const scores = entry.names.map((name) => matchScore(rawQuery, normalizedQuery, name));
      return { entry, score: Math.max(...scores) };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scored.length) {
    throw new Error(`No known ${label} matched "${query}".`);
  }

  const bestScore = scored[0].score;
  let best = scored.filter((candidate) => candidate.score === bestScore);

  if (label === "skill" && best.length > 1) {
    const globalMatches = best.filter((candidate) => {
      const value = candidate.entry.value;
      return (
        (typeof value === "string" && value.startsWith("gt-")) ||
        (isRecord(value) && typeof value.id === "string" && value.id.startsWith("gt-"))
      );
    });
    if (globalMatches.length === 1) {
      best = globalMatches;
    }
  }

  if (label === "skill" && best.length > 1) {
    const nonNegative = best.filter((candidate) =>
      candidate.entry.names.every((name) => !name.includes("×")),
    );
    if (nonNegative.length === 1) {
      best = nonNegative;
    }
  }

  if (best.length > 1) {
    throw new AmbiguousValueError(
      query,
      best.slice(0, 8).map((candidate) => candidate.entry.value),
    );
  }

  return best[0].entry.value;
}

function matchScore(rawQuery: string, normalizedQuery: string, name: string): number {
  const rawName = name.trim().toLowerCase();
  const normalizedName = normalizeSearch(name);

  if (rawName === rawQuery) return 100;
  if (!normalizedName || !normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 90;
  if (normalizedName.startsWith(normalizedQuery)) return 70;
  if (normalizedName.includes(normalizedQuery)) return 60;
  if (normalizedName.length >= 4 && normalizedQuery.includes(normalizedName)) return 50;
  return 0;
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/◎/g, " double circle ")
    .replace(/○/g, " circle ")
    .replace(/×/g, " penalty ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

type SkillInput = {
  name: string;
  tier: string | null;
};

function extractSkillInputs(value: unknown): SkillInput[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error('"skills" must be an array of skill names.');
  }

  return value.map((skill, index) => {
    if (typeof skill === "string" && skill.trim()) {
      return { name: skill.trim(), tier: null };
    }

    if (isRecord(skill)) {
      const name = firstString(skill.name, skill.skill);
      if (name) {
        return {
          name,
          tier: extractTierHint(skill),
        };
      }
    }

    throw new Error(`Skill ${index + 1} must be a name string.`);
  });
}

function extractTierHint(skill: Record<string, unknown>): string | null {
  const textTier = firstString(skill.tier, skill.rank);
  if (textTier) return textTier;

  if (skill.level === 1) return "circle";
  if (skill.level === 2) return "double-circle";
  if (typeof skill.level === "string" && skill.level.trim()) return skill.level.trim();
  return null;
}

function normalizeTierHint(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("◎")) return "double-circle";
  if (value.includes("○")) return "circle";

  const normalized = normalizeSearch(value);
  const aliases: Record<string, string> = {
    circle: "circle",
    single: "circle",
    "single circle": "circle",
    o: "circle",
    double: "double-circle",
    "double circle": "double-circle",
    "double-circle": "double-circle",
    oo: "double-circle",
  };
  const tier = aliases[normalized];

  if (!tier) {
    throw new Error(`Unknown skill tier "${value}". Use "circle" or "double-circle".`);
  }
  return tier;
}

function getSkillTier(name: string): string | null {
  if (name.includes("◎")) return "double-circle";
  if (name.includes("○")) return "circle";
  return null;
}

export function createSkillSelectionKey(candidateIndex: number, skillIndex: number): string {
  return `${candidateIndex}:${skillIndex}`;
}

function resolveStrategy(value: unknown, fallback: Strategy): Strategy {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error("strategy must be a string.");

  const resolved = strategyAliases[normalizeSearch(value)];
  if (!resolved) {
    throw new Error(`Unknown strategy "${value}".`);
  }

  return resolved;
}

function createBuildId(character: CharacterTemplate, buildName: string, index: number): string {
  const buildSlug = normalizeSearch(buildName).replace(/\s+/g, "-") || "build";
  return `imported-${character.cardId}-${buildSlug}-${Date.now()}-${index}`;
}

function extractCandidates(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.umas)) return parsed.umas;
  if (isRecord(parsed)) return [parsed];
  throw new Error("JSON must contain an Uma object, an array, or an object with an `umas` array.");
}

function isStoredRunner(value: unknown): boolean {
  return isRecord(value) && value.aptitudes !== undefined && value.skillIds !== undefined;
}

function firstString(...values: unknown[]): string | null {
  const match = values.find((value) => typeof value === "string" && value.trim());
  return typeof match === "string" ? match.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
