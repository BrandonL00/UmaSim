import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestUrl = "https://gametora.com/data/manifests/umamusume.json";
const dataBaseUrl = "https://gametora.com/data/umamusume";
const importerVersion = "1";
const outputDir = path.resolve("src/data/generated");
const outputPath = path.join(outputDir, "gametoraGlobalSkills.json");

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "UmaSim data importer",
    },
  });

  if (!response.ok) {
    throw new Error(`GameTora request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.json();
}

function normalizeRarity(rarity) {
  if (rarity === 2) {
    return "rare";
  }

  if (rarity === 6) {
    return "evolved";
  }

  if (rarity >= 3 && rarity <= 5) {
    return "unique";
  }

  return "normal";
}

function normalizeConditionGroup(group) {
  return {
    condition: group.condition ?? null,
    precondition: group.precondition ?? null,
    baseTimeMs: group.base_time ?? null,
    cooldownMs: group.cd ?? null,
    effects: Array.isArray(group.effects)
      ? group.effects.map((effect) => ({
          type: effect.type,
          value: effect.value,
        }))
      : [],
  };
}

function normalizeGeneVersion(skill, globalLoc) {
  const rootGene = skill.gene_version;
  if (!rootGene) {
    return null;
  }

  const globalGene = globalLoc?.gene_version ?? {};
  const groups = globalGene.condition_groups ?? rootGene.condition_groups ?? [];

  return {
    id: String(rootGene.id),
    name: rootGene.name_en ?? rootGene.enname ?? rootGene.jpname ?? "Unknown inherited skill",
    description: rootGene.desc_en ?? rootGene.endesc ?? rootGene.jpdesc ?? "",
    cost: rootGene.cost ?? null,
    rarity: normalizeRarity(rootGene.rarity),
    iconId: rootGene.iconid ?? null,
    conditionGroups: groups.map(normalizeConditionGroup),
  };
}

function normalizeSkill(skill, skillById) {
  const globalLoc = skill.loc?.en;
  const conditionGroups = globalLoc?.condition_groups ?? skill.condition_groups ?? [];
  const versionSkills = (skill.versions ?? []).map((id) => skillById.get(Number(id))).filter(Boolean);
  const prerequisiteIds =
    skill.rarity === 2
      ? versionSkills
          .filter((candidate) => candidate.rarity === 1 && !candidate.name_en?.includes("×"))
          .map((candidate) => String(candidate.id))
      : (skill.parent_skills ?? []).map(String);

  return {
    id: String(skill.id),
    name: skill.name_en ?? skill.enname ?? skill.jpname ?? "Unknown skill",
    oldEnglishName: skill.enname ?? null,
    japaneseName: skill.jpname ?? null,
    description: skill.desc_en ?? skill.endesc ?? skill.jpdesc ?? "",
    oldEnglishDescription: skill.endesc ?? null,
    japaneseDescription: skill.jpdesc ?? null,
    rarity: normalizeRarity(skill.rarity),
    rarityValue: skill.rarity ?? null,
    iconId: skill.iconid ?? null,
    cost: skill.cost ?? null,
    activation: skill.activation ?? null,
    tags: globalLoc?.type ?? skill.type ?? [],
    versionIds: (skill.versions ?? []).map(String),
    prerequisiteIds,
    supersedesIds: prerequisiteIds,
    conditionGroups: conditionGroups.map(normalizeConditionGroup),
    geneVersion: normalizeGeneVersion(skill, globalLoc),
    sourceIds: {
      characterIds: globalLoc?.char ?? skill.char ?? [],
      characterEvoIds: globalLoc?.char_e ?? skill.char_e ?? [],
      scenarioIds: globalLoc?.sce_e ?? skill.sce_e ?? [],
    },
    availability: {
      globalReleased: Boolean(skill.name_en),
      hasGlobalConditionOverride: Boolean(globalLoc?.condition_groups),
      hasGlobalSourceOverride: Boolean(globalLoc),
    },
  };
}

function hasGlobalSkillData(skill, skillById) {
  if (skill.loc?.en) {
    return true;
  }

  // Shared skill tiers can inherit Global availability from their linked tier
  // even when the tier itself carries no server-specific override.
  return (skill.versions ?? []).some((id) => skillById.get(Number(id))?.loc?.en);
}

const manifest = await fetchJson(manifestUrl);
const skillsHash = manifest.skills;

if (!skillsHash) {
  throw new Error("GameTora manifest did not include a skills hash.");
}

const skillsUrl = `${dataBaseUrl}/skills.${skillsHash}.json`;
const skillPayload = await fetchJson(skillsUrl);
const rawSkills = Array.isArray(skillPayload) ? skillPayload : skillPayload.value;

if (!Array.isArray(rawSkills)) {
  throw new Error("Unexpected GameTora skills payload shape.");
}

const skillById = new Map(rawSkills.map((skill) => [Number(skill.id), skill]));
const skills = rawSkills
  // `name_en` is a localization string, not a Global release flag. Only the
  // per-server record (or a linked shared tier) confirms Global availability.
  .filter((skill) => skill.name_en && hasGlobalSkillData(skill, skillById))
  .map((skill) => normalizeSkill(skill, skillById))
  .sort((left, right) => Number(left.id) - Number(right.id));

const payload = {
  generatedAt: new Date().toISOString(),
  importerVersion,
  server: "global",
  source: {
    provider: "gametora.com",
    skillsPage: "https://gametora.com/umamusume/skills",
    manifestUrl,
    skillsUrl,
    manifestHash: skillsHash,
  },
  count: skills.length,
  skills,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${skills.length} Global skills to ${outputPath}`);
