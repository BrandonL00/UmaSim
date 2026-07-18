import { describe, expect, it } from "vitest";
import { calculateSkillActivationChance, rollSkillActivation } from "../domain/race/skillActivation";

describe("skill activation Wit checks", () => {
  it("uses the documented diminishing-return chance with a 20% floor", () => {
    expect(calculateSkillActivationChance(100)).toBeCloseTo(0.2);
    expect(calculateSkillActivationChance(400)).toBeCloseTo(0.775);
    expect(calculateSkillActivationChance(800)).toBeCloseTo(0.8875);
    expect(calculateSkillActivationChance(1200)).toBeCloseTo(0.925);
  });

  it("samples one chance roll rather than retrying the skill on later ticks", () => {
    expect(rollSkillActivation(400, () => 0.774).passed).toBe(true);
    expect(rollSkillActivation(400, () => 0.775).passed).toBe(false);
  });
});
