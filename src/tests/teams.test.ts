import { describe, expect, it } from "vitest";
import { areRaceOpponents, areRaceTeammates, getRaceTeamKey } from "../domain/race/teams";

describe("race teams", () => {
  it("treats runners with the same explicit team as teammates", () => {
    const left = { id: "left", teamId: "team-a" };
    const right = { id: "right", teamId: "team-a" };

    expect(areRaceTeammates(left, right)).toBe(true);
    expect(areRaceOpponents(left, right)).toBe(false);
  });

  it("treats unassigned runners as separate singleton teams", () => {
    const left = { id: "left" };
    const right = { id: "right" };

    expect(getRaceTeamKey(left)).toBe("runner:left");
    expect(areRaceTeammates(left, right)).toBe(false);
    expect(areRaceOpponents(left, right)).toBe(true);
  });

  it("never treats a runner as its own teammate or opponent", () => {
    const runner = { id: "same", teamId: "team-a" };

    expect(areRaceTeammates(runner, runner)).toBe(false);
    expect(areRaceOpponents(runner, runner)).toBe(false);
  });
});
