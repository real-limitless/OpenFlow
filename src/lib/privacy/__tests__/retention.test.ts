import { describe, expect, it } from "vitest";
import { parseRetentionPolicy, pickPruneIds, type ExecutionPruneRow } from "../retention";

function row(
  partial: Partial<ExecutionPruneRow> & Pick<ExecutionPruneRow, "id" | "workflowId">,
): ExecutionPruneRow {
  return {
    status: "success",
    startedAt: new Date("2026-01-01T00:00:00Z"),
    finishedAt: new Date("2026-01-01T00:01:00Z"),
    ...partial,
  };
}

describe("parseRetentionPolicy", () => {
  it("defaults to 30 days, 500 cap, credential redaction", () => {
    const p = parseRetentionPolicy(null, {});
    expect(p.retentionDays).toBe(30);
    expect(p.maxExecutionsPerWorkflow).toBe(500);
    expect(p.redactRunData).toBe(true);
    expect(p.redactPii).toBe(false);
  });

  it("lets env override days", () => {
    const p = parseRetentionPolicy({ retentionDays: 7 }, { OPENFLOW_RETENTION_DAYS: "2" });
    expect(p.retentionDays).toBe(2);
  });
});

describe("pickPruneIds", () => {
  const now = new Date("2026-09-11T00:00:00Z");

  it("drops finished rows older than retentionDays and keeps waiting", () => {
    const ids = pickPruneIds(
      [
        row({
          id: "old",
          workflowId: "w1",
          finishedAt: new Date("2026-01-01T00:00:00Z"),
        }),
        row({
          id: "wait",
          workflowId: "w1",
          status: "waiting",
          finishedAt: null,
          startedAt: new Date("2026-01-01T00:00:00Z"),
        }),
        row({
          id: "fresh",
          workflowId: "w1",
          finishedAt: new Date("2026-09-10T00:00:00Z"),
        }),
      ],
      {
        retentionDays: 7,
        maxExecutionsPerWorkflow: 0,
        redactRunData: true,
        redactPii: false,
        pruneActive: false,
      },
      now,
    );
    expect(ids).toEqual(["old"]);
  });

  it("keeps only the newest N finished executions per workflow", () => {
    const ids = pickPruneIds(
      [
        row({ id: "a", workflowId: "w1", finishedAt: new Date("2026-09-01T00:00:00Z") }),
        row({ id: "b", workflowId: "w1", finishedAt: new Date("2026-09-02T00:00:00Z") }),
        row({ id: "c", workflowId: "w1", finishedAt: new Date("2026-09-03T00:00:00Z") }),
      ],
      {
        retentionDays: 0,
        maxExecutionsPerWorkflow: 2,
        redactRunData: true,
        redactPii: false,
        pruneActive: false,
      },
      now,
    );
    expect(ids.sort()).toEqual(["a"]);
  });
});
