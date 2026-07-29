import { describe, it, expect } from "vitest";
import { executeWorkflow } from "../runner";
import type { IWorkflow } from "../../workflow/types";
import type { NodeExecutor } from "../types";

describe("E2E: Manual Trigger → Set → IF", () => {
  it("executes full pipeline with correct routing", async () => {
    const workflow: IWorkflow = {
      id: "e2e-1",
      name: "E2E Test",
      active: true,
      nodes: [
        {
          id: "1",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          position: [0, 0],
          parameters: {},
          typeVersion: 1,
        },
        {
          id: "2",
          name: "Set",
          type: "n8n-nodes-base.set",
          position: [200, 0],
          parameters: {
            mode: "manual",
            duplicateItem: false,
            assignments: {
              assignments: [
                { id: "a1", name: "score", value: 85, type: "number" },
                { id: "a2", name: "name", value: "Alice", type: "string" },
              ],
            },
            options: {},
          },
          typeVersion: 3,
        },
        {
          id: "3",
          name: "IF",
          type: "n8n-nodes-base.if",
          position: [400, 0],
          parameters: {
            conditions: {
              conditions: [
                {
                  leftValue: "={{ $json.score }}",
                  rightValue: 70,
                  operator: {
                    type: "number",
                    operation: "gte",
                  },
                },
              ],
            },
            options: {},
          },
          typeVersion: 2,
        },
      ],
      connections: {
        "Manual Trigger": {
          main: [[{ node: "Set", type: "main", index: 0 }]],
        },
        Set: {
          main: [[{ node: "IF", type: "main", index: 0 }]],
        },
      },
      settings: { executionOrder: "v1" },
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: {
        "n8n-nodes-base.manualTrigger": async () => [[{ json: {} }]],
        "n8n-nodes-base.set": async (ctx, node) => {
          const inputItems = ctx.getNodeInputItems("Manual Trigger", 0);
          const assignments =
            (node.parameters as any)?.assignments?.assignments ?? [];

          return [
            inputItems.map((item) => {
              const json = { ...item.json };
              for (const a of assignments) {
                json[a.name] = a.value;
              }
              return { json };
            }),
          ];
        },
        "n8n-nodes-base.if": async (ctx, node) => {
          const inputItems = ctx.getNodeInputItems("Set", 0);
          const trueItems: any[] = [];
          const falseItems: any[] = [];

          for (const item of inputItems) {
            if ((item.json.score as number) >= 70) {
              trueItems.push(item);
            } else {
              falseItems.push(item);
            }
          }

          return [trueItems, falseItems];
        },
      },
    });

    expect(result.success).toBe(true);

    expect(result.runData["Manual Trigger"].status).toBe("success");
    expect(result.runData["Set"].status).toBe("success");
    expect(result.runData["IF"].status).toBe("success");

    const setOutput = result.runData["Set"].items;
    expect(setOutput).toBeDefined();
    expect(setOutput![0][0].json.score).toBe(85);
    expect(setOutput![0][0].json.name).toBe("Alice");

    const ifOutput = result.runData["IF"].items;
    expect(ifOutput).toBeDefined();
    expect(ifOutput![0]).toHaveLength(1);
  });

  it("routes to false branch when condition fails", async () => {
    const workflow: IWorkflow = {
      id: "e2e-2",
      name: "E2E False Branch",
      active: true,
      nodes: [
        {
          id: "1",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          position: [0, 0],
          parameters: {},
          typeVersion: 1,
        },
        {
          id: "2",
          name: "Set",
          type: "n8n-nodes-base.set",
          position: [200, 0],
          parameters: {
            mode: "manual",
            assignments: {
              assignments: [
                { id: "a1", name: "score", value: 50, type: "number" },
              ],
            },
          },
          typeVersion: 3,
        },
        {
          id: "3",
          name: "IF",
          type: "n8n-nodes-base.if",
          position: [400, 0],
          parameters: {
            conditions: {
              conditions: [
                {
                  leftValue: "={{ $json.score }}",
                  rightValue: 70,
                  operator: { type: "number", operation: "gte" },
                },
              ],
            },
          },
          typeVersion: 2,
        },
      ],
      connections: {
        "Manual Trigger": {
          main: [[{ node: "Set", type: "main", index: 0 }]],
        },
        Set: {
          main: [[{ node: "IF", type: "main", index: 0 }]],
        },
      },
      settings: { executionOrder: "v1" },
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: {
        "n8n-nodes-base.manualTrigger": async () => [[{ json: {} }]],
        "n8n-nodes-base.set": async (ctx) => {
          const items = ctx.getNodeInputItems("Manual Trigger", 0);
          return [
            items.map((item) => ({
              json: { ...item.json, score: 50 },
            })),
          ];
        },
        "n8n-nodes-base.if": async (ctx) => {
          const items = ctx.getNodeInputItems("Set", 0);
          const trueItems: any[] = [];
          const falseItems: any[] = [];
          for (const item of items) {
            if ((item.json.score as number) >= 70) {
              trueItems.push(item);
            } else {
              falseItems.push(item);
            }
          }
          return [trueItems, falseItems];
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["IF"].status).toBe("success");

    const ifOutput = result.runData["IF"].items;
    expect(ifOutput![0]).toHaveLength(0);
    expect(ifOutput![1]).toHaveLength(1);
  });

  it("handles disabled node in pipeline", async () => {
    const workflow: IWorkflow = {
      id: "e2e-3",
      name: "E2E Disabled",
      active: true,
      nodes: [
        {
          id: "1",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          position: [0, 0],
          parameters: {},
          typeVersion: 1,
        },
        {
          id: "2",
          name: "Set (Disabled)",
          type: "n8n-nodes-base.set",
          position: [200, 0],
          parameters: {},
          disabled: true,
          typeVersion: 3,
        },
      ],
      connections: {
        "Manual Trigger": {
          main: [[{ node: "Set (Disabled)", type: "main", index: 0 }]],
        },
      },
      settings: { executionOrder: "v1" },
    };

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: {
        "n8n-nodes-base.manualTrigger": async () => [
          [{ json: { started: true } }],
        ],
        "n8n-nodes-base.set": async () => [
          [{ json: { shouldNotRun: true } }],
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Manual Trigger"].status).toBe("success");
    expect(result.runData["Set (Disabled)"].status).toBe("skipped");
  });
});
