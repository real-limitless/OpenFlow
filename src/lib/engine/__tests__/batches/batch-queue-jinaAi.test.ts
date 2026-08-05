import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.jinaAi";

const JINA_CRED = { apiKey: "sk-test-key" };

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>> = { jinaAiApi: JINA_CRED },
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runNode(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = { jinaAiApi: JINA_CRED },
  continueOnFail = false,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
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

describe("batch-queue jinaAi — n8n-nodes-base.jinaAi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.displayName).toBe("Jina AI");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.jinaAi")).toBe(canonical);
  });

  it("reader-read-basic — returns simplified data array", async () => {
    const fakeData = [
      { content: "Example content", url: "https://example.com/", title: "Example", description: "A test page" },
    ];
    installFetch({
      "https://r.jina.ai/https%3A%2F%2Fexample.com": { code: 200, status: 20000, data: fakeData },
    });
    const out = await runNode({
      resource: "reader",
      operation: "read",
      url: "https://example.com",
      simplify: true,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json).toHaveProperty("data");
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("reader-read-full-response — passthrough full envelope when simplify=false", async () => {
    const fakeResponse = { code: 200, status: 20000, data: [{ content: "Full content" }] };
    installFetch({
      "https://r.jina.ai/https%3A%2F%2Fexample.com": fakeResponse,
    });
    const out = await runNode({
      resource: "reader",
      operation: "read",
      url: "https://example.com",
      simplify: false,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json).toHaveProperty("code");
    expect(json).toHaveProperty("data");
  });

  it("reader-search — returns search results", async () => {
    const fakeData = [
      { url: "https://jina.ai/embeddings", title: "Jina AI Embeddings", content: "..." },
    ];
    installFetch({
      "https://s.jina.ai/?q=Jina%20AI%20embeddings": { code: 200, status: 20000, data: fakeData },
    });
    const out = await runNode({
      resource: "reader",
      operation: "search",
      searchQuery: "Jina AI embeddings",
      siteFilter: "jina.ai",
      simplify: true,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json).toHaveProperty("data");
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("research-deep-research — returns simplified report with content", async () => {
    const fakeResponse = {
      id: "chatcmpl-123",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "# Embedding Models\n\nRecent advances..." },
          annotations: [{ url: "https://arxiv.org/abs/2401.12345" }],
        },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 200, total_tokens: 250 },
    };
    installFetch({
      "https://deepsearch.jina.ai/v1/chat/completions": fakeResponse,
    });
    const out = await runNode({
      resource: "research",
      operation: "deepResearch",
      researchQuery: "What are the latest advances in embedding models?",
      maxReturnedSources: 5,
      simplify: true,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json).toHaveProperty("content");
    expect(String(json.content)).toContain("Embedding");
    expect(json).toHaveProperty("annotations");
    expect(json).toHaveProperty("usage");
  });

  it("error-on-empty-url — throws descriptive error", async () => {
    installFetch({});
    await expect(
      runNode({
        resource: "reader",
        operation: "read",
        url: "",
      }),
    ).rejects.toThrow("Jina AI: URL is required");
  });

  it("error-on-missing-credential — throws credential error", async () => {
    installFetch({});
    await expect(
      runNode(
        { resource: "reader", operation: "read", url: "https://example.com" },
        [{}],
        {},
      ),
    ).rejects.toThrow("Jina AI: jinaAiApi credential is not configured");
  });
});
