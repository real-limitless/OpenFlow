import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("audit pruner", () => {
  it("does not delete audit rows from the application pruner", () => {
    const src = readFileSync(resolve(__dirname, "../services/retention.ts"), "utf8");
    expect(src).toMatch(/export async function pruneAuditLogs/);
    expect(src).not.toMatch(/auditLog\.delete/);
    expect(src).toMatch(/MIN_AUDIT_RETENTION_DAYS/);
    expect(src).toMatch(/await pruneAuditLogs\(\)/);
  });
});
