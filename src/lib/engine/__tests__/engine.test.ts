import { describe, it, expect } from "vitest";
import { buildAdjacency, resolveStartNodes, topologicalSort } from "../graph";
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
        { id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Set", type: "n8n-nodes-base.set", typeVersion: 1, position: [200, 0], parameters: {} },
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
        { id: "1", name: "Manual Trigger", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} },
        { id: "2", name: "Set", type: "n8n-nodes-base.set", typeVersion: 1, position: [200, 0], parameters: {} },
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
        { id: "1", name: "Set", type: "n8n-nodes-base.set", typeVersion: 1, position: [0, 0], parameters: {} },
      ],
    });

    const starts = resolveStartNodes(workflow);
    expect(starts).toEqual(["Set"]);
  });

  it("skips disabled trigger nodes", () => {
    const workflow = makeWorkflow({
      nodes: [
        { id: "1", name: "Trigger", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {}, disabled: true },
        { id: "2", name: "Set", type: "n8n-nodes-base.set", typeVersion: 1, position: [200, 0], parameters: {} },
      ],
    });

    const starts = resolveStartNodes(workflow);
    expect(starts).toEqual(["Trigger"]);
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
});
