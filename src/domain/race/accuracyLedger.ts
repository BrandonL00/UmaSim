export type AccuracyStatus = "verified" | "approximation" | "unsupported" | "unknown";

export type AccuracyLedgerEntry = {
  id: string;
  area: "reproducibility" | "movement" | "stamina" | "positioning" | "skills";
  label: string;
  status: AccuracyStatus;
  summary: string;
  evidence: string[];
  validationCaseIds: string[];
};

/**
 * A deliberately conservative statement of what the simulator can claim.
 * `verified` requires both documented evidence and a focused validation case.
 */
export const accuracyLedger: readonly AccuracyLedgerEntry[] = [
  {
    id: "seeded-reproducibility",
    area: "reproducibility",
    label: "Seeded replay",
    status: "verified",
    summary: "The same setup and seed produce the same local simulation result.",
    evidence: ["src/tests/simulateRace.test.ts"],
    validationCaseIds: ["engine-deterministic-seed"],
  },
  {
    id: "movement-formulas",
    area: "movement",
    label: "Speed, acceleration, and phase pacing",
    status: "approximation",
    summary: "Uses transparent, typed formulas; it is not yet calibrated as real-engine formula parity.",
    evidence: ["src/domain/race/formulas.ts", "src/tests/formulas.test.ts"],
    validationCaseIds: ["formula-speed-stat-increases-target-speed", "formula-phase-increases-stamina-cost"],
  },
  {
    id: "stamina-model",
    area: "stamina",
    label: "Stamina consumption and recovery",
    status: "approximation",
    summary: "Models stamina drain, exhaustion, and supported recovery effects with regression coverage.",
    evidence: ["src/domain/race/formulas.ts", "src/tests/formulas.test.ts"],
    validationCaseIds: ["formula-phase-increases-stamina-cost"],
  },
  {
    id: "traffic-and-pathing",
    area: "positioning",
    label: "Traffic, blocking, and lane movement",
    status: "approximation",
    summary: "Uses a heuristic spatial model rather than a verified reproduction of hidden race-state behavior.",
    evidence: ["src/domain/race/traffic.ts", "src/domain/race/pathing.ts"],
    validationCaseIds: ["traffic-boxed-in-penalty", "pathing-blocked-runner-moves-outward"],
  },
  {
    id: "global-skill-runtime",
    area: "skills",
    label: "Global skill conditions and effects",
    status: "approximation",
    summary: "Supported condition tokens and effect types are interpreted from Global data, but coverage is incomplete.",
    evidence: ["src/domain/race/globalSkillModel.ts", "src/tests/globalSkillModel.test.ts"],
    validationCaseIds: ["global-skill-lane-token", "global-skill-sampled-trigger-window"],
  },
  {
    id: "unsupported-skill-behavior",
    area: "skills",
    label: "Unsupported skill behavior",
    status: "unsupported",
    summary: "Skills with unsupported conditions or effects are disclosed as unmodeled and do not receive invented behavior.",
    evidence: ["src/domain/race/globalSkillModel.ts", "src/tests/globalSkillModel.test.ts"],
    validationCaseIds: ["global-skill-unsupported-expression-is-rejected"],
  },
];

export const accuracyStatusLabels: Record<AccuracyStatus, string> = {
  verified: "Verified",
  approximation: "Approximate",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

export function countAccuracyStatuses(entries: readonly AccuracyLedgerEntry[] = accuracyLedger) {
  return entries.reduce<Record<AccuracyStatus, number>>(
    (counts, entry) => ({ ...counts, [entry.status]: counts[entry.status] + 1 }),
    { verified: 0, approximation: 0, unsupported: 0, unknown: 0 },
  );
}
