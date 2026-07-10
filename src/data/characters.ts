import generatedCharacterCards from "./generated/gametoraGlobalCharacterCards.json";
import umapyoiCharacters from "./generated/umapyoiCharacters.json";
import { globalSkills } from "./skills";
import type { AptitudeRank, DistanceCategory, Strategy, Surface } from "../domain/uma/types";

export type UmapyoiCharacter = {
  id: number;
  gameId: number | null;
  nameEn: string;
  nameJp: string;
  preferredUrl: string;
  colorMain: string;
  colorSub: string;
  thumbImg: string;
  profile: string | null;
};

type GeneratedCharacterCard = {
  cardId: number;
  characterId: number;
  characterName: string;
  characterNameJp: string;
  outfitTitle: string;
  variant: string | null;
  releaseGlobal: string;
  urlName: string;
  imageUrl: string;
  thumbnailUrl: string;
  aptitudes: string[];
  uniqueSkillIds: number[];
  innateSkillIds: number[];
  awakeningSkillIds: number[];
};

export type UniqueSkillReference = {
  ownerId: string;
  ownerName: string;
  inheritedId: string | null;
  inheritedName: string | null;
  candidateOwnerIds: string[];
};

export type CharacterTemplate = {
  id: string;
  cardId: number;
  characterId: number;
  name: string;
  nameJp: string;
  displayName: string;
  outfitTitle: string;
  variant: string | null;
  aliases: string[];
  releaseGlobal: string;
  thumbImg: string;
  fullImage: string;
  colorMain: string;
  colorSub: string;
  profile: string | null;
  uniqueSkillId: string;
  uniqueSkillName: string;
  inheritedUniqueSkillId: string | null;
  inheritedUniqueSkillName: string | null;
  uniqueSkillCandidateIds: string[];
  defaultStrategy: Strategy;
  innateSkillIds: string[];
  awakeningSkillIds: string[];
  aptitudes: {
    surface: Record<Surface, AptitudeRank>;
    distance: Record<DistanceCategory, AptitudeRank>;
    strategy: Record<Strategy, AptitudeRank>;
  };
};

const ranks = new Set<AptitudeRank>(["G", "F", "E", "D", "C", "B", "A", "S"]);
const strategyOrder: Strategy[] = ["front", "pace", "late", "end"];
const profiles = umapyoiCharacters.characters as UmapyoiCharacter[];
const globalSkillById = new Map(globalSkills.map((skill) => [Number(skill.id), skill]));

function rankAt(values: string[], index: number): AptitudeRank {
  const value = values[index] as AptitudeRank;
  return ranks.has(value) ? value : "G";
}

function createAptitudes(values: string[]): CharacterTemplate["aptitudes"] {
  return {
    surface: {
      turf: rankAt(values, 0),
      dirt: rankAt(values, 1),
    },
    distance: {
      sprint: rankAt(values, 2),
      mile: rankAt(values, 3),
      medium: rankAt(values, 4),
      long: rankAt(values, 5),
    },
    strategy: {
      front: rankAt(values, 6),
      pace: rankAt(values, 7),
      late: rankAt(values, 8),
      end: rankAt(values, 9),
    },
  };
}

function chooseDefaultStrategy(aptitudes: CharacterTemplate["aptitudes"]): Strategy {
  const rankScore: Record<AptitudeRank, number> = {
    G: 0,
    F: 1,
    E: 2,
    D: 3,
    C: 4,
    B: 5,
    A: 6,
    S: 7,
  };

  return strategyOrder.reduce((best, strategy) =>
    rankScore[aptitudes.strategy[strategy]] > rankScore[aptitudes.strategy[best]] ? strategy : best,
  );
}

function selectPreferredOwnerUnique(skillIds: number[]): number | undefined {
  if (!skillIds.length) {
    return undefined;
  }

  return [...skillIds].sort((left, right) => right - left)[0];
}

export function resolveUniqueSkill(uniqueSkillIds: number[]): UniqueSkillReference {
  const ownerSourceId = selectPreferredOwnerUnique(uniqueSkillIds);
  const ownerSkill = ownerSourceId ? globalSkillById.get(ownerSourceId) : undefined;
  const inheritedSourceId = ownerSkill?.geneVersion?.id ?? null;

  return {
    ownerId: ownerSourceId ? `gt-${ownerSourceId}` : "unique-template-placeholder",
    ownerName: ownerSkill?.name ?? "Unique Skill TBD",
    inheritedId: inheritedSourceId ? `gt-${inheritedSourceId}` : null,
    inheritedName: ownerSkill?.geneVersion?.name ?? null,
    candidateOwnerIds: uniqueSkillIds.map((id) => `gt-${id}`),
  };
}

function buildAliases(card: GeneratedCharacterCard): string[] {
  const aliases = [
    card.characterName,
    card.characterNameJp,
    card.outfitTitle,
    `${card.characterName} ${card.outfitTitle}`,
    card.urlName,
    String(card.cardId),
  ];

  if (card.variant) {
    aliases.push(
      card.variant,
      `${card.variant} ${card.characterName}`,
      `${card.characterName} ${card.variant}`,
    );
  }

  return [...new Set(aliases.filter(Boolean))];
}

export const characterTemplates: CharacterTemplate[] = (
  generatedCharacterCards.cards as GeneratedCharacterCard[]
).map((card) => {
  const profile = profiles.find((candidate) => candidate.gameId === card.characterId);
  const aptitudes = createAptitudes(card.aptitudes);
  const uniqueSkill = resolveUniqueSkill(card.uniqueSkillIds);

  return {
    id: String(card.cardId),
    cardId: card.cardId,
    characterId: card.characterId,
    name: card.characterName,
    nameJp: card.characterNameJp,
    displayName: `${card.characterName} — ${card.outfitTitle}`,
    outfitTitle: card.outfitTitle,
    variant: card.variant,
    aliases: buildAliases(card),
    releaseGlobal: card.releaseGlobal,
    thumbImg: card.thumbnailUrl || profile?.thumbImg || "",
    fullImage: card.imageUrl,
    colorMain: profile?.colorMain ?? "#356f68",
    colorSub: profile?.colorSub ?? "#d6a944",
    profile: profile?.profile ?? null,
    uniqueSkillId: uniqueSkill.ownerId,
    uniqueSkillName: uniqueSkill.ownerName,
    inheritedUniqueSkillId: uniqueSkill.inheritedId,
    inheritedUniqueSkillName: uniqueSkill.inheritedName,
    uniqueSkillCandidateIds: uniqueSkill.candidateOwnerIds,
    defaultStrategy: chooseDefaultStrategy(aptitudes),
    innateSkillIds: card.innateSkillIds.map((id) => `gt-${id}`),
    awakeningSkillIds: card.awakeningSkillIds.map((id) => `gt-${id}`),
    aptitudes,
  };
});

export const characterDataMeta = {
  count: generatedCharacterCards.count,
  characterCount: generatedCharacterCards.characterCount,
  generatedAt: generatedCharacterCards.generatedAt,
  server: generatedCharacterCards.server,
  source: generatedCharacterCards.source,
};
