import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pipedriveTool";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 403 ? "Forbidden" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
    async arrayBuffer() { return Buffer.from(text); },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
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
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
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
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? { pipedriveApi: { apiToken: "test-token" } };
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("pipedriveTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as an executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has a description registered", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc.name).toBe(TYPE);
  });

  describe("agent creates a deal via tool", () => {
    it("posts to /deals and returns unwrapped data", async () => {
      const body = { data: { id: 42, title: "Enterprise License", value: 5000, currency: "USD" } };
      installFetch(mockResponse(body));
      const [out] = await run({
        resource: "Deal",
        operation: "create",
        requestFields: JSON.stringify({ title: "Enterprise License", value: 5000, currency: "USD" }),
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/deals");
      expect(out[0].json.id).toBe(42);
      expect(out[0].json.title).toBe("Enterprise License");
    });
  });

  describe("agent searches persons", () => {
    it("queries /persons/search and returns results", async () => {
      const body = { data: [{ id: 7, name: "Acme Corp" }], pagination: {} };
      installFetch(mockResponse({ data: body.data, pagination: body.pagination }));
      const [out] = await run({
        resource: "Person",
        operation: "search",
        searchTerm: "Acme Corp",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/persons/search?term=Acme+Corp");
      expect(Array.isArray(out[0].json.data)).toBe(true);
    });
  });

  describe("agent reads a deal by ID", () => {
    it("gets /deals/:id and returns the deal", async () => {
      const body = { data: { id: 123, title: "Test Deal" } };
      installFetch(mockResponse(body));
      const [out] = await run({
        resource: "Deal",
        operation: "get",
        resourceIdentifier: 123,
      });
      expect(calls[0].url).toContain("/deals/123");
      expect(out[0].json.id).toBe(123);
    });
  });

  describe("agent lists deals with pagination", () => {
    it("queries /deals with limit param", async () => {
      const body = { data: Array.from({ length: 3 }, (_, i) => ({ id: i + 1, title: `Deal ${i + 1}` })), pagination: {} };
      installFetch(mockResponse(body));
      const [out] = await run({
        resource: "Deal",
        operation: "getAll",
        query: JSON.stringify({ limit: 10 }),
      });
      expect(calls[0].url).toContain("/deals?limit=10");
      expect(Array.isArray(out[0].json.data)).toBe(true);
    });
  });

  describe("agent handles credential failure", () => {
    it("throws when no credential is configured", async () => {
      await expect(run(
        { resource: "Deal", operation: "get", resourceIdentifier: 1 },
        [{}],
        { credentials: {} },
      )).rejects.toThrow(/Pipedrive/);
    });
  });

  describe("continueOnFail", () => {
    it("returns error item when continueOnFail is enabled with missing credentials", async () => {
      const [out] = await run(
        { resource: "Deal", operation: "get", resourceIdentifier: 1 },
        [{}],
        { continueOnFail: true, credentials: {} },
      );
      expect(out[0].json.error).toBeDefined();
    });
  });
});