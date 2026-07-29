import { describe, it, expect } from "vitest";
import { executeWorkflow, createExecutionPlan } from "../runner";
import type { IWorkflow, INode } from "../../workflow/types";
import type { NodeExecutor } from "../types";

function makeWorkflow(nodes: INode[], connections = {}): IWorkflow {
  return {
    id: "wf-test",
    name: "test",
    active: false,
    nodes,
    connections,
    settings: { executionOrder: "v1" },
  };
}

describe("Runner", () => {
  it("creates execution plan", () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "End", type: "n8n-nodes-base.noOp", typeVersion: 1, position: [200, 0], parameters: {} },
      ],
      { Start: { main: [[{ node: "End", type: "main", index: 0 }]] } },
    );

    const plan = createExecutionPlan(workflow);
    expect(plan.runOrder).toContain("Start");
    expect(plan.runOrder).toContain("End");
    expect(plan.startNodes).toContain("Start");
    expect(plan.workflow).toBe(workflow);
  });

  it("creates plan for empty workflow", () => {
    const workflow = makeWorkflow([]);
    const plan = createExecutionPlan(workflow);
    expect(plan.runOrder).toEqual([]);
    expect(plan.startNodes).toEqual([]);
  });

  it("executes simple workflow", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Set", type: "set", typeVersion: 1, position: [200, 0], parameters: { value: "hello" } },
      ],
      { Start: { main: [[{ node: "Set", type: "main", index: 0 }]] } },
    );

    const mockExecutor: NodeExecutor = async (_ctx, node) => {
      if (node.type === "trigger") return [[{ json: { triggered: true } }]];
      return [[{ json: { value: "hello" } }]];
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: mockExecutor, set: mockExecutor },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Start"].status).toBe("success");
    expect(result.runData["Set"].status).toBe("success");
  });

  it("skips disabled nodes", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Disabled", type: "set", typeVersion: 1, position: [200, 0], parameters: {}, disabled: true },
      ],
      { Start: { main: [[{ node: "Disabled", type: "main", index: 0 }]] } },
    );

    const mockExecutor: NodeExecutor = async () => [[{ json: { ok: true } }]];

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: mockExecutor, set: mockExecutor },
    });

    expect(result.runData["Start"].status).toBe("success");
    expect(result.runData["Disabled"].status).toBe("skipped");
  });

  it("skips nodes with no matching executor", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Unknown", type: "unknown-type", typeVersion: 1, position: [200, 0], parameters: {} },
      ],
      { Start: { main: [[{ node: "Unknown", type: "main", index: 0 }]] } },
    );

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: async () => [[{ json: {} }]] },
    });

    expect(result.runData["Unknown"].status).toBe("skipped");
    expect(result.runData["Unknown"].error).toContain("No executor");
  });

  it("handles continueOnFail", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Fail", type: "failing", typeVersion: 1, position: [200, 0], parameters: {}, continueOnFail: true },
      ],
      { Start: { main: [[{ node: "Fail", type: "main", index: 0 }]] } },
    );

    const failExecutor: NodeExecutor = async () => {
      throw new Error("Node failed");
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: async () => [[{ json: {} }]], failing: failExecutor },
    });

    expect(result.runData["Fail"].status).toBe("error");
    expect(result.runData["Fail"].error).toBe("Node failed");
    expect(result.success).toBe(false);
  });

  it("continues regular output on onError", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Fail", type: "failing", typeVersion: 1, position: [200, 0], parameters: {}, onError: "continueRegularOutput" },
      ],
      { Start: { main: [[{ node: "Fail", type: "main", index: 0 }]] } },
    );

    const failExecutor: NodeExecutor = async () => {
      throw new Error("boom");
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: async () => [[{ json: {} }]], failing: failExecutor },
    });

    expect(result.runData["Fail"].status).toBe("error");
    expect(result.runData["Fail"].error).toBe("boom");
  });

  it("retries on failure", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Retry", type: "flaky", typeVersion: 1, position: [200, 0], parameters: {}, retryOnFail: true, maxTries: 3, waitBetweenTries: 10 },
      ],
      { Start: { main: [[{ node: "Retry", type: "main", index: 0 }]] } },
    );

    let attempts = 0;
    const flakyExecutor: NodeExecutor = async () => {
      attempts++;
      if (attempts < 3) throw new Error("Not yet");
      return [[{ json: { success: true } }]];
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: async () => [[{ json: {} }]], flaky: flakyExecutor },
    });

    expect(attempts).toBe(3);
    expect(result.runData["Retry"].status).toBe("success");
  });

  it("fails after max retries exhausted", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Retry", type: "flaky", typeVersion: 1, position: [200, 0], parameters: {}, retryOnFail: true, maxTries: 2, waitBetweenTries: 10 },
      ],
      { Start: { main: [[{ node: "Retry", type: "main", index: 0 }]] } },
    );

    const alwaysFail: NodeExecutor = async () => {
      throw new Error("always fail");
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: async () => [[{ json: {} }]], flaky: alwaysFail },
    });

    expect(result.runData["Retry"].status).toBe("error");
    expect(result.runData["Retry"].error).toBe("always fail");
    expect(result.success).toBe(false);
  });

  it("uses pin data when available", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "Start", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Pinned", type: "noop", typeVersion: 1, position: [200, 0], parameters: {} },
      ],
      { Start: { main: [[{ node: "Pinned", type: "main", index: 0 }]] } },
    );

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: async () => [[{ json: {} }]], noop: async () => [[{ json: { from: "executor" } }]] },
      pinData: { Pinned: [{ json: { from: "pin" } }] },
    });

    expect(result.runData["Pinned"].status).toBe("success");
    expect(result.runData["Pinned"].items).toEqual([[{ json: { from: "pin" } }]]);
  });

  it("reports success when all nodes succeed", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "A", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "B", type: "noop", typeVersion: 1, position: [200, 0], parameters: {} },
      ],
      { A: { main: [[{ node: "B", type: "main", index: 0 }]] } },
    );

    const ok: NodeExecutor = async () => [[{ json: {} }]];

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: { trigger: ok, noop: ok },
    });

    expect(result.success).toBe(true);
  });

  it("reports failure when any node errors", async () => {
    const workflow = makeWorkflow(
      [
        { id: "1", name: "A", type: "trigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "B", type: "failing", typeVersion: 1, position: [200, 0], parameters: {} },
      ],
      { A: { main: [[{ node: "B", type: "main", index: 0 }]] } },
    );

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: {
        trigger: async () => [[{ json: {} }]],
        failing: async () => { throw new Error("fail"); },
      },
    });

    expect(result.success).toBe(false);
    expect(result.runData["B"].status).toBe("error");
  });
});
