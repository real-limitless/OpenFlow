import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IWorkflow } from "@/lib/workflow/types";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.executeWorkflow";

/** Pass-through child: trigger (passthrough) → noOp → terminal items = input. */
function makeChildWorkflow(
  id: string,
  triggerParams: Record<string, unknown> = { inputSource: "passthrough" },
): IWorkflow {
  const child = makeWorkflow(
    [
      makeNode({
        id: "ct",
        name: "When Executed by Another Workflow",
        type: "n8n-nodes-base.executeWorkflowTrigger",
        typeVersion: 1.1,
        parameters: triggerParams,
      }),
      makeNode({ id: "cp", name: "Pass", type: "n8n-nodes-base.noOp", typeVersion: 1 }),
    ],
    {
      "When Executed by Another Workflow": {
        main: [[{ node: "Pass", type: "main", index: 0 }]],
      },
    },
  );
  child.id = id;
  return child;
}

function makeCtxWithSubWorkflow(
  type: string,
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  runSubWorkflow?: ExecutionContext["runSubWorkflow"],
  continueOnFail = false,
): { ctx: ExecutionContext; node: INode } {
  const normalized: INodeExecutionData[] = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
  const node = makeNode({ name: "N", type, parameters });
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => normalized,
    continueOnFail,
    runSubWorkflow,
  });
  return { ctx, node };
}

async function runWithPin(
  workflow: IWorkflow,
  opts: {
    pinData?: Record<string, INodeExecutionData[]>;
    subWorkflows?: Record<string, IWorkflow>;
  },
) {
  return executeWorkflow({
    workflow,
    nodeExecutors: getExecutorMap(),
    pinData: opts.pinData,
    subWorkflows: opts.subWorkflows,
  });
}

