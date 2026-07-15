import type { DistanceCategory, RunnerBuild, StatBlock, Strategy, Surface } from "../uma/types";

export type GroundCondition = "firm" | "good" | "soft" | "heavy";
export type Weather = "sunny" | "cloudy" | "rainy" | "snowy";
export type RaceSeason = "spring" | "summer" | "fall" | "winter" | "cherryBlossom";
export type RacePhase = "early" | "middle" | "late" | "lastSpurt";

export type RaceTeam = {
  id: string;
  name: string;
  color: string;
};

/** Race-specific entry metadata. These values belong to an entry, not its saved build. */
export type RaceRunner = RunnerBuild & {
  /** Explicit race team. Omit to treat this runner as an individual entrant. */
  teamId?: string;
  /** Popularity rank used by skills whose conditions reference popularity. */
  popularityRank?: number;
  /** Gate block (waku), numbered 1 through 8. */
  gateBlock?: number;
};

export type TrackSegment = {
  startMeters: number;
  endMeters: number;
  kind: "straight" | "corner";
  slope?: "flat" | "uphill" | "downhill";
  tags?: Array<"finalCorner" | "finalStraight">;
};

export type Track = {
  id: string;
  name: string;
  sourceCourseId?: number;
  venueId?: number;
  venue?: string;
  courseVariant?: string | null;
  laneCount?: number;
  surface: Surface;
  distanceMeters: number;
  distanceCategory: DistanceCategory;
  direction?: "clockwise" | "counterclockwise" | "straight";
  segments: TrackSegment[];
  representativeRaces?: Array<{
    id: number;
    name: string;
  }>;
};

export type RaceSetup = {
  seed: string;
  /** Simulation evaluation interval. Omit to use the engine default. */
  tickSeconds?: number;
  trackId: string;
  groundCondition: GroundCondition;
  weather: Weather;
  /** Event season used by seasonal passive skills. */
  season?: RaceSeason;
  /** Optional display metadata for explicitly configured teams. */
  teams?: RaceTeam[];
  runners: RaceRunner[];
};

export type RaceCatalog = {
  tracks: Track[];
};

export type RunnerTick = {
  runnerId: string;
  distanceMeters: number;
  speed: number;
  targetSpeed: number;
  stamina: number;
  phase: RacePhase;
};

export type RaceTick = {
  second: number;
  runners: RunnerTick[];
};

export type SkillEvent = {
  second: number;
  runnerId: string;
  skillId: string;
  skillName: string;
  message: string;
  source: "fixture" | "global";
};

export type SkillDebugTarget = {
  label: string;
  distanceMeters: number;
  distanceRate: number;
};

export type SkillDebugEntry = {
  runnerId: string;
  skillId: string;
  skillName: string;
  source: "fixture" | "global";
  status: "activated" | "missed" | "unmodeled";
  conditionSummary: string;
  sampledTargets: SkillDebugTarget[];
  activation?: {
    second: number;
    distanceMeters: number;
    distanceRate: number;
  };
  reason: string;
};

export type Placement = {
  place: number;
  runnerId: string;
  runnerName: string;
  finishTime: number;
};

export type RunnerSummary = {
  runnerId: string;
  runnerName: string;
  adjustedStats: StatBlock;
  topSpeed: number;
  averageSpeed: number;
  remainingStamina: number;
  staminaSpent: number;
  triggeredSkillCount: number;
  finishTime: number;
  gapToWinner: number;
};

export type SimulationWarning = {
  code: string;
  message: string;
};

export type RaceResult = {
  seed: string;
  tickSeconds: number;
  placements: Placement[];
  runners: RunnerSummary[];
  timeline: RaceTick[];
  skillEvents: SkillEvent[];
  skillDebug?: SkillDebugEntry[];
  warnings: SimulationWarning[];
};

export type StrategyCoefficients = Record<RacePhase, Record<Strategy, number>>;
