import { describe, expect, it } from "vitest";
import { accuracyLedger } from "../domain/race/accuracyLedger";
import { findLedgerCoverageGaps, getLedgerValidationCases, validationCases } from "../validation/ledgerCoverage";

describe("validation ledger", () => {
  it("links every accuracy claim to targeted executable coverage", () => {
    expect(findLedgerCoverageGaps()).toEqual([]);
    expect(accuracyLedger.every((entry) => getLedgerValidationCases(entry.id).length > 0)).toBe(true);
  });

  it("uses unique validation case identifiers", () => {
    const ids = validationCases.map((validationCase) => validationCase.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
