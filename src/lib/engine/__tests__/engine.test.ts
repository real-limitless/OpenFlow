import { describe, it, expect } from "vitest";
import {
  buildAdjacency,
  isTriggerNode,
  resolveStartNodes,
  setTriggerDescriptionLookup,
  topologicalSort,
} from "../graph";
import { createExecutionPlan } from "../runner";
import type { IWorkflow } from "../../workflow/types";

function makeWorkflow(overrides: Partial<IWorkflow> = {}): IWorkflow {
  return {
    id: "wf-test",
    name: "test",
    active: false,
    nodes: [],
    connections: {},
    settings: { executionOrder: "v1" },
    ...overrides,
  };
}

describe("Engine Graph", () => {
  it("builds adjacency from connections", () => {
    const workflow = makeWorkflow({
      nodes: [
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
          type: "n8n-nodes-base.set",
          typeVersion: 1,
          position: [200, 0],
          parameters: {},
        },
      ],
      connections: {
        Start: { main: [[{ node: "Set", type: "main", index: 0 }]] },
      },
    });

    const adj = buildAdjacency(workflow.connections);
    expect(adj.get("Start")).toEqual(["Set"]);
    expect(adj.has("Set")).toBe(false);
  });

  it("handles empty connections", () => {
    const adj = buildAdjacency({});
    expect(adj.size).toBe(0);
  });

  it("deduplicates targets", () => {
    const connections = {
      A: {
        main: [
          [
            { node: "B", type: "main", index: 0 },
            { node: "B", type: "main", index: 0 },
          ],
        ],
      },
    };
    const adj = buildAdjacency(connections);
    expect(adj.get("A")).toEqual(["B"]);
  });

  it("resolves trigger nodes as start nodes", () => {
    const workflow = makeWorkflow({
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
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 1,
          position: [200, 0],
          parameters: {},
        },
      ],
      connections: {
        "Manual Trigger": { main: [[{ node: "Set", type: "main", index: 0 }]] },
      },
    });

    const starts = resolveStartNodes(workflow);
    expect(starts).toEqual(["Manual Trigger"]);
  });

  it("falls back to first node when no triggers", () => {
    const workflow = makeWorkflow({
      nodes: [
        {
          id: "1",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
      ],
    });

    const starts = resolveStartNodes(workflow);
    expect(starts).toEqual(["Set"]);
  });

  it("skips disabled trigger nodes", () => {
    const workflow = makeWorkflow({
      nodes: [
        {
          id: "1",
          name: "Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
          disabled: true,
        },
        {
          id: "2",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 1,
          position: [200, 0],
          parameters: {},
        },
      ],
    });

    // The disabled trigger is skipped, so this falls back to the first
    // *enabled* node. It used to return "Trigger" because the fallback picked
    // nodes[0] without checking `disabled` — starting a run on a disabled node.
    const starts = resolveStartNodes(workflow);
    expect(starts).toEqual(["Set"]);
  });

  it("keeps AI sub-nodes in the run set when filtering by reachability", () => {
    // Sub-nodes point *into* their parent over a non-main channel, so walking
    // forward from the trigger never reaches them. Filtering the plan to the
    // reachable set used to drop them, and the agent then failed with
    // "A Chat Model sub-node must be connected".
    const workflow = makeWorkflow({
      nodes: [
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
          name: "Agent",
          type: "@n8n/n8n-nodes-langchain.agent",
          typeVersion: 1,
          position: [200, 0],
          parameters: {},
        },
        {
          id: "3",
          name: "Model",
          type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
          typeVersion: 1,
          position: [200, -100],
          parameters: {},
        },
        {
          id: "4",
          name: "Orphan",
          type: "n8n-nodes-base.set",
          typeVersion: 1,
          position: [400, 200],
          parameters: {},
        },
      ],
      connections: {
        Start: { main: [[{ node: "Agent", type: "main", index: 0 }]] },
        Model: { ai_languageModel: [[{ node: "Agent", type: "ai_languageModel", index: 0 }]] },
      },
    });

    const plan = createExecutionPlan(workflow, "Start");
    expect(plan.runOrder).toContain("Model");
    expect(plan.runOrder.indexOf("Model")).toBeLessThan(plan.runOrder.indexOf("Agent"));
    // Unrelated nodes are still excluded — this is not a "run everything" escape hatch.
    expect(plan.runOrder).not.toContain("Orphan");
  });

  it("topological sort orders nodes correctly", () => {
    const adj = new Map([
      ["A", ["B", "C"]],
      ["B", ["D"]],
      ["C", ["D"]],
      ["D", []],
    ]);

    const order = topologicalSort(adj);
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("D"));
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
  });

  it("topological sort handles single node", () => {
    const adj = new Map([["A", []]]);
    const order = topologicalSort(adj);
    expect(order).toEqual(["A"]);
  });

  it("topological sort handles empty graph", () => {
    const order = topologicalSort(new Map());
    expect(order).toEqual([]);
  });

  it("detects known trigger types without a description registry", () => {
    const base = {
      id: "1",
      name: "N",
      typeVersion: 1,
      position: [0, 0] as [number, number],
      parameters: {},
    };
    expect(isTriggerNode({ ...base, type: "n8n-nodes-base.manualTrigger" })).toBe(true);
    expect(isTriggerNode({ ...base, type: "nodes-base.webhook" })).toBe(true);
    expect(isTriggerNode({ ...base, type: "n8n-nodes-base.set" })).toBe(false);
  });

  it("uses an optional description lookup for unknown trigger types", () => {
    const base = {
      id: "1",
      name: "N",
      typeVersion: 1,
      position: [0, 0] as [number, number],
      parameters: {},
    };
    setTriggerDescriptionLookup((type) =>
      type === "custom.trigger" ? { group: ["trigger"] } : null,
    );
    try {
      expect(isTriggerNode({ ...base, type: "custom.trigger" })).toBe(true);
      expect(isTriggerNode({ ...base, type: "custom.other" })).toBe(false);
    } finally {
      setTriggerDescriptionLookup(undefined);
    }
  });
});