describe("batch-queue executeWorkflow — n8n-nodes-base.executeWorkflow", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Execute Workflow");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.executeWorkflow")).toBe(canonical);
  });

  it("database source, run once with all items — returns child terminal items", async () => {
    const child = makeChildWorkflow("child-wf-id");

    const parent = makeWorkflow(
      [
        makeNode({ id: "pt", name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1 }),
        makeNode({
          id: "pr",
          name: "Run Child",
          type: TYPE,
          typeVersion: 1.2,
          parameters: {
            source: "database",
            workflowId: "child-wf-id",
            mode: "once",
            options: { waitForSubWorkflow: true },
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Run Child", type: "main", index: 0 }]] },
      },
    );

    const result = await runWithPin(parent, {
      pinData: {
        Start: [{ json: { userId: 1, name: "Ada" } }, { json: { userId: 2, name: "Bob" } }],
      },
      subWorkflows: { "child-wf-id": child },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Run Child"]?.status).toBe("success");
    // Pass-through child returns both input items from a single run.
    const items = result.runData["Run Child"]?.items?.[0] ?? [];
    expect(items).toHaveLength(2);
    expect(items[0].json).toEqual({ userId: 1, name: "Ada" });
    expect(items[1].json).toEqual({ userId: 2, name: "Bob" });
  });

  it("mode=each concatenates per-item child runs in order", async () => {
    const child = makeChildWorkflow("child-each");

    const parent = makeWorkflow(
      [
        makeNode({ id: "pt", name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1 }),
        makeNode({
          id: "pr",
          name: "Run Child",
          type: TYPE,
          typeVersion: 1.2,
          parameters: {
            source: "database",
            workflowId: "child-each",
            mode: "each",
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Run Child", type: "main", index: 0 }]] },
      },
    );

    const result = await runWithPin(parent, {
      pinData: { Start: [{ json: { userId: 1 } }, { json: { userId: 2 } }] },
      subWorkflows: { "child-each": child },
    });

    expect(result.success).toBe(true);
    // Two child runs (one per item) → two terminal items concatenated.
    const items = result.runData["Run Child"]?.items?.[0] ?? [];
    expect(items).toHaveLength(2);
    expect(items[0].json).toEqual({ userId: 1 });
    expect(items[1].json).toEqual({ userId: 2 });
  });

  it("workflowInputs mapping null-fills unmapped child schema fields", async () => {
    const captured: INodeExecutionData[][] = [];
    const { ctx, node } = makeCtxWithSubWorkflow(
      TYPE,
      {
        source: "database",
        workflowId: "child-wf-id",
        mode: "once",
        workflowInputs: {
          mappingMode: "defineBelow",
          schema: [
            { name: "userId", type: "number" },
            { name: "role", type: "string" },
          ],
          value: { userId: { value: "={{ $json.userId }}" } },
        },
      },
      [{ userId: 42 }],
      async (opts) => {
        captured.push(opts.items);
        return opts.items;
      },
    );

    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    expect(captured).toHaveLength(1);
    expect(captured[0][0].json).toEqual({ userId: 42, role: null });
  });

  it("workflowInputs passes mapped value through when no schema given", async () => {
    const captured: INodeExecutionData[][] = [];
    const { ctx, node } = makeCtxWithSubWorkflow(
      TYPE,
      {
        source: "database",
        workflowId: "child-wf-id",
        mode: "once",
        workflowInputs: {
          mappingMode: "defineBelow",
          value: { greeting: { value: "={{ 'Hi ' + $json.name }}" } },
        },
      },
      [{ name: "Ada" }],
      async (opts) => {
        captured.push(opts.items);
        return opts.items;
      },
    );

    const executor = getExecutor(TYPE)!;
    await executor(ctx, node);

    expect(captured[0][0].json).toEqual({ greeting: "Hi Ada" });
  });

  it("waitForSubWorkflow=false returns input items without awaiting child terminal output", async () => {
    let childCalled = false;
    const { ctx, node } = makeCtxWithSubWorkflow(
      TYPE,
      {
        source: "database",
        workflowId: "child-wf-id",
        mode: "once",
        options: { waitForSubWorkflow: false },
      },
      [{ userId: 1 }, { userId: 2 }],
      async () => {
        childCalled = true;
        return [{ json: { child: "ran" } }];
      },
    );

    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);

    expect(childCalled).toBe(true);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ userId: 1 });
    expect(out[0][1].json).toEqual({ userId: 2 });
  });

  it("waitForSubWorkflow=false works without a runner present (fire-and-forget best-effort)", async () => {
    const { ctx, node } = makeCtxWithSubWorkflow(
      TYPE,
      {
        source: "database",
        workflowId: "child-wf-id",
        mode: "once",
        options: { waitForSubWorkflow: false },
      },
      [{ a: 1 }],
      undefined,
    );

    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toEqual({ a: 1 });
  });

  it("accepts waitForCompletion as a legacy alias for waitForSubWorkflow", async () => {
    const { ctx, node } = makeCtxWithSubWorkflow(
      TYPE,
      {
        source: "database",
        workflowId: "child-wf-id",
        mode: "once",
        options: { waitForCompletion: false },
      },
      [{ a: 1 }],
      undefined,
    );

    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toEqual({ a: 1 });
  });

  it("missing workflowId + continueOnFail — error captured, downstream node still runs", async () => {
    const parent = makeWorkflow(
      [
        makeNode({ id: "pt", name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1 }),
        makeNode({
          id: "pr",
          name: "Run Child",
          type: TYPE,
          typeVersion: 1.2,
          parameters: {
            source: "database",
            workflowId: "does-not-exist",
            mode: "once",
          },
          continueOnFail: true,
        }),
        makeNode({ id: "pa", name: "After", type: "n8n-nodes-base.noOp", typeVersion: 1 }),
      ],
      {
        Start: { main: [[{ node: "Run Child", type: "main", index: 0 }]] },
        "Run Child": { main: [[{ node: "After", type: "main", index: 0 }]] },
      },
    );

    const result = await runWithPin(parent, {
      pinData: { Start: [{ json: { x: 1 } }] },
      subWorkflows: {},
    });

    expect(result.runData["Run Child"]?.status).toBe("error");
    expect(result.runData["Run Child"]?.error).toMatch(/not found/i);
    // continueOnFail → downstream node still executes.
    expect(result.runData.After?.status).toBe("success");
  });

  it("parameter source (inline workflowJson) executes the child", async () => {
    const child = makeChildWorkflow("inline-child");

    const parent = makeWorkflow(
      [
        makeNode({ id: "pt", name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1 }),
        makeNode({
          id: "pr",
          name: "Run Child",
          type: TYPE,
          typeVersion: 1.2,
          parameters: {
            source: "parameter",
            workflowJson: child,
            mode: "once",
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Run Child", type: "main", index: 0 }]] },
      },
    );

    const result = await runWithPin(parent, {
      pinData: { Start: [{ json: { x: 1 } }] },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Run Child"]?.status).toBe("success");
    expect(result.runData["Run Child"]?.items?.[0]?.[0]?.json).toEqual({ x: 1 });
  });

  it("runs end-to-end via runWorkflowFixture helper", async () => {
    const child = makeChildWorkflow("c2");
    const parent = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Sub",
          type: TYPE,
          typeVersion: 1.2,
          parameters: { source: "database", workflowId: "c2", mode: "once" },
        }),
      ],
      {
        Start: { main: [[{ node: "Sub", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(parent, { subWorkflows: { c2: child } });
    expect(result.success).toBe(true);
    expect(result.runData.Sub?.status).toBe("success");
  });
});