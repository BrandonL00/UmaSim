import { describe, expect, it } from "vitest";
import {
  getPrerequisiteLockOwners,
  resolveActiveSkillIds,
  selectSkillWithPrerequisites,
} from "../domain/skills/selection";

const skills = [
  { id: "white" },
  { id: "gold", prerequisiteIds: ["white"], supersedesIds: ["white"] },
];

describe("skill selection", () => {
  it("selects prerequisites before an upgrade", () => {
    expect(selectSkillWithPrerequisites([], "gold", skills)).toEqual(["white", "gold"]);
  });

  it("locks a selected prerequisite while its upgrade is selected", () => {
    expect(getPrerequisiteLockOwners(["white", "gold"], skills).get("white")).toEqual(["gold"]);
  });

  it("removes superseded skills from the active race skill set", () => {
    expect(resolveActiveSkillIds(["white", "gold"], skills)).toEqual(["gold"]);
  });
});
