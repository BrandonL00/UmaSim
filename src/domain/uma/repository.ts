import type {
  AptitudeRank,
  DistanceCategory,
  StatKey,
  StoredUma,
  Strategy,
  Surface,
} from "./types";

export const umaLibraryStorageKey = "umasim.uma-library.v2";

export type UmaLibraryDocument = {
  version: 3;
  exportedAt: string;
  umas: StoredUma[];
};

const statKeys: StatKey[] = ["speed", "stamina", "power", "guts", "wit"];
const surfaces: Surface[] = ["turf", "dirt"];
const distances: DistanceCategory[] = ["sprint", "mile", "medium", "long"];
const strategies: Strategy[] = ["front", "pace", "late", "end"];
const ranks: AptitudeRank[] = ["G", "F", "E", "D", "C", "B", "A", "S"];

export function parseUmaJson(rawJson: string): StoredUma[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid JSON.");
  }

  const candidates = extractCandidates(parsed);
  return candidates.map((candidate, index) => normalizeRunner(candidate, index));
}

export function mergeUmaLibrary(current: StoredUma[], incoming: StoredUma[]): StoredUma[] {
  const merged = new Map(current.map((runner) => [runner.id, runner]));

  for (const runner of incoming) {
    merged.set(runner.id, runner);
  }

  return [...merged.values()].sort((left, right) =>
    left.characterName.localeCompare(right.characterName) || left.buildName.localeCompare(right.buildName),
  );
}

export function createUmaLibraryDocument(umas: StoredUma[]): UmaLibraryDocument {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    umas,
  };
}

export function loadUmaLibrary(): StoredUma[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  const stored = localStorage.getItem(umaLibraryStorageKey);
  if (!stored) {
    return [];
  }

  try {
    return parseUmaJson(stored);
  } catch {
    return [];
  }
}

export function saveUmaLibrary(umas: StoredUma[]) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(umaLibraryStorageKey, JSON.stringify(createUmaLibraryDocument(umas)));
}

function extractCandidates(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (isRecord(parsed) && Array.isArray(parsed.umas)) {
    return parsed.umas;
  }

  if (isRecord(parsed)) {
    return [parsed];
  }

  throw new Error("JSON must contain an Uma object, an array of Umas, or an object with an `umas` array.");
}

function normalizeRunner(candidate: unknown, index: number): StoredUma {
  if (!isRecord(candidate)) {
    throw new Error(`Uma ${index + 1} must be an object.`);
  }

  const characterName = optionalString(candidate.characterName);
  if (!characterName) {
    throw new Error(`Uma ${index + 1} characterName is required.`);
  }
  const buildName = optionalString(candidate.buildName) ?? `${characterName} Build`;
  const cardId = requiredInteger(candidate.cardId, `${buildName} cardId`);
  const characterId = requiredInteger(candidate.characterId, `${buildName} characterId`);
  const outfitTitle = requiredString(candidate.outfitTitle, `${buildName} outfitTitle`);
  const variant = optionalString(candidate.variant);
  const name = variant ? `${characterName} (${toTitleCase(variant)})` : characterName;
  const id = optionalString(candidate.id) ?? createImportedId(buildName, index);
  const stats = requiredRecord(candidate.stats, `${buildName} stats`);
  const aptitudes = requiredRecord(candidate.aptitudes, `${buildName} aptitudes`);
  const surface = requiredRecord(aptitudes.surface, `${buildName} surface aptitudes`);
  const distance = requiredRecord(aptitudes.distance, `${buildName} distance aptitudes`);
  const strategyAptitudes = requiredRecord(aptitudes.strategy, `${buildName} strategy aptitudes`);
  const rawSkillIds = normalizeSkillIds(candidate.skillIds, name);
  const legacyUniqueSkillId = rawSkillIds.find(isUniqueSkillId);
  const uniqueSkillId =
    optionalString(candidate.uniqueSkillId) ?? legacyUniqueSkillId ?? "unique-template-placeholder";

  return {
    id,
    name,
    cardId,
    characterId,
    characterName,
    outfitTitle,
    variant,
    buildName,
    stats: Object.fromEntries(
      statKeys.map((stat) => [stat, normalizeStat(stats[stat], `${name} ${stat}`)]),
    ) as StoredUma["stats"],
    aptitudes: {
      surface: Object.fromEntries(
        surfaces.map((key) => [key, normalizeRank(surface[key], `${name} ${key}`)]),
      ) as StoredUma["aptitudes"]["surface"],
      distance: Object.fromEntries(
        distances.map((key) => [key, normalizeRank(distance[key], `${name} ${key}`)]),
      ) as StoredUma["aptitudes"]["distance"],
      strategy: Object.fromEntries(
        strategies.map((key) => [key, normalizeRank(strategyAptitudes[key], `${name} ${key}`)]),
      ) as StoredUma["aptitudes"]["strategy"],
    },
    strategy: normalizeEnum(candidate.strategy, strategies, `${buildName} strategy`),
    uniqueSkillId,
    uniqueSkillLevel: normalizeUniqueSkillLevel(candidate.uniqueSkillLevel),
    skillIds: rawSkillIds.filter((skillId) => skillId !== uniqueSkillId && !isUniqueSkillId(skillId)),
  };
}

function normalizeStat(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number.`);
  }

  return Math.min(Math.max(Math.round(value), 1), 2000);
}

function normalizeRank(value: unknown, label: string): AptitudeRank {
  return normalizeEnum(value, ranks, `${label} aptitude`);
}

function normalizeSkillIds(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((skillId) => typeof skillId !== "string")) {
    throw new Error(`${name} skillIds must be an array of strings.`);
  }

  return [...new Set(value)];
}

function normalizeUniqueSkillLevel(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 6) {
    throw new Error("uniqueSkillLevel must be an integer from 1 to 6.");
  }
  return value;
}

function normalizeEnum<const T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${label} must be one of: ${options.join(", ")}.`);
  }

  return value as T;
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  return value;
}

function createImportedId(name: string, index: number): string {
  const slug = createSlug(name);

  return `imported-${slug || "uma"}-${Date.now()}-${index}`;
}

function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isUniqueSkillId(skillId: string): boolean {
  return skillId.startsWith("unique-");
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
