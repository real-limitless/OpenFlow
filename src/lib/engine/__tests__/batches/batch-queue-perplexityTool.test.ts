import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.perplexityTool";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, _init?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key });
      if (!(key in routes)) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue perplexityTool — n8n-nodes-base.perplexityTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Perplexity AI Tool");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.perplexityTool")).toBe(canonical);
  });

  it("chat — complete returns chat completion shape", async () => {
    const fakeResponse = {
      id: "tool-chat-1",
      object: "chat.completion",
      created: 1710000000,
      model: "sonar",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "The capital of France is Paris." },
          finish_reason: "stop",
        },
      ],
      citations: [],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    installFetch({ "https://api.perplexity.ai/chat/completions": fakeResponse });
    const out = await runNode(
      TYPE,
      {
        resource: "chat",
        operation: "complete",
        model: "sonar",
        messages: { message: [{ role: "user", content: "What is the capital of France?" }] },
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("tool-chat-1");
    expect(out[0][0].json.object).toBe("chat.completion");
    expect(out[0][0].json.choices[0].message.content).toContain("Paris");
    expect(out[0][0].json.citations).toEqual([]);
    expect(out[0][0].json.usage).toHaveProperty("prompt_tokens");
    expect(calls).toHaveLength(1);
  });

  it("search — search returns results", async () => {
    const fakeResponse = {
      id: "tool-search-1",
      results: [
        { title: "AI News", url: "https://example.com/ai", snippet: "Latest AI developments" },
      ],
    };
    installFetch({ "https://api.perplexity.ai/search": fakeResponse });
    const out = await runNode(
      TYPE,
      {
        resource: "search",
        operation: "search",
        query: "latest AI news",
        options: { maxResults: 5, searchRecencyFilter: "week" },
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("tool-search-1");
    expect(out[0][0].json.results).toHaveLength(1);
    expect(out[0][0].json.results[0]).toHaveProperty("title");
    expect(out[0][0].json.results[0]).toHaveProperty("url");
    expect(calls).toHaveLength(1);
  });

  it("embedding — createEmbedding returns data array", async () => {
    const fakeResponse = {
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] }],
      model: "pplx-embed-v1-4b",
      usage: { prompt_tokens: 2, total_tokens: 2 },
    };
    installFetch({ "https://api.perplexity.ai/v1/embeddings": fakeResponse });
    const out = await runNode(
      TYPE,
      {
        resource: "embedding",
        operation: "createEmbedding",
        model: "pplx-embed-v1-4b",
        input: "Hello world",
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.data).toHaveLength(1);
    expect(out[0][0].json.data[0].embedding).toEqual([0.1, 0.2, 0.3]);
    expect((out[0][0].json as Record<string, unknown>).model).toBe("pplx-embed-v1-4b");
    expect(calls).toHaveLength(1);
  });

  it("agent — createResponse returns agent output", async () => {
    const fakeResponse = {
      id: "tool-agent-1",
      model: "sonar-pro",
      output: [
        { type: "message", text: "Paris is the capital of France." },
      ],
      usage: { cost: 0.001 },
    };
    installFetch({ "https://api.perplexity.ai/v1/agent": fakeResponse });
    const out = await runNode(
      TYPE,
      {
        resource: "agent",
        operation: "createResponse",
        input: "What is the capital of France?",
        options: { maxSteps: 1, maxOutputTokens: 200 },
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("tool-agent-1");
    expect(out[0][0].json.model).toBe("sonar-pro");
    expect(out[0][0].json.output).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).usage).toHaveProperty("cost");
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with unknown operation yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "chat", operation: "nope" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("fetch failure without continueOnFail throws for network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network error");
      }),
    );
    await expect(
      runNode(TYPE, { resource: "search", operation: "search", query: "x" }, [{}]),
    ).rejects.toThrow();
  });
});
