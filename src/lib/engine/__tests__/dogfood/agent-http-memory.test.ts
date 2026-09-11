import { describe, it, expect, afterEach } from "vitest";
import { executeWorkflow } from "../../runner";
import { getExecutorMap, seedBuiltinExecutors } from "../../index";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import type { IWorkflow } from "@/lib/workflow/types";
import { setGroqHttpClient } from "../../executors/lm-chat-groq";
import {
  clearMemoryBufferWindowStore,
  getMemoryBufferWindowSessionStore,
} from "../../executors/memory-buffer-window";
import { vi } from "vitest";

seedBuiltinExecutors();
seedBuiltinDescriptions();

afterEach(() => {
  setGroqHttpClient(null);
  clearMemoryBufferWindowStore();
  vi.unstubAllGlobals();
});

function makeCluster(): IWorkflow {
  return {
    id: "wf-agent-http-memory",
    name: "Agent Groq HTTP Memory",
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
        id: "model",
        name: "Groq Chat Model",
        type: "@n8n/n8n-nodes-langchain.lmChatGroq",
        typeVersion: 1,
        position: [240, -160],
        parameters: {
          model: { __rl: true, mode: "list", value: "llama-3.3-70b-versatile" },
          options: { temperature: 0 },
        },
        credentials: { groqApi: { id: "cred-groq", name: "Groq" } },
      },
      {
        id: "http",
        name: "HTTP Request Tool",
        type: "@n8n/n8n-nodes-langchain.toolHttpRequest",
        typeVersion: 1,
        position: [240, 160],
        parameters: {
          method: "GET",
          url: "https://example.com/doc",
          toolName: "http_request",
          description: "Fetch a URL",
        },
      },
      {
        id: "memory",
        name: "Simple Memory",
        type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
        typeVersion: 1,
        position: [240, 300],
        parameters: { sessionId: "harness-session", contextWindowLength: 5 },
      },
      {
        id: "agent",
        name: "AI Agent",
        type: "@n8n/n8n-nodes-langchain.agent",
        typeVersion: 1,
        position: [480, 0],
        parameters: {
          promptType: "define",
          text: "Summarize the doc",
          options: { maxIterations: 5, returnIntermediateSteps: true },
        },
      },
    ],
    connections: {
      Start: { main: [[{ node: "AI Agent", type: "main", index: 0 }]] },
      "Groq Chat Model": {
        ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]],
      },
      "HTTP Request Tool": {
        ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
      },
      "Simple Memory": {
        ai_memory: [[{ node: "AI Agent", type: "ai_memory", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
  };
}

describe("dogfood agent + Groq + HTTP tool + memory", () => {
  it("runs HTTP tool then stores the turn in Simple Memory", async () => {
    let groqCalls = 0;
    setGroqHttpClient(async () => {
      groqCalls++;
      if (groqCalls === 1) {
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
                      id: "call_http",
                      type: "function",
                      function: {
                        name: "http_request",
                        arguments: '{"url":"https://example.com/doc"}',
                      },
                    },
                  ],
                },
              },
            ],
            model: "llama-3.3-70b-versatile",
            usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
          },
        };
      }
      return {
        status: 200,
        headers: {},
        body: {
          choices: [{ message: { content: "The doc says hello." } }],
          model: "llama-3.3-70b-versatile",
          usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 },
        },
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "text/plain" },
        text: async () => "hello from example.com",
        json: async () => ({ ok: true }),
      })),
    );

    const result = await executeWorkflow({
      workflow: makeCluster(),
      nodeExecutors: getExecutorMap(),
      allowUrl: () => true,
      credentialResolver: async (ref) => {
        if (ref.id === "cred-groq" || ref.name === "Groq") return { apiKey: "gsk-test" };
        return null;
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData["Groq Chat Model"]?.status).toBe("success");
    expect(result.runData["HTTP Request Tool"]?.status).toBe("success");
    expect(result.runData["Simple Memory"]?.status).toBe("success");
    expect(result.runData["AI Agent"]?.status).toBe("success");

    const agentJson = result.runData["AI Agent"]?.items?.[0]?.[0]?.json;
    expect(agentJson?.output).toBe("The doc says hello.");
    expect(agentJson?.intermediateSteps).toEqual([
      {
        action: { tool: "http_request", toolInput: { url: "https://example.com/doc" } },
        observation: "hello from example.com",
      },
    ]);
    expect(groqCalls).toBe(2);

    const stored = getMemoryBufferWindowSessionStore().get("harness-session") ?? [];
    expect(stored.length).toBeGreaterThanOrEqual(1);
    expect(stored[0]?.assistant.content).toBe("The doc says hello.");
  });
});
