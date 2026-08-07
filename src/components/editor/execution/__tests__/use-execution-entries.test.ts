import { describe, expect, it } from "vitest";
import type { ExecutionRunData } from "@/lib/engine/types";
import { buildExecutionEntries, executionStats } from "../use-execution-entries";

describe("buildExecutionEntries", () => {
  it("maps run data and sorts by startedAt", () => {
    const runData: ExecutionRunData = {
      B: {
        status: "success",
        startedAt: "2026-01-01T00:00:02.000Z",
        finishedAt: "2026-01-01T00:00:03.000Z",
        items: [[{ json: { x: 1 } }]],
      },
      A: {
        status: "success",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:01.000Z",
        items: [[{ json: {} }, { json: {} }]],
      },
    };
    const entries = buildExecutionEntries(runData);
    expect(entries.map((e) => e.name)).toEqual(["A", "B"]);
    expect(entries[0]?.itemCount).toBe(2);
    expect(entries[0]?.durationMs).toBe(1000);
    expect(entries[1]?.durationMs).toBe(1000);
  });

  it("falls back to workflow node order without timestamps", () => {
    const runData: ExecutionRunData = {
      Z: { status: "pending" },
      M: { status: "running" },
      A: { status: "success", items: [[]] },
    };
    const entries = buildExecutionEntries(runData, ["A", "M", "Z"]);
    expect(entries.map((e) => e.name)).toEqual(["A", "M", "Z"]);
  });

  it("counts stats by status", () => {
    const entries = buildExecutionEntries({
      a: { status: "success" },
      b: { status: "error", error: "boom" },
      c: { status: "running" },
      d: { status: "success" },
    });
    expect(executionStats(entries)).toEqual({
      pending: 0,
      running: 1,
      success: 2,
      error: 1,
      skipped: 0,
    });
  });
});
