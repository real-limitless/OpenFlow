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
    expect(getNodeType(TYPE).displayName).toBe("Jina AI");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.jinaAi")).toBe(canonical);
  });

  it("reader-read-basic — returns content for a URL", async () => {
    const fakeContent = "# Example Domain\n\nThis domain is for use in illustrative examples.";
    installFetch({
      "https://r.jina.ai/https%3A%2F%2Fexample.com": fakeContent,
    });
    const out = await runNode({
      resource: "reader",
      operation: "read",
      url: "https://example.com",
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("content");
    expect(String(out[0][0].json.content)).toContain("Example");
  });

  it("reader-search-json — returns results array", async () => {
    const fakeResults = {
      data: [
        { url: "https://example.com/ai", title: "AI News", content: "Latest AI developments..." },
      ],
    };
    installFetch({
      "https://s.jina.ai": fakeResults,
    });
    const out = await runNode({
      resource: "reader",
      operation: "search",
      query: "latest AI news",
      responseFormat: "json",
      topK: 3,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json;
    expect(json).toHaveProperty("results");
    expect(Array.isArray(json.results)).toBe(true);
    if (Array.isArray(json.results)) {
      expect(json.results.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("reader-read-with-options — expression URL resolved from item", async () => {
    const fakeContent = "# Artificial Intelligence\n\nAI is a broad field.";
    installFetch({
      "https://r.jina.ai/https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FArtificial_intelligence": fakeContent,
    });
    const out = await runNode({
      resource: "reader",
      operation: "read",
      url: "={{ $json.pageUrl }}",
      engine: "browser",
      responseFormat: "json",
      noCache: true,
    }, [{ pageUrl: "https://en.wikipedia.org/wiki/Artificial_intelligence" }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json;
    expect(json).toHaveProperty("content");
    expect(String(json.content)).toContain("AI");
  });

  it("research-deep-research — returns report content", async () => {
    const fakeReport = "# Fusion Energy Report\n\nRecent breakthroughs in fusion...";
    installFetch({
      "https://deepsearch.jina.ai": fakeReport,
    });
    const out = await runNode({
      resource: "research",
      operation: "deepResearch",
      topic: "Latest developments in fusion energy",
      responseFormat: "markdown",
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("content");
    expect(String(out[0][0].json.content)).toContain("Fusion");
  });

  it("error-on-empty-url — throws NodeOperationError", async () => {
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
