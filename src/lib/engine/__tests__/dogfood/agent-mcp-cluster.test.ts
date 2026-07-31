import { describe, it, expect, afterEach } from "vitest";
import { executeWorkflow } from "../../runner";
import { getExecutorMap, seedBuiltinExecutors } from "../../index";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import type { IWorkflow } from "@/lib/workflow/types";
import { setOpenAiHttpClient } from "../../executors/lm-chat-openai";
import { setMcpHttpClient } from "../../executors/mcp-client-tool";
import { buildIncoming } from "../../graph";

seedBuiltinExecutors();
seedBuiltinDescriptions();

afterEach(() => {
  setOpenAiHttpClient(null);
  setMcpHttpClient(null);
});

function makeClusterWorkflow(): IWorkflow {
  return {
    id: "wf-agent-mcp",
    name: "Agent MCP Cluster",
    active: false,
    nodes: [
      {
        id: "start",
        name: "Start",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
      {
        id: "set",
        name: "Set Prompt",
        type: "n8n-nodes-base.set",
        typeVersion: 3,
        position: [200, 0],
        parameters: {
          mode: "manual",
          duplicateItem: false,
          assignments: {
            assignments: [
              {
                id: "1",
                name: "chatInput",
                value: "What is the price of AAPL?",
                type: "string",
              },
            ],
          },
          options: {},
        },
      },
      {
        id: "model",
        name: "OpenAI Chat Model",
        type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
        typeVersion: 1.3,
        position: [400, -120],
        parameters: {
          model: { __rl: true, mode: "list", value: "gpt-4.1-mini" },
          options: { temperature: 0 },
        },
        credentials: {
          openAiApi: { id: "cred-openai", name: "OpenAI" },
        },
      },
      {
        id: "mcp",
        name: "MCP Finance",
        type: "@n8n/n8n-nodes-langchain.mcpClientTool",
        typeVersion: 1.3,
        position: [400, 120],
        parameters: {
          endpointUrl: "https://mcp.example.com",
          authentication: "none",
          options: {},
        },
      },
      {
        id: "agent",
        name: "AI Agent",
        type: "@n8n/n8n-nodes-langchain.agent",
        typeVersion: 3.1,
        position: [600, 0],
        parameters: {
          promptType: "auto",
          options: {
            systemMessage: "Use tools for market data.",
            maxIterations: 5,
            returnIntermediateSteps: true,
          },
        },
      },
    ],
    connections: {
      Start: {
        main: [[{ node: "Set Prompt", type: "main", index: 0 }]],
      },
      "Set Prompt": {
        main: [[{ node: "AI Agent", type: "main", index: 0 }]],
      },
      "OpenAI Chat Model": {
        ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]],
      },
      "MCP Finance": {
        ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
  };
}

describe("dogfood agent + MCP + OpenAI cluster", () => {
  it("buildIncoming marks AI edges with non-main channel", () => {
    const incoming = buildIncoming(makeClusterWorkflow().connections);
    const agentEdges = incoming.get("AI Agent") ?? [];
    expect(agentEdges.some((e) => e.channel === "main" && e.source === "Set Prompt")).toBe(true);
    expect(
      agentEdges.some((e) => e.channel === "ai_languageModel" && e.source === "OpenAI Chat Model"),
    ).toBe(true);
    expect(agentEdges.some((e) => e.channel === "ai_tool" && e.source === "MCP Finance")).toBe(
      true,
    );
  });

  it("runs tool loop: OpenAI tool_calls → MCP tools/call → final answer", async () => {
    let openaiCalls = 0;
    const mcpMethods: string[] = [];

    setOpenAiHttpClient(async (opts) => {
      openaiCalls++;
      const body = opts.body as {
        tools?: unknown[];
        messages?: Array<{ role: string; content?: string | null }>;
      };
      if (openaiCalls === 1) {
        expect(Array.isArray(body.tools) && body.tools.length > 0).toBe(true);
        return {
          status: 200,
          headers: {},
          body: {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "call_quote",
                      type: "function",
                      function: {
                        name: "get_quote",
                        arguments: '{"symbol":"AAPL"}',
                      },
                    },
                  ],
                },
              },
            ],
            model: "gpt-4.1-mini",
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          },
        };
      }
      const hasToolMsg = body.messages?.some((m) => m.role === "tool");
      expect(hasToolMsg).toBe(true);
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "AAPL trades near 200 based on tool data." } }],
          model: "gpt-4.1-mini",
          usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
        },
      };
    });

    setMcpHttpClient(async (opts) => {
      const req = opts.body as { method?: string; id?: number; params?: Record<string, unknown> };
      mcpMethods.push(req.method ?? "");
      if (req.method === "tools/list") {
        return {
          status: 200,
          headers: {},
          body: {
            jsonrpc: "2.0",
            id: req.id,
            result: {
              tools: [
                {
                  name: "get_quote",
                  description: "Get a stock quote",
                  inputSchema: {
                    type: "object",
                    properties: { symbol: { type: "string" } },
                  },
                },
              ],
            },
          },
        };
      }
      if (req.method === "tools/call") {
        expect(req.params).toMatchObject({
          name: "get_quote",
          arguments: { symbol: "AAPL" },
        });
        return {
          status: 200,
          headers: {},
          body: {
            jsonrpc: "2.0",
            id: req.id,
            result: {
              content: [{ type: "text", text: "AAPL last=200.12" }],
            },
          },
        };
      }
      return {
        status: 200,
        headers: {},
        body: { jsonrpc: "2.0", id: req.id, result: {} },
      };
    });

    const workflow = makeClusterWorkflow();
    const result = await executeWorkflow({
      workflow,
      nodeExecutors: getExecutorMap(),
      credentialResolver: async (ref) => {
        if (ref.id === "cred-openai" || ref.name === "OpenAI") {
          return { apiKey: "sk-test" };
        }
        return null;
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["OpenAI Chat Model"]?.status).toBe("success");
    expect(result.runData["MCP Finance"]?.status).toBe("success");
    expect(result.runData["AI Agent"]?.status).toBe("success");

    const agentItems = result.runData["AI Agent"]?.items?.[0] ?? [];
    expect(agentItems[0]?.json.output).toBe("AAPL trades near 200 based on tool data.");
    expect(agentItems[0]?.json.intermediateSteps).toEqual([
      {
        action: { tool: "get_quote", toolInput: { symbol: "AAPL" } },
        observation: "AAPL last=200.12",
      },
    ]);

    expect(mcpMethods).toContain("tools/list");
    expect(mcpMethods).toContain("tools/call");
    expect(openaiCalls).toBe(2);

    // AI sub-node outputs must not pollute agent main input (channel-aware lookup)
    const setOut = result.runData["Set Prompt"]?.items?.[0]?.[0]?.json;
    expect(setOut).toMatchObject({ chatInput: "What is the price of AAPL?" });
  });
});
