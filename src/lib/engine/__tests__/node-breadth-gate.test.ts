import { describe, it, expect } from "vitest";
import { getNodeType } from "../../nodes/registry";
import { defaultExecutors } from "../executors";
import { BUILTIN_EXECUTOR_MODULES } from "../node-runtime";
import { executeWorkflow } from "../runner";

/**
 * Guards the executor barrel wiring itself.
 *
 * executors/index.ts registers every module listed in BUILTIN_EXECUTOR_MODULES
 * via an eager import.meta.glob. If that ever regresses to a dynamic
 * `import(variablePath)`, the modules vanish from the production bundle while
 * every other test keeps passing, because Vitest resolves them at runtime.
 * This test fails on a stale/misspelled entry, which is the cheap signal.
 */
describe("Executor barrel wiring", () => {
  it("registers an executor for every type in BUILTIN_EXECUTOR_MODULES", () => {
    const unregistered = BUILTIN_EXECUTOR_MODULES.filter(
      (entry) => typeof defaultExecutors[entry.type] !== "function",
    ).map((entry) => `${entry.type} (${entry.modulePath} -> ${entry.exportName})`);

    expect(unregistered, `unregistered executors:\n${unregistered.join("\n")}`).toEqual([]);
  });

  it("lists no duplicate types", () => {
    const types = BUILTIN_EXECUTOR_MODULES.map((e) => e.type);
    expect(types).toHaveLength(new Set(types).size);
  });
});

const PHASE8_TYPES = [
  "n8n-nodes-base.splitOut",
  "n8n-nodes-base.aggregate",
  "n8n-nodes-base.filter",
  "n8n-nodes-base.limit",
  "n8n-nodes-base.removeDuplicates",
  "n8n-nodes-base.itemLists",
  "n8n-nodes-base.dateTime",
  "n8n-nodes-base.splitInBatches",
  "n8n-nodes-base.executeWorkflow",
];

describe("Phase 8 Gate: Node Breadth", () => {
  it("all Phase 8 node types are registered", () => {
    for (const type of PHASE8_TYPES) {
      const def = getNodeType(type);
      expect(def, `Node type ${type} should be registered`).toBeDefined();
    }
  });

  it("all Phase 8 node types have executors", () => {
    for (const type of PHASE8_TYPES) {
      expect(defaultExecutors[type], `Executor for ${type} should exist`).toBeDefined();
    }
  });

  it("runs workflow with Filter and Limit nodes", async () => {
    const workflow = {
      id: "gate8",
      name: "Phase 8 Gate",
      active: false,
      nodes: [
        {
          id: "1",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "Filter",
          type: "n8n-nodes-base.filter",
          typeVersion: 1,
          position: [200, 0],
          parameters: {
            mode: "expression",
            expression: "={{ $json.score > 50 }}",
          },
        },
        {
          id: "3",
          name: "Limit",
          type: "n8n-nodes-base.limit",
          typeVersion: 1,
          position: [400, 0],
          parameters: {
            maxItems: 2,
            keep: "first",
          },
        },
      ],
      connections: {
        "Manual Trigger": { main: [[{ node: "Filter", type: "main", index: 0 }]] },
        Filter: { main: [[{ node: "Limit", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
    };

    // Use pinData to inject items with scores
    const result = await executeWorkflow({
      workflow: workflow as any,
      nodeExecutors: defaultExecutors,
      pinData: {
        "Manual Trigger": [
          { json: { score: 80, name: "Alice" } },
          { json: { score: 30, name: "Bob" } },
          { json: { score: 90, name: "Charlie" } },
          { json: { score: 60, name: "Dave" } },
          { json: { score: 20, name: "Eve" } },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Filter"].status).toBe("success");
    expect(result.runData["Limit"].status).toBe("success");
  });

  it("runs workflow with Split Out node", async () => {
    const workflow = {
      id: "gate8-split",
      name: "Phase 8 Split Gate",
      active: false,
      nodes: [
        {
          id: "1",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "2",
          name: "Split Out",
          type: "n8n-nodes-base.splitOut",
          typeVersion: 1,
          position: [200, 0],
          parameters: {
            fieldToSplitOut: "items",
          },
        },
      ],
      connections: {
        "Manual Trigger": { main: [[{ node: "Split Out", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
    };

    const result = await executeWorkflow({
      workflow: workflow as any,
      nodeExecutors: defaultExecutors,
      pinData: {
        "Manual Trigger": [
          { json: { items: [{ a: 1 }, { a: 2 }, { a: 3 }] } },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Split Out"].status).toBe("success");
  });
});