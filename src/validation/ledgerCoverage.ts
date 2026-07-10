import { accuracyLedger, type AccuracyLedgerEntry } from "../domain/race/accuracyLedger";

export type ValidationCase = {
  id: string;
  ledgerEntryIds: AccuracyLedgerEntry["id"][];
  testFile: string;
  claim: string;
};

/**
 * Index of targeted automated checks behind the accuracy ledger. This is not
 * external mechanics evidence; it prevents an implementation claim from being
 * detached from its executable regression case.
 */
export const validationCases: readonly ValidationCase[] = [
  {
    id: "engine-deterministic-seed",
    ledgerEntryIds: ["seeded-reproducibility"],
    testFile: "src/tests/simulateRace.test.ts",
    claim: "Same setup and seed replay identically.",
  },
  {
    id: "formula-speed-stat-increases-target-speed",
    ledgerEntryIds: ["movement-formulas"],
    testFile: "src/tests/formulas.test.ts",
    claim: "Higher speed stat raises the transparent target-speed formula.",
  },
  {
    id: "formula-phase-increases-stamina-cost",
    ledgerEntryIds: ["movement-formulas", "stamina-model"],
    testFile: "src/tests/formulas.test.ts",
    claim: "Last-spurt stamina cost exceeds the same speed in early phase.",
  },
  {
    id: "traffic-boxed-in-penalty",
    ledgerEntryIds: ["traffic-and-pathing"],
    testFile: "src/tests/traffic.test.ts",
    claim: "Boxed-in traffic applies movement penalties and navigation offsets them.",
  },
  {
    id: "pathing-blocked-runner-moves-outward",
    ledgerEntryIds: ["traffic-and-pathing"],
    testFile: "src/tests/pathing.test.ts",
    claim: "A runner blocked in front targets an outward lane.",
  },
  {
    id: "global-skill-lane-token",
    ledgerEntryIds: ["global-skill-runtime"],
    testFile: "src/tests/globalSkillModel.test.ts",
    claim: "Supported lane and lane-change condition tokens resolve from race state.",
  },
  {
    id: "global-skill-sampled-trigger-window",
    ledgerEntryIds: ["global-skill-runtime"],
    testFile: "src/tests/globalSkillModel.test.ts",
    claim: "Random condition tokens resolve through sampled trigger windows.",
  },
  {
    id: "global-skill-unsupported-expression-is-rejected",
    ledgerEntryIds: ["unsupported-skill-behavior"],
    testFile: "src/tests/globalSkillModel.test.ts",
    claim: "Unknown condition expressions are not treated as modeled skills.",
  },
];

export function getLedgerValidationCases(entryId: AccuracyLedgerEntry["id"]) {
  return validationCases.filter((validationCase) => validationCase.ledgerEntryIds.includes(entryId));
}

export function findLedgerCoverageGaps(entries: readonly AccuracyLedgerEntry[] = accuracyLedger) {
  return entries.filter((entry) =>
    entry.validationCaseIds.some(
      (caseId) =>
        !validationCases.some(
          (validationCase) => validationCase.id === caseId && validationCase.ledgerEntryIds.includes(entry.id),
        ),
    ),
  );
}
