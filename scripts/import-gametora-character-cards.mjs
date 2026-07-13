import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestUrl = "https://gametora.com/data/manifests/umamusume.json";
const dataBaseUrl = "https://gametora.com/data/umamusume";
const importerVersion = "1";
const outputDir = path.resolve("src/data/generated");
const outputPath = path.join(outputDir, "gametoraGlobalCharacterCards.json");

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

function normalizeCard(card) {
  const cardId = Number(card.card_id);
  const characterId = Number(card.char_id);

  return {
    cardId,
    characterId,
    characterName: card.name_en,
    characterNameJp: card.name_jp,
    outfitTitle: card.title_en_gl ?? card.title ?? card.title_jp ?? "",
    variant: card.version ?? null,
    rarity: card.rarity ?? null,
    releaseGlobal: card.release_en,
    urlName: card.url_name,
    imageUrl: `https://gametora.com/images/umamusume/characters/chara_stand_${characterId}_${cardId}.png`,
    thumbnailUrl: `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${characterId}_${cardId}.png`,
    aptitudes: card.aptitude ?? [],
    baseStats: card.base_stats ?? [],
    fourStarStats: card.four_star_stats ?? [],
    fiveStarStats: card.five_star_stats ?? [],
    statBonuses: card.stat_bonus ?? [],
    uniqueSkillIds: card.skills_unique ?? [],
    innateSkillIds: card.skills_innate ?? [],
    awakeningSkillIds: card.skills_awakening ?? [],
    eventSkillIds: card.skills_event_en ?? card.skills_event ?? [],
    evolvedSkills: card.skills_evo ?? [],
  };
}

const manifest = await fetchJson(manifestUrl);
const cardsHash = manifest["character-cards"];

if (!cardsHash) {
  throw new Error("GameTora manifest did not include a character-cards hash.");
}

const cardsUrl = `${dataBaseUrl}/character-cards.${cardsHash}.json`;
const cardPayload = await fetchJson(cardsUrl);
const rawCards = Array.isArray(cardPayload) ? cardPayload : cardPayload.value;

if (!Array.isArray(rawCards)) {
  throw new Error("Unexpected GameTora character-card payload shape.");
}

const today = new Date().toISOString().slice(0, 10);
const cards = rawCards
  .filter((card) => card.release_en && card.release_en <= today && card.name_en)
  .map(normalizeCard)
  .sort((left, right) =>
    left.characterName.localeCompare(right.characterName) || left.cardId - right.cardId,
  );

const payload = {
  generatedAt: new Date().toISOString(),
  importerVersion,
  server: "global",
  source: {
    provider: "gametora.com",
    charactersPage: "https://gametora.com/umamusume/characters",
    manifestUrl,
    cardsUrl,
    manifestHash: cardsHash,
  },
  count: cards.length,
  characterCount: new Set(cards.map((card) => card.characterId)).size,
  cards,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${cards.length} Global character cards to ${outputPath}`);
