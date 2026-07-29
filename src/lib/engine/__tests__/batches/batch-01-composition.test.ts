import { describe, it, expect } from "vitest";
import { hasExecutor, seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import {
  makeNode,
  makeWorkflow,
  runNode,
  runWorkflowFixture,
} from "../helpers";
import type { IWorkflow } from "@/lib/workflow/types";
import { executeWorkflow } from "../../runner";

const BATCH_TYPES = [
  "n8n-nodes-base.executeWorkflow",
  "n8n-nodes-base.stopAndError",
  "n8n-nodes-base.wait",
  "n8n-nodes-base.merge",
] as const;

describe("batch-01 composition", () => {
  seedBuiltinExecutors();
  seedBuiltinDescriptions();

  it("registers all four batch types", () => {
    for (const t of BATCH_TYPES) {
      expect(hasExecutor(t), t).toBe(true);
      expect(getNodeType(t).placeholder).not.toBe(true);
    }
    expect(hasExecutor("n8n-nodes-base.executeWorkflowTrigger")).toBe(true);
  });

  describe("stopAndError", () => {
    it("throws error message", async () => {
      await expect(
        runNode("n8n-nodes-base.stopAndError", {
          errorType: "errorMessage",
          errorMessage: "boom",
        }),
      ).rejects.toThrow(/boom/);
    });

    it("throws from error object", async () => {
      await expect(
        runNode("n8n-nodes-base.stopAndError", {
          errorType: "errorObject",
          errorObject: { message: "obj-fail", code: 1 },
        }),
      ).rejects.toThrow(/obj-fail/);
    });
  });

  describe("wait", () => {
    it("passes items after zero-second wait", async () => {
      const out = await runNode(
        "n8n-nodes-base.wait",
        { resume: "timeInterval", amount: 0, unit: "seconds" },
        [{ ok: true }],
      );
      expect(out[0][0].json.ok).toBe(true);
    });
  });

  describe("merge", () => {
    it("appends two input streams", async () => {
      const map = getExecutorMap();
      const exec = map["n8n-nodes-base.merge"]!;
      const node = makeNode({
        name: "Merge",
        type: "n8n-nodes-base.merge",
        parameters: { mode: "append", numberInputs: 2 },
      });
      const { createExecutionContext } = await import("@/sdk");
      const ctx = createExecutionContext({
        node,
        workflow: makeWorkflow([node]),
        getNodeInputItems: (_n, inputIndex) => {
          if (inputIndex === 0) return [{ json: { a: 1 } }];
          if (inputIndex === 1) return [{ json: { b: 2 } }];
          return [];
        },
        continueOnFail: false,
      });
      const out = await exec(ctx, node);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.a).toBe(1);
      expect(out[0][1].json.b).toBe(2);
    });

    it("combines by matching fields", async () => {
      const map = getExecutorMap();
      const exec = map["n8n-nodes-base.merge"]!;
      const node = makeNode({
        name: "Merge",
        type: "n8n-nodes-base.merge",
        parameters: {
          mode: "combine",
          combineBy: "combineByFields",
          fieldsToMatchString: "language",
          numberInputs: 2,
        },
      });
      const { createExecutionContext } = await import("@/sdk");
      const ctx = createExecutionContext({
        node,
        workflow: makeWorkflow([node]),
        getNodeInputItems: (_n, inputIndex) => {
          if (inputIndex === 0)
            return [
              { json: { name: "Stefan", language: "de" } },
              { json: { name: "Jim", language: "en" } },
            ];
          return [
            { json: { greeting: "Hello", language: "en" } },
            { json: { greeting: "Hallo", language: "de" } },
          ];
        },
        continueOnFail: false,
      });
      const out = await exec(ctx, node);
      const byName = Object.fromEntries(out[0].map((i) => [i.json.name as string, i.json]));
      expect(byName.Stefan.greeting).toBe("Hallo");
      expect(byName.Jim.greeting).toBe("Hello");
    });
  });

  describe("executeWorkflow", () => {
    it("runs a nested workflow once with all items", async () => {
      const child: IWorkflow = {
        id: "child-1",
        name: "Child",
        active: false,
        nodes: [
          {
            id: "t",
            name: "When Called",
            type: "n8n-nodes-base.executeWorkflowTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
          {
            id: "s",
            name: "Set",
            type: "n8n-nodes-base.set",
            typeVersion: 1,
            position: [200, 0],
            parameters: {
              mode: "manual",
              fields: [{ name: "fromChild", value: "yes", type: "stringValue" }],
              includeOtherFields: true,
            },
          },
        ],
        connections: {
          "When Called": {
            main: [[{ node: "Set", type: "main", index: 0 }]],
          },
        },
        settings: {},
      };

      const parent = makeWorkflow(
        [
          makeNode({
            id: "1",
            name: "Start",
            type: "n8n-nodes-base.manualTrigger",
          }),
          makeNode({
            id: "2",
            name: "Run Child",
            type: "n8n-nodes-base.executeWorkflow",
            parameters: {
              source: "database",
              workflowId: "child-1",
              mode: "once",
            },
          }),
        ],
        {
          Start: {
            main: [[{ node: "Run Child", type: "main", index: 0 }]],
          },
        },
      );

      const result = await executeWorkflow({
        workflow: parent,
        nodeExecutors: getExecutorMap(),
        pinData: {
          Start: [{ json: { name: "Ada" } }],
        },
        subWorkflows: { "child-1": child },
      });

      expect(result.success).toBe(true);
      const items = result.runData["Run Child"]?.items?.[0] ?? [];
      expect(items[0]?.json.fromChild).toBe("yes");
      expect(items[0]?.json.name).toBe("Ada");
    });

    it("runs inline workflowJson parameter source", async () => {
      const child: IWorkflow = {
        id: "inline",
        name: "Inline",
        active: false,
        nodes: [
          {
            id: "t",
            name: "T",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
          {
            id: "n",
            name: "NoOp",
            type: "n8n-nodes-base.noOp",
            typeVersion: 1,
            position: [200, 0],
            parameters: {},
          },
        ],
        connections: {
          T: { main: [[{ node: "NoOp", type: "main", index: 0 }]] },
        },
        settings: {},
      };

      const parent = makeWorkflow(
        [
          makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
          makeNode({
            id: "2",
            name: "Sub",
            type: "n8n-nodes-base.executeWorkflow",
            parameters: {
              source: "parameter",
              workflowJson: child,
              mode: "once",
            },
          }),
        ],
        {
          Start: { main: [[{ node: "Sub", type: "main", index: 0 }]] },
        },
      );

      const result = await executeWorkflow({
        workflow: parent,
        nodeExecutors: getExecutorMap(),
        pinData: { Start: [{ json: { x: 1 } }] },
      });
      expect(result.success).toBe(true);
      expect(result.runData.Sub?.items?.[0]?.[0]?.json.x).toBe(1);
    });

    it("nested run via runWorkflowFixture helper with subWorkflows", async () => {
      const child: IWorkflow = makeWorkflow(
        [
          makeNode({
            id: "t",
            name: "Entry",
            type: "n8n-nodes-base.executeWorkflowTrigger",
          }),
          makeNode({
            id: "s",
            name: "Pass",
            type: "n8n-nodes-base.noOp",
          }),
        ],
        {
          Entry: { main: [[{ node: "Pass", type: "main", index: 0 }]] },
        },
      );
      child.id = "c2";

      const parent = makeWorkflow(
        [
          makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
          makeNode({
            id: "2",
            name: "Sub",
            type: "n8n-nodes-base.executeWorkflow",
            parameters: { workflowId: "c2", mode: "once", source: "database" },
          }),
        ],
        {
          Start: { main: [[{ node: "Sub", type: "main", index: 0 }]] },
        },
      );

      const result = await executeWorkflow({
        workflow: parent,
        nodeExecutors: getExecutorMap(),
        pinData: { Start: [{ json: { v: 9 } }] },
        subWorkflows: { c2: child },
      });
      expect(result.success).toBe(true);
      expect(result.runData.Sub?.items?.[0]?.[0]?.json.v).toBe(9);
    });

    it("fails when sub-workflow id missing", async () => {
      const parent = makeWorkflow(
        [
          makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
          makeNode({
            id: "2",
            name: "Sub",
            type: "n8n-nodes-base.executeWorkflow",
            parameters: { workflowId: "missing", mode: "once" },
          }),
        ],
        {
          Start: { main: [[{ node: "Sub", type: "main", index: 0 }]] },
        },
      );

      const result = await executeWorkflow({
        workflow: parent,
        nodeExecutors: getExecutorMap(),
        pinData: { Start: [{ json: {} }] },
        subWorkflows: {},
      });
      expect(result.success).toBe(false);
      expect(result.runData.Sub?.error).toMatch(/not found/i);
    });
  });

  it("stopAndError fails a workflow run", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Fail",
          type: "n8n-nodes-base.stopAndError",
          parameters: { errorMessage: "halted" },
        }),
      ],
      {
        Start: { main: [[{ node: "Fail", type: "main", index: 0 }]] },
      },
    );
    const result = await runWorkflowFixture(wf);
    expect(result.success).toBe(false);
    expect(result.runData.Fail?.error).toMatch(/halted/);
  });
});
