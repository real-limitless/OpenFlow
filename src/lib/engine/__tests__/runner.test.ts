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

  it("limits run to selected trigger branch", async () => {
    const workflow = makeWorkflow(
      [
        {
          id: "1",
          name: "Manual A",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "Manual B",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 100],
          parameters: {},
        },
        {
          id: "3",
          name: "Set A",
          type: "set",
          typeVersion: 1,
          position: [200, 0],
          parameters: {},
        },
        {
          id: "4",
          name: "Set B",
          type: "set",
          typeVersion: 1,
          position: [200, 100],
          parameters: {},
        },
      ],
      {
        "Manual A": { main: [[{ node: "Set A", type: "main", index: 0 }]] },
        "Manual B": { main: [[{ node: "Set B", type: "main", index: 0 }]] },
      },
    );

    const plan = createExecutionPlan(workflow, "Manual B");
    expect(plan.startNodes).toEqual(["Manual B"]);
    expect(plan.runOrder).toContain("Manual B");
    expect(plan.runOrder).toContain("Set B");
    expect(plan.runOrder).not.toContain("Manual A");
    expect(plan.runOrder).not.toContain("Set A");

    const mock: NodeExecutor = async () => [[{ json: { ok: true } }]];
    const result = await executeWorkflow({
      workflow,
      nodeExecutors: {
        "n8n-nodes-base.manualTrigger": mock,
        set: mock,
      },
      startNode: "Manual B",
    });
    expect(result.success).toBe(true);
    expect(result.runData["Manual B"]?.status).toBe("success");
    expect(result.runData["Set B"]?.status).toBe("success");
    expect(result.runData["Manual A"]).toBeUndefined();
    expect(result.runData["Set A"]).toBeUndefined();
  });

  it("creates plan for empty workflow", () => {
    const workflow = makeWorkflow([]);
    const plan = createExecutionPlan(workflow);
    expect(plan.runOrder).toEqual([]);
    expect(plan.startNodes).toEqual([]);
  });

  it("execute previous nodes stops before destination", async () => {
    const workflow = makeWorkflow(
      [
        {
          id: "1",
          name: "Start",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "Set",
          type: "set",
          typeVersion: 1,
          position: [200, 0],
          parameters: {},
        },
        {
          id: "3",
          name: "IF",
          type: "if",
          typeVersion: 1,
          position: [400, 0],
          parameters: {},
        },
      ],
      {
        Start: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        Set: { main: [[{ node: "IF", type: "main", index: 0 }]] },
      },
    );

    const plan = createExecutionPlan(workflow, "Start", "IF", true);
    expect(plan.runOrder).toContain("Start");
    expect(plan.runOrder).toContain("Set");
    expect(plan.runOrder).not.toContain("IF");

    const mock: NodeExecutor = async (_ctx, node) => [[{ json: { from: node.name } }]];
    const result = await executeWorkflow({
      workflow,
      nodeExecutors: {
        "n8n-nodes-base.manualTrigger": mock,
        set: mock,
        if: mock,
      },
      destinationNode: "IF",
      stopBeforeDestination: true,
    });
    expect(result.success).toBe(true);
    expect(result.runData.Start?.status).toBe("success");
    expect(result.runData.Set?.status).toBe("success");
    expect(result.runData.IF).toBeUndefined();
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

  it("skips IF false-branch children when condition passes", async () => {
    const workflow = makeWorkflow(
      [
        {
          id: "1",
          name: "Start",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "IF",
          type: "n8n-nodes-base.if",
          typeVersion: 2,
          position: [200, 0],
          parameters: {},
        },
        {
          id: "3",
          name: "TruePath",
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
          position: [400, -80],
          parameters: {},
        },
        {
          id: "4",
          name: "FalsePath",
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
          position: [400, 80],
          parameters: {},
        },
      ],
      {
        Start: { main: [[{ node: "IF", type: "main", index: 0 }]] },
        IF: {
          main: [
            [{ node: "TruePath", type: "main", index: 0 }],
            [{ node: "FalsePath", type: "main", index: 0 }],
          ],
        },
      },
    );

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: {
        "n8n-nodes-base.manualTrigger": async () => [[{ json: { n: 1 } }]],
        "n8n-nodes-base.if": async () => [[{ json: { n: 1 } }], []],
        "n8n-nodes-base.noOp": async (ctx) => [ctx.getNodeInputItems(ctx.getNode().name, 0)],
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["TruePath"].status).toBe("success");
    expect(result.runData["TruePath"].items?.[0]).toHaveLength(1);
    expect(result.runData["FalsePath"].status).toBe("skipped");
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
