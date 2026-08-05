import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.elasticSecurityTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 204 ? "No Content" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return name.toLowerCase() === "content-type" ? "application/json" : null; },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(responses: ReturnType<typeof mockResponse> | ReturnType<typeof mockResponse>[]) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return responseQueue.shift() ?? mockResponse({});
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

function jsonBody(call: FetchCall): unknown {
  if (!call.body) return undefined;
  try { return JSON.parse(call.body); } catch { return call.body; }
}

const elasticCred = { baseUrl: "http://elastic.local:5601", apiKey: "test-api-key" };

beforeEach(() => {
  installFetch(mockResponse({}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Elastic Security Tool", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
    expect(desc?.displayName).toBe("Elastic Security");
  });

  it("create case sends POST with correct body", async () => {
    installFetch(mockResponse({ id: "case-1", title: "Test case", description: "desc", status: "open", totalCommentCount: 0, totalAlerts: 0 }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "case",
        operation: "create",
        title: "Test case from n8n",
        description: "Automated test case",
        connector: JSON.stringify({ id: "none", name: "none", type: ".none", fields: null }),
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => elasticCred,
    });

    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).id).toBe("case-1");

    const call = lastCall();
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/api/cases");
    const body = jsonBody(call) as Record<string, unknown>;
    expect(body.title).toBe("Test case from n8n");
    expect(body.description).toBe("Automated test case");
  });

  it("get all cases sends GET with pagination and filters", async () => {
    installFetch(mockResponse({ page: 1, perPage: 10, total: 2, cases: [{ id: "c1" }, { id: "c2" }] }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "case",
        operation: "getAll",
        page: 1,
        perPage: 10,
        filters: { status: "open", severity: "high", tags: "critical" },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => elasticCred,
    });

    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(2);

    const call = lastCall();
    expect(call.method).toBe("GET");
    expect(call.url).toContain("page=1");
    expect(call.url).toContain("perPage=10");
    expect(call.url).toContain("status=open");
    expect(call.url).toContain("severity=high");
    expect(call.url).toContain("tags=critical");
  });

  it("add tag sends POST to case tags endpoint", async () => {
    installFetch(mockResponse({ tags: ["critical"] }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "caseTag",
        operation: "add",
        caseId: "case-123",
        tag: "critical",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { caseId: "case-123" } }],
      continueOnFail: false,
      getCredential: async () => elasticCred,
    });

    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(1);

    const call = lastCall();
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/api/cases/case-123/tags");
    const body = jsonBody(call) as Record<string, unknown>;
    expect(body.tag).toBe("critical");
  });

  it("remove tag sends DELETE to case tags endpoint", async () => {
    installFetch(mockResponse({ tags: [] }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "caseTag",
        operation: "remove",
        caseId: "case-123",
        tag: "critical",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { caseId: "case-123" } }],
      continueOnFail: false,
      getCredential: async () => elasticCred,
    });

    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(1);

    const call = lastCall();
    expect(call.method).toBe("DELETE");
    expect(call.url).toContain("/api/cases/case-123/tags");
  });

  it("delete case sends DELETE", async () => {
    installFetch(mockResponse({ success: true }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "case",
        operation: "delete",
        caseId: "case-to-delete",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => elasticCred,
    });

    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(1);

    const call = lastCall();
    expect(call.method).toBe("DELETE");
    expect(call.url).toContain("/api/cases/case-to-delete");
  });

  it("uses apiKey credential for auth header", async () => {
    installFetch(mockResponse({ id: "c1" }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "case",
        operation: "create",
        title: "Test",
        connector: JSON.stringify({ id: "none", name: "none", type: ".none", fields: null }),
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => elasticCred,
    });

    await executor(ctx, node);
    const call = lastCall();
    expect(call.headers["Authorization"]).toContain("ApiKey");
  });
});
