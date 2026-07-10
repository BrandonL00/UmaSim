import type { GroundCondition, RacePhase, StrategyCoefficients } from "./types";
import type { AptitudeRank, Mood, StatBlock, Strategy, Surface } from "../uma/types";

export const strategyCoefficients: StrategyCoefficients = {
  early: { front: 1, pace: 0.978, late: 0.938, end: 0.931 },
  middle: { front: 0.98, pace: 0.991, late: 0.998, end: 1 },
  late: { front: 0.962, pace: 0.975, late: 0.994, end: 1 },
  lastSpurt: { front: 1.04, pace: 1.045, late: 1.055, end: 1.06 },
};

const moodModifier: Record<Mood, number> = {
  awful: -0.04,
  bad: -0.02,
  normal: 0,
  good: 0.02,
  great: 0.04,
};

const aptitudeSpeedModifier: Record<AptitudeRank, number> = {
  G: 0.7,
  F: 0.75,
  E: 0.8,
  D: 0.85,
  C: 0.9,
  B: 0.95,
  A: 1,
  S: 1.05,
};

const aptitudeAccelerationModifier: Record<AptitudeRank, number> = {
  G: 0.4,
  F: 0.5,
  E: 0.6,
  D: 0.75,
  C: 0.85,
  B: 0.95,
  A: 1,
  S: 1.05,
};

export function adjustStats(stats: StatBlock, mood: Mood, groundCondition: GroundCondition, surface: Surface): StatBlock {
  const moodFactor = 1 + moodModifier[mood];
  const heavyPenalty = groundCondition === "heavy" ? -50 : 0;
  const softPenalty = groundCondition === "soft" ? -25 : 0;
  const dirtPowerPenalty = surface === "dirt" ? -40 : 0;

  return {
    speed: Math.max(1, stats.speed * moodFactor + heavyPenalty),
    stamina: Math.max(1, stats.stamina * moodFactor),
    power: Math.max(1, stats.power * moodFactor + softPenalty + heavyPenalty + dirtPowerPenalty),
    guts: Math.max(1, stats.guts * moodFactor),
    wit: Math.max(1, stats.wit * moodFactor),
  };
}

export function baseSpeed(distanceMeters: number): number {
  return 20 - (distanceMeters - 2000) / 1000;
}

export function targetSpeed(
  base: number,
  speedStat: number,
  phase: RacePhase,
  strategy: Strategy,
  distanceAptitude: AptitudeRank,
  speedBonus: number,
): number {
  const statBonus = Math.sqrt(500 * speedStat) * 0.002 * aptitudeSpeedModifier[distanceAptitude];
  return base * strategyCoefficients[phase][strategy] + statBonus + speedBonus;
}

export function acceleration(
  powerStat: number,
  isUphill: boolean,
  surfaceAptitude: AptitudeRank,
  accelerationBonus: number,
): number {
  const base = isUphill ? 0.18 : 0.24;
  return base + Math.sqrt(500 * powerStat) * 0.0009 * aptitudeAccelerationModifier[surfaceAptitude] + accelerationBonus;
}

export function staminaBudget(stamina: number, guts: number): number {
  return stamina * 1.55 + guts * 0.35;
}

export function staminaCostPerSecond(speed: number, phase: RacePhase): number {
  const phaseFactor = phase === "lastSpurt" ? 1.55 : phase === "late" ? 1.15 : 1;
  return Math.pow(speed / 20, 2) * 8 * phaseFactor;
}
