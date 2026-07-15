import type { AptitudeRank, Mood } from "../uma/types";

export type RushState = {
  scheduled: boolean;
  startDistanceMeters: number;
  active: boolean;
  count: number;
  elapsedSeconds: number;
  nextEndCheckSeconds: number;
};

const moodFactor: Record<Mood, number> = {
  awful: 0.96,
  bad: 0.98,
  normal: 1,
  good: 1.02,
  great: 1.04,
};

const strategyAptitudeFactor: Record<AptitudeRank, number> = {
  G: 0.1,
  F: 0.2,
  E: 0.4,
  D: 0.6,
  C: 0.8,
  B: 0.9,
  A: 1,
  S: 1.1,
};

export function calculateRushProbability(
  rawWit: number,
  mood: Mood,
  strategyAptitude: AptitudeRank,
  passiveWitBonus = 0,
): number {
  const normalizedRawWit = rawWit <= 1200 ? rawWit : 1200 + (rawWit - 1200) / 2;
  const effectiveWit = Math.max(
    1,
    normalizedRawWit * moodFactor[mood] * strategyAptitudeFactor[strategyAptitude] + passiveWitBonus,
  );
  const percent = Math.pow(6.5 / Math.log10(0.1 * effectiveWit + 1), 2);
  return Math.min(Math.max(percent / 100, 0), 1);
}

export function createRushState(
  probability: number,
  trackDistanceMeters: number,
  random: () => number,
): RushState {
  const scheduled = random() < probability;
  const section = Math.floor(random() * 8) + 2;

  return {
    scheduled,
    startDistanceMeters: (section / 24) * trackDistanceMeters,
    active: false,
    count: 0,
    elapsedSeconds: 0,
    nextEndCheckSeconds: 3,
  };
}

export function activateRushAtDistance(state: RushState, distanceMeters: number): RushState {
  if (!state.scheduled || state.active || state.count > 0 || distanceMeters < state.startDistanceMeters) {
    return state;
  }

  return {
    ...state,
    active: true,
    count: 1,
    elapsedSeconds: 0,
    nextEndCheckSeconds: 3,
  };
}

export function advanceRushState(state: RushState, tickSeconds: number, random: () => number): RushState {
  if (!state.active) {
    return state;
  }

  const elapsedSeconds = state.elapsedSeconds + tickSeconds;
  let nextEndCheckSeconds = state.nextEndCheckSeconds;
  let active = true;

  while (active && elapsedSeconds + 0.0001 >= nextEndCheckSeconds && nextEndCheckSeconds < 12) {
    active = random() >= 0.6;
    nextEndCheckSeconds += 3;
  }

  if (elapsedSeconds + 0.0001 >= 12) {
    active = false;
  }

  return {
    ...state,
    active,
    elapsedSeconds,
    nextEndCheckSeconds,
  };
}
