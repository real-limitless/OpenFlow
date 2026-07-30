import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.executeWorkflowTrigger";

describe("batch-queue executeWorkflowTrigger — n8n-nodes-base.executeWorkflowTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("When Executed by Another Workflow");
  });

  it("emits a single empty item on isolated run (no parent, no pin)", async () => {
    const out = await runNode(TYPE, { inputSource: "passthrough" }, []);
    expect(out).toEqual([[{ json: {} }]]);
  });

  it("passes through parent-provided items when present (passthrough mode)", async () => {
    const items = [{ json: { userId: 1, name: "Ada" } }, { json: { userId: 2, name: "Bob" } }];
    const out = await runNode(TYPE, { inputSource: "passthrough" }, items);
    expect(out).toEqual([items]);
  });

  it("workflowInputs schema declaration does not alter runtime emit", async () => {
    const params = {
      inputSource: "workflowInputs",
      workflowInputs: {
        values: [
          { name: "userId", type: "number" },
          { name: "name", type: "string" },
        ],
      },
    };
    const items = [{ json: { userId: 42, name: "Ada" } }];
    const out = await runNode(TYPE, params, items);
    expect(out).toEqual([items]);
  });

  it("jsonExample schema mode does not alter runtime emit", async () => {
    const params = {
      inputSource: "jsonExample",
      jsonExample: '{\n  "orderId": "abc",\n  "total": 10\n}',
    };
    const items = [{ json: { orderId: "abc", total: 10 } }];
    const out = await runNode(TYPE, params, items);
    expect(out).toEqual([items]);
  });

  it("v1 accept-all (no inputSource) passes through parent items", async () => {
    const node = makeNode({
      id: "t1",
      name: "Trigger",
      type: TYPE,
      typeVersion: 1,
      parameters: {},
    });
    const items = [{ json: { x: true } }];
    const out = await runNode(TYPE, {}, items);
    expect(out).toEqual([items]);
    expect(node.typeVersion).toBe(1);
  });

  it("uses pin data instead of empty default when pinned (editor debug)", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "When Executed by Another Workflow",
          type: TYPE,
          typeVersion: 1.1,
          parameters: { inputSource: "passthrough" },
        }),
        makeNode({ id: "n1", name: "Pass", type: "n8n-nodes-base.noOp" }),
      ],
      {
        "When Executed by Another Workflow": {
          main: [[{ node: "Pass", type: "main", index: 0 }]],
        },
      },
    );

    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: {
        "When Executed by Another Workflow": [{ json: { pinned: true } }],
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["When Executed by Another Workflow"]?.items?.[0]).toEqual([
      { json: { pinned: true } },
    ]);
    expect(result.runData.Pass?.items?.[0][0].json).toEqual({ pinned: true });
  });

  it("nested round-trip: parent executeWorkflow → child trigger → child terminal → parent output", async () => {
    const child = makeWorkflow(
      [
        makeNode({
          id: "ct",
          name: "When Executed by Another Workflow",
          type: TYPE,
          typeVersion: 1.1,
          parameters: { inputSource: "passthrough" },
        }),
        makeNode({
          id: "cs",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          parameters: {},
        }),
      ],
      {
        "When Executed by Another Workflow": {
          main: [[{ node: "Set", type: "main", index: 0 }]],
        },
      },
    );
    child.id = "child-wf-id";

    const parent = makeWorkflow(
      [
        makeNode({
          id: "pt",
          name: "Start",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          parameters: {},
        }),
        makeNode({
          id: "pr",
          name: "Run Child",
          type: "n8n-nodes-base.executeWorkflow",
          typeVersion: 1,
          parameters: {
            source: "database",
            workflowId: "child-wf-id",
            mode: "once",
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Run Child", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(parent, {
      subWorkflows: { "child-wf-id": child },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Run Child"]?.status).toBe("success");
    expect(result.runData["Run Child"]?.items?.[0][0].json).toEqual({});
  });

  it("resolves to the same executor regardless of version", () => {
    const exec = getExecutor(TYPE);
    expect(exec).toBeDefined();
    expect(getExecutor("nodes-base.executeWorkflowTrigger")).toBe(exec);
  });
});
