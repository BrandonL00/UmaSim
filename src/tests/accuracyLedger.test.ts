import { describe, expect, it } from "vitest";
import { accuracyLedger, countAccuracyStatuses } from "../domain/race/accuracyLedger";

describe("accuracy ledger", () => {
  it("keeps each claimed mechanic traceable to evidence", () => {
    expect(accuracyLedger.length).toBeGreaterThan(0);
    expect(accuracyLedger.every((entry) => entry.evidence.length > 0 && entry.summary.length > 0)).toBe(true);
  });

  it("does not overstate current engine parity", () => {
    const counts = countAccuracyStatuses();

    expect(counts.verified).toBe(1);
    expect(counts.approximation).toBeGreaterThan(0);
    expect(counts.unsupported).toBeGreaterThan(0);
  });
});
