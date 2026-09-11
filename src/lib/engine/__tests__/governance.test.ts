import { describe, expect, it } from "vitest";
import {
  ExecutionAbortedError,
  isExecutionAbortedError,
  parseExecutionTimeoutMs,
  parseMaxConcurrency,
  raceWithAbort,
} from "../governance";

describe("parseExecutionTimeoutMs", () => {
  it("reads seconds and millisecond override", () => {
    expect(parseExecutionTimeoutMs({ executionTimeout: 30 })).toBe(30_000);
    expect(parseExecutionTimeoutMs({ executionTimeoutMs: 250 })).toBe(250);
    expect(parseExecutionTimeoutMs({ executionTimeout: 5, executionTimeoutMs: 10 })).toBe(10);
    expect(parseExecutionTimeoutMs({})).toBeNull();
    expect(parseExecutionTimeoutMs({ executionTimeout: 0 })).toBeNull();
  });
});

describe("executeWorkflow abort", () => {
  it("stops before later nodes when shouldAbort fires", async () => {
    const { executeWorkflow } = await import("../runner");
    const { makeNode, makeWorkflow } = await import("./helpers");
    const start = makeNode({
      id: "1",
      name: "Start",
      type: "n8n-nodes-base.manualTrigger",
    });
    const later = makeNode({
      id: "2",
      name: "Later",
      type: "n8n-nodes-base.noOp",
    });
    const wf = makeWorkflow([start, later], {
      Start: { main: [[{ node: "Later", type: "main", index: 0 }]] },
    });
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: {
        "n8n-nodes-base.manualTrigger": async () => [[{ json: {} }]],
        "n8n-nodes-base.noOp": async () => [[{ json: { ran: true } }]],
      },
      shouldAbort: () => "cancelled",
    });
    expect(result.aborted).toBe("cancelled");
    expect(result.success).toBe(false);
  });
});

describe("parseMaxConcurrency", () => {
  it("requires a positive integer", () => {
    expect(parseMaxConcurrency({ maxConcurrency: 2 })).toBe(2);
    expect(parseMaxConcurrency({ maxConcurrency: "3" })).toBe(3);
    expect(parseMaxConcurrency({ maxConcurrency: 0 })).toBeNull();
    expect(parseMaxConcurrency(undefined)).toBeNull();
  });
});

describe("raceWithAbort", () => {
  it("rejects when shouldAbort returns a reason", async () => {
    await expect(
      raceWithAbort(
        new Promise(() => {}),
        () => "timeout",
      ),
    ).rejects.toSatisfy((err: unknown) => {
      expect(isExecutionAbortedError(err)).toBe(true);
      expect((err as ExecutionAbortedError).reason).toBe("timeout");
      return true;
    });
  });

  it("resolves the work when abort never fires", async () => {
    const value = await raceWithAbort(Promise.resolve(7), () => null);
    expect(value).toBe(7);
  });
});
