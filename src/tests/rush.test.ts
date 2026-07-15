import { describe, expect, it } from "vitest";
import {
  activateRushAtDistance,
  advanceRushState,
  calculateRushProbability,
  createRushState,
} from "../domain/race/rush";

describe("Rushed state", () => {
  it("matches the documented normal-mood A-aptitude probability examples", () => {
    expect(calculateRushProbability(300, "normal", "A")).toBeCloseTo(0.19, 3);
    expect(calculateRushProbability(600, "normal", "A")).toBeCloseTo(0.1326, 3);
    expect(calculateRushProbability(1200, "normal", "A")).toBeCloseTo(0.0974, 3);
  });

  it("schedules a rush in sections 2 through 9 and checks for recovery every three seconds", () => {
    const randomValues = [0, 0, 0];
    const random = () => randomValues.shift() ?? 0;
    let state = createRushState(1, 2400, random);

    expect(state.startDistanceMeters).toBe(200);
    state = activateRushAtDistance(state, 199.9);
    expect(state.active).toBe(false);
    state = activateRushAtDistance(state, 200);
    expect(state.active).toBe(true);
    state = advanceRushState(state, 2.5, random);
    expect(state.active).toBe(true);
    state = advanceRushState(state, 0.5, random);
    expect(state.active).toBe(false);
    expect(state.count).toBe(1);
  });

  it("forces the rush to end after twelve seconds", () => {
    const neverEndsEarly = () => 0.99;
    let state = createRushState(1, 1200, () => 0);
    state = activateRushAtDistance(state, state.startDistanceMeters);
    state = advanceRushState(state, 12, neverEndsEarly);

    expect(state.active).toBe(false);
    expect(state.elapsedSeconds).toBe(12);
  });
});
