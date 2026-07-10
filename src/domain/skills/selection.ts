export type SelectableSkill = {
  id: string;
  prerequisiteIds?: string[];
  supersedesIds?: string[];
  prerequisiteSkillIds?: string[];
  supersedesSkillIds?: string[];
};

export function selectSkillWithPrerequisites(
  selectedIds: string[],
  skillId: string,
  skills: SelectableSkill[],
): string[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const next = new Set(selectedIds);

  function addWithPrerequisites(id: string) {
    const skill = skillById.get(id);

    for (const prerequisiteId of skill?.prerequisiteIds ?? skill?.prerequisiteSkillIds ?? []) {
      addWithPrerequisites(prerequisiteId);
    }

    next.add(id);
  }

  addWithPrerequisites(skillId);
  return [...next];
}

export function getPrerequisiteLockOwners(
  selectedIds: string[],
  skills: SelectableSkill[],
): Map<string, string[]> {
  const selected = new Set(selectedIds);
  const owners = new Map<string, string[]>();

  for (const skill of skills) {
    if (!selected.has(skill.id)) {
      continue;
    }

    for (const prerequisiteId of skill.prerequisiteIds ?? skill.prerequisiteSkillIds ?? []) {
      const current = owners.get(prerequisiteId) ?? [];
      current.push(skill.id);
      owners.set(prerequisiteId, current);
    }
  }

  return owners;
}

export function resolveActiveSkillIds(selectedIds: string[], skills: SelectableSkill[]): string[] {
  const selected = new Set(selectedIds);

  for (const skill of skills) {
    if (!selected.has(skill.id)) {
      continue;
    }

    for (const supersededId of skill.supersedesIds ?? skill.supersedesSkillIds ?? []) {
      selected.delete(supersededId);
    }
  }

  return selectedIds.filter((id) => selected.has(id));
}
