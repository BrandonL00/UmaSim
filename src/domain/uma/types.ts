export type StatKey = "speed" | "stamina" | "power" | "guts" | "wit";

export type StatBlock = Record<StatKey, number>;

export type AptitudeRank = "G" | "F" | "E" | "D" | "C" | "B" | "A" | "S";

export type Surface = "turf" | "dirt";
export type DistanceCategory = "sprint" | "mile" | "medium" | "long";
export type Strategy = "front" | "pace" | "late" | "end";
export type Mood = "awful" | "bad" | "normal" | "good" | "great";

export type RunnerBuild = {
  id: string;
  name: string;
  cardId: number;
  characterId: number;
  characterName: string;
  outfitTitle: string;
  variant: string | null;
  buildName: string;
  stats: StatBlock;
  aptitudes: {
    surface: Record<Surface, AptitudeRank>;
    distance: Record<DistanceCategory, AptitudeRank>;
    strategy: Record<Strategy, AptitudeRank>;
  };
  strategy: Strategy;
  mood: Mood;
  uniqueSkillId: string;
  uniqueSkillLevel: number;
  skillIds: string[];
};

export type StoredUma = Omit<RunnerBuild, "mood">;
