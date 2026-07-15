export type DuelParticipant = {
  id: string;
  distanceMeters: number;
  speed: number;
  hpPercent: number;
};

export type DuelState = {
  active: boolean;
  count: number;
  candidateSeconds: Record<string, number>;
};

export function createDuelState(): DuelState {
  return {
    active: false,
    count: 0,
    candidateSeconds: {},
  };
}

export function updateDuelState(
  state: DuelState,
  self: DuelParticipant,
  field: DuelParticipant[],
  isFinalStraight: boolean,
  tickSeconds: number,
): DuelState {
  if (!isFinalStraight || self.hpPercent < 5) {
    return {
      ...state,
      active: false,
      candidateSeconds: {},
    };
  }

  if (state.active) {
    return state;
  }

  const candidateSeconds: Record<string, number> = {};

  for (const candidate of field) {
    if (candidate.id === self.id) continue;

    const qualifies = self.hpPercent >= 15
      && candidate.hpPercent >= 15
      && Math.abs(candidate.distanceMeters - self.distanceMeters) < 3
      && Math.abs(candidate.speed - self.speed) < 0.6;

    if (qualifies) {
      candidateSeconds[candidate.id] = (state.candidateSeconds[candidate.id] ?? 0) + tickSeconds;
    }
  }

  const activates = Object.values(candidateSeconds).some((seconds) => seconds > 2);

  return {
    active: activates,
    count: state.count + Number(activates),
    candidateSeconds,
  };
}
