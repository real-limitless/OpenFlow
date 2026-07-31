import { describe, it, expect } from "vitest";
import { toFlowNodes, toFlowEdges, channelHandleIds, addConnection, handlesFor } from "../graph";
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

  it("channelHandleIds uses per-channel ordinals (not flat array index)", () => {
    expect(
      channelHandleIds(["main", "ai_languageModel", "ai_tool", "ai_memory", "ai_outputParser"]),
    ).toEqual(["main-0", "ai_languageModel-0", "ai_tool-0", "ai_memory-0", "ai_outputParser-0"]);
    expect(channelHandleIds(["main", "main", "ai_tool"])).toEqual([
      "main-0",
      "main-1",
      "ai_tool-0",
    ]);
  });

  it("AI Agent cluster edges use n8n-shaped handle ids matching channelHandleIds", () => {
    const cluster: IWorkflow = {
      id: "wf-agent",
      name: "Agent Cluster",
      active: false,
      nodes: [
        {
          id: "a",
          name: "AI Agent",
          type: "@n8n/n8n-nodes-langchain.agent",
          typeVersion: 1,
          position: [400, 0],
          parameters: {},
        },
        {
          id: "m",
          name: "OpenAI Chat Model",
          type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
          typeVersion: 1,
          position: [100, -100],
          parameters: {},
        },
        {
          id: "t",
          name: "MCP Client Tool",
          type: "@n8n/n8n-nodes-langchain.mcpClientTool",
          typeVersion: 1,
          position: [100, 100],
          parameters: {},
        },
        {
          id: "s",
          name: "Start",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {
        Start: {
          main: [[{ node: "AI Agent", type: "main", index: 0 }]],
        },
        "OpenAI Chat Model": {
          ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]],
        },
        "MCP Client Tool": {
          ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
        },
      },
      settings: { executionOrder: "v1" },
    };

    const agentHandles = channelHandleIds([
      "main",
      "ai_languageModel",
      "ai_tool",
      "ai_memory",
      "ai_outputParser",
    ]);
    const edges = toFlowEdges(cluster);

    const modelEdge = edges.find((e) => e.source === "OpenAI Chat Model");
    expect(modelEdge?.sourceHandle).toBe("ai_languageModel-0");
    expect(modelEdge?.targetHandle).toBe("ai_languageModel-0");
    expect(agentHandles).toContain(modelEdge?.targetHandle);

    const toolEdge = edges.find((e) => e.source === "MCP Client Tool");
    expect(toolEdge?.sourceHandle).toBe("ai_tool-0");
    expect(toolEdge?.targetHandle).toBe("ai_tool-0");
    expect(agentHandles).toContain(toolEdge?.targetHandle);

    const mainEdge = edges.find((e) => e.source === "Start");
    expect(mainEdge?.targetHandle).toBe("main-0");
  });

  it("addConnection stores AI target channel index 0 from handle id", () => {
    const next = addConnection(
      {},
      "OpenAI Chat Model",
      "ai_languageModel-0",
      "AI Agent",
      "ai_languageModel-0",
    );
    const targets = next["OpenAI Chat Model"]?.ai_languageModel?.[0] ?? [];
    expect(targets[0]).toEqual({
      node: "AI Agent",
      type: "ai_languageModel",
      index: 0,
    });
  });

  it("toFlowEdges attaches channel color data for AI wires", () => {
    const wf: IWorkflow = {
      id: "wf",
      name: "t",
      active: false,
      nodes: [
        {
          id: "a",
          name: "AI Agent",
          type: "@n8n/n8n-nodes-langchain.agent",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: "m",
          name: "Model",
          type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {
        Model: {
          ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]],
        },
      },
      settings: { executionOrder: "v1" },
    };
    const edge = toFlowEdges(wf)[0];
    expect(edge.data).toMatchObject({ channel: "ai_languageModel" });
    expect((edge.data as { color?: string }).color).toBeTruthy();
  });

  it("handlesFor expands ai_tool slots from connections", () => {
    const agent = {
      id: "a",
      name: "AI Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 1.9,
      position: [0, 0] as [number, number],
      parameters: {},
    };
    const connections = {
      T1: { ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]] },
      T2: { ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 1 }]] },
    };
    const { inputs } = handlesFor(agent, connections);
    const tools = inputs.filter((c) => c === "ai_tool");
    expect(tools.length).toBe(3); // 2 connected + 1 empty
  });
});
