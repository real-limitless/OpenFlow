import { describe, expect, it } from "vitest";
import {
  buildErrorWorkflowPayload,
  failedNodeName,
  inputItemsForNode,
  isErrorTriggerType,
} from "../error-workflow";
import type { IWorkflow } from "../../workflow/types";

describe("error workflow helpers", () => {
  it("finds the failed node and builds Shape A", () => {
    expect(failedNodeName({ A: { status: "success" }, B: { status: "error" } })).toBe("B");
    const payload = buildErrorWorkflowPayload({
      executionId: "ex1",
      mode: "manual",
      workflowId: "w1",
      workflowName: "Main",
      lastNodeExecuted: "B",
      message: "boom",
      publicUrl: "http://localhost:8080",
    });
    expect(payload.execution.lastNodeExecuted).toBe("B");
    expect(payload.execution.url).toContain("/executions/ex1");
    expect(payload.workflow.name).toBe("Main");
  });

  it("collects upstream items for replay", () => {
    const workflow = {
      connections: {
        A: { main: [[{ node: "B", type: "main", index: 0 }]] },
      },
    } as unknown as IWorkflow;
    const items = inputItemsForNode(
      workflow,
      { A: { status: "success", items: [[{ json: { n: 1 } }]] } },
      "B",
    );
    expect(items).toEqual([{ json: { n: 1 } }]);
  });

  it("recognizes error trigger types", () => {
    expect(isErrorTriggerType("n8n-nodes-base.errorTrigger")).toBe(true);
    expect(isErrorTriggerType("openflow-node-base.errorTrigger")).toBe(true);
    expect(isErrorTriggerType("n8n-nodes-base.webhook")).toBe(false);
  });
});

describe("replay startInputItems", () => {
  it("re-executes the failed node with injected input", async () => {
    const { executeWorkflow } = await import("../runner");
    const { makeNode, makeWorkflow } = await import("./helpers");
    const boom = makeNode({
      id: "2",
      name: "Boom",
      type: "fail",
    });
    const wf = makeWorkflow([boom]);
    let seen = "";
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: {
        fail: async (ctx) => {
          seen = String(ctx.getInputItems(0)[0]?.json.n ?? "");
          return [[{ json: { n: seen, ok: true } }]];
        },
      },
      startNode: "Boom",
      startInputItems: [{ json: { n: 9 } }],
    });
    expect(result.success).toBe(true);
    expect(seen).toBe("9");
  });
});
