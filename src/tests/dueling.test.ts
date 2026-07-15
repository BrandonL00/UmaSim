import { describe, expect, it } from "vitest";
import { createDuelState, updateDuelState, type DuelParticipant } from "../domain/race/dueling";

const self: DuelParticipant = { id: "self", distanceMeters: 1000, speed: 20, hpPercent: 50 };
const rival: DuelParticipant = { id: "rival", distanceMeters: 1002, speed: 20.5, hpPercent: 50 };

describe("Dueling state", () => {
  it("starts after a qualifying rival remains close for more than two seconds", () => {
    let state = createDuelState();

    for (let tick = 0; tick < 4; tick += 1) {
      state = updateDuelState(state, self, [self, rival], true, 0.5);
    }
    expect(state.active).toBe(false);

    state = updateDuelState(state, self, [self, rival], true, 0.5);
    expect(state.active).toBe(true);
    expect(state.count).toBe(1);
  });

  it("does not accumulate time outside the final straight or below the HP threshold", () => {
    const outside = updateDuelState(createDuelState(), self, [self, rival], false, 3);
    const exhausted = updateDuelState(
      createDuelState(),
      { ...self, hpPercent: 14.9 },
      [self, rival],
      true,
      3,
    );

    expect(outside.count).toBe(0);
    expect(exhausted.count).toBe(0);
  });
});
