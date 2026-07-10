import { describe, expect, it } from "vitest";
import { staminaCostPerSecond, targetSpeed } from "../domain/race/formulas";

describe("race formulas", () => {
  it("formula-speed-stat-increases-target-speed", () => {
    const lower = targetSpeed(20, 700, "middle", "pace", "A", 0);
    const higher = targetSpeed(20, 1100, "middle", "pace", "A", 0);

    expect(higher).toBeGreaterThan(lower);
  });

  it("formula-phase-increases-stamina-cost", () => {
    const early = staminaCostPerSecond(22, "early");
    const late = staminaCostPerSecond(22, "late");
    const lastSpurt = staminaCostPerSecond(22, "lastSpurt");

    expect(late).toBeGreaterThan(early);
    expect(lastSpurt).toBeGreaterThan(late);
  });
});
