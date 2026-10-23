import { describe, expect, it } from "vitest";
import {
  MIN_AUDIT_RETENTION_DAYS,
  auditPruneCutoff,
  auditRetentionDays,
  auditRowsEligibleForPrune,
} from "../audit-retention";

describe("audit retention", () => {
  it("is off by default and never selects young rows", () => {
    expect(auditRetentionDays({})).toBe(0);
    expect(auditPruneCutoff(new Date("2026-10-23T00:00:00.000Z"), 0)).toBeNull();
    const now = new Date("2026-10-23T00:00:00.000Z");
    const rows = [
      { id: "young", at: new Date("2026-09-01T00:00:00.000Z") },
      { id: "old", at: new Date("2026-01-01T00:00:00.000Z") },
    ];
    expect(auditRowsEligibleForPrune(rows, now, 0)).toEqual([]);
  });

  it("raises a short window to 90 days", () => {
    expect(auditRetentionDays({ OPENFLOW_AUDIT_RETENTION_DAYS: "10" })).toBe(
      MIN_AUDIT_RETENTION_DAYS,
    );
    const now = new Date("2026-10-23T00:00:00.000Z");
    const eligible = auditRowsEligibleForPrune(
      [
        { id: "young", at: new Date("2026-09-01T00:00:00.000Z") },
        { id: "old", at: new Date("2026-01-01T00:00:00.000Z") },
      ],
      now,
      10,
    );
    expect(eligible.map((row) => row.id)).toEqual(["old"]);
  });

  it("keeps rows inside a 90 day window", () => {
    const now = new Date("2026-10-23T00:00:00.000Z");
    const cutoff = auditPruneCutoff(now, 90);
    expect(cutoff).not.toBeNull();
    const age = now.getTime() - cutoff!.getTime();
    expect(age).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
