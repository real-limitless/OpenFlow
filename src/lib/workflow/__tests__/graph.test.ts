import { describe, it, expect } from "vitest";
import { toFlowNodes, toFlowEdges } from "../graph";
import type { IWorkflow } from "../types";

const twoNodeWorkflow: IWorkflow = {
  id: "wf-test",
  name: "Graph Test",
  active: false,
  nodes: [
    {
      id: "n1",
      name: "HTTP Request",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 1,
      position: [100, 200],
      parameters: {},
    },
    {
      id: "n2",
      name: "Set",
      type: "n8n-nodes-base.set",
      typeVersion: 1,
      position: [400, 200],
      parameters: {},
    },
  ],
  connections: {
    "HTTP Request": {
      main: [[{ node: "Set", type: "main", index: 0 }]],
    },
  },
  settings: { executionOrder: "v1" },
};

describe("graph mapping", () => {
  it("toFlowNodes returns one node per workflow node", () => {
    const nodes = toFlowNodes(twoNodeWorkflow);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].id).toBe("HTTP Request");
    expect(nodes[1].id).toBe("Set");
  });

  it("toFlowNodes maps position correctly", () => {
    const nodes = toFlowNodes(twoNodeWorkflow);
    expect(nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(nodes[1].position).toEqual({ x: 400, y: 200 });
  });

  it("toFlowEdges produces one edge for the connection", () => {
    const edges = toFlowEdges(twoNodeWorkflow);
    expect(edges).toHaveLength(1);
  });

  it("edge source and target match connection", () => {
    const edges = toFlowEdges(twoNodeWorkflow);
    expect(edges[0].source).toBe("HTTP Request");
    expect(edges[0].target).toBe("Set");
  });

  it("edge handles encode channel and index", () => {
    const edges = toFlowEdges(twoNodeWorkflow);
    expect(edges[0].sourceHandle).toBe("main-0");
    expect(edges[0].targetHandle).toBe("main-0");
  });

  it("returns empty edges for a workflow with no connections", () => {
    const noConn: IWorkflow = { ...twoNodeWorkflow, connections: {} };
    expect(toFlowEdges(noConn)).toHaveLength(0);
  });

  it("ignores connections referencing unknown nodes", () => {
    const bad: IWorkflow = {
      ...twoNodeWorkflow,
      connections: {
        "HTTP Request": {
          main: [[{ node: "Nonexistent", type: "main", index: 0 }]],
        },
      },
    };
    expect(toFlowEdges(bad)).toHaveLength(0);
  });
});
