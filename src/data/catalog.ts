import type { Skill } from "../domain/skills/types";
import { runners } from "./fixtures";
import { globalTracks } from "./tracks";

export const catalog = {
  tracks: globalTracks,
  runners,
  skills: [] as Skill[],
};
