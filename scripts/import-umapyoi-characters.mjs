import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const apiBaseUrl = "https://umapyoi.net/api/v1";
const outputDir = path.resolve("src/data/generated");
const outputPath = path.join(outputDir, "umapyoiCharacters.json");

async function fetchJson(endpoint) {
  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    headers: {
      accept: "application/json",
      "user-agent": "UmaSim data importer",
    },
  });

  if (!response.ok) {
    throw new Error(`Umapyoi request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function normalizeCharacter(character) {
  return {
    id: Number(character.id),
    gameId: character.game_id === null || character.game_id === undefined ? null : Number(character.game_id),
    rowNumber: Number(character.row_number),
    nameEn: character.name_en,
    nameJp: character.name_jp,
    nameInternal: character.name_en_internal,
    preferredUrl: character.preferred_url,
    category: character.category_label_en,
    colorMain: character.color_main,
    colorSub: character.color_sub,
    thumbImg: character.thumb_img,
    snsIcon: character.sns_icon ?? null,
    snsHeader: character.sns_header ?? null,
    officialLink: character.link ?? null,
    birthMonth: character.birth_month ?? null,
    birthDay: character.birth_day ?? null,
    height: character.height ?? null,
    sizes: {
      bust: character.size_b ?? null,
      waist: character.size_w ?? null,
      hip: character.size_h ?? null,
    },
    profile: character.profile ?? null,
    slogan: character.slogan ?? null,
    strengths: character.strengths ?? null,
    weaknesses: character.weaknesses ?? null,
    source: {
      provider: "umapyoi.net",
      endpoint: "/api/v1/character/info",
      modifiedGmt: character.modified_gmt ?? null,
    },
  };
}

const info = await fetchJson("/character/info");
const allCharacters = Array.isArray(info) ? info : info.value;

if (!Array.isArray(allCharacters)) {
  throw new Error("Unexpected Umapyoi character payload shape.");
}

const umamusume = allCharacters
  .filter((character) => character.category_label_en === "Umamusume")
  .map(normalizeCharacter)
  .sort((left, right) => left.rowNumber - right.rowNumber);

const payload = {
  generatedAt: new Date().toISOString(),
  source: "https://umapyoi.net/api/v1/character/info",
  count: umamusume.length,
  characters: umamusume,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${umamusume.length} Umamusume characters to ${outputPath}`);
