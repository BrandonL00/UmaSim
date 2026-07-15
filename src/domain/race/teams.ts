import type { RaceRunner } from "./types";

type TeamEntry = Pick<RaceRunner, "id" | "teamId">;

/** Untagged runners are singleton teams, so every other runner is an opponent. */
export function getRaceTeamKey(runner: TeamEntry): string {
  const teamId = runner.teamId?.trim();
  return teamId ? `team:${teamId}` : `runner:${runner.id}`;
}

export function areRaceTeammates(left: TeamEntry, right: TeamEntry): boolean {
  return left.id !== right.id && getRaceTeamKey(left) === getRaceTeamKey(right);
}

export function areRaceOpponents(left: TeamEntry, right: TeamEntry): boolean {
  return left.id !== right.id && getRaceTeamKey(left) !== getRaceTeamKey(right);
}
