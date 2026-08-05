import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dropcontact";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      forEach() {},
      get() { return "application/json"; },
      entries() { return new Map(); },
    },
    async text() { return text; },
    async json() { return JSON.parse(text); },
  };
}

interface FetchCall { url: string; method: string; body?: string }

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response = mockResponse({ data: [] })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
    return nextResponse;
  }));
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

const CREDS = { dropcontactApi: { apiKey: "test-api-key" } };

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => toItems(inputItems),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => creds[name] ?? null,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function parseRequestBody(callIdx: number): Record<string, unknown> {
  const body = calls[callIdx]?.body;
  return body ? JSON.parse(body) : {};
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue dropcontact — n8n-nodes-base.dropcontact", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).toBeDefined();
  });

  it("enrich without polling — returns request metadata", async () => {
    installFetch(mockResponse({
      request_id: "req_123",
      success: true,
      credits_left: 42,
    }));
    const out = await run({
      operation: "enrich",
      additionalFields: { email: "test@example.com" },
      options: {},
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/enrich/all");
    const body = parseRequestBody(0);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect((body.data as Record<string, unknown>[])[0].email).toBe("test@example.com");
    const j = out[0][0].json as Record<string, unknown>;
    expect(j.request_id).toBe("req_123");
    expect(j.success).toBe(true);
    expect(j.credits_left).toBe(42);
  });

  it("enrich with polling — waits then GETs results as data array", async () => {
    let callIdx = 0;
    const responses = [
      mockResponse({ request_id: "req_456", success: true, credits_left: 40 }),
      mockResponse({
        data: [
          { first_name: "Peter", last_name: "Jackson", email: [{ email: "peter@company.com", qualification: "nominative@pro" }], company: "Company Inc" },
        ],
      }),
    ];
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const resp = responses[callIdx];
      callIdx++;
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
      return resp;
    }));

    const out = await run({
      operation: "enrich",
      additionalFields: { email: "peter.jackson@company.com", first_name: "Peter" },
      options: { waitTime: 10, siren: false, language: "en" },
    });
    expect(callIdx).toBe(2);
    expect(calls[0].method).toBe("POST");
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toContain("req_456");
    const body = parseRequestBody(0);
    expect((body.data as Record<string, unknown>[])[0].first_name).toBe("Peter");
    expect((body.data as Record<string, unknown>[])[0].email).toBe("peter.jackson@company.com");
    expect(out[0]).toHaveLength(1);
    const j = out[0][0].json as Record<string, unknown>;
    expect(j.first_name).toBe("Peter");
    expect(j.email).toBeDefined();
  });

  it("enrich with polling + simplify flattens response", async () => {
    let callIdx = 0;
    const responses = [
      mockResponse({ request_id: "req_789", success: true, credits_left: 39 }),
      mockResponse({
        data: [
          { first_name: "Jane", last_name: "Doe", email: [{ email: "jane@co.com", qualification: "nominative@pro" }] },
        ],
      }),
    ];
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const resp = responses[callIdx];
      callIdx++;
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
      return resp;
    }));

    const out = await run({
      operation: "enrich",
      additionalFields: { email: "jane@co.com" },
      simplify: true,
      options: { waitTime: 10 },
    });
    expect(callIdx).toBe(2);
    expect(out[0]).toHaveLength(1);
    const j = out[0][0].json as Record<string, unknown>;
    expect(j.first_name).toBe("Jane");
    expect(Array.isArray(j.email)).toBe(true);
  });

  it("fetchRequest — GETs results by requestId, emits one item per data entry", async () => {
    installFetch(mockResponse({
      data: [
        { first_name: "John", last_name: "Smith", email: [] },
        { first_name: "Jane", last_name: "Doe", email: [] },
      ],
    }));
    const out = await run({
      operation: "fetchRequest",
      requestId: "abc123",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/enrich/all/abc123");
    expect(out[0]).toHaveLength(2);
    expect((out[0][0].json as Record<string, unknown>).first_name).toBe("John");
    expect((out[0][1].json as Record<string, unknown>).first_name).toBe("Jane");
  });

  it("multi-item enrich — single POST with data.length===2, one output per contact", async () => {
    let callIdx = 0;
    const responses = [
      mockResponse({ request_id: "req_multi", success: true, credits_left: 38 }),
      mockResponse({
        data: [
          { first_name: "Alice", email: [{ email: "alice@co.com", qualification: "nominative@pro" }] },
          { first_name: "Bob", email: [{ email: "bob@co.com", qualification: "nominative@pro" }] },
        ],
      }),
    ];
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const resp = responses[callIdx];
      callIdx++;
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
      return resp;
    }));

    const out = await run(
      { operation: "enrich", additionalFields: { company: "Acme" }, options: { waitTime: 10 } },
      [{ json: { email: "alice@co.com" } }, { json: { email: "bob@co.com" } }],
    );
    expect(callIdx).toBe(2);
    expect(calls[0].method).toBe("POST");
    const body = parseRequestBody(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
    expect((body.data as Record<string, unknown>[])[0]).toMatchObject({ company: "Acme" });
    expect((body.data as Record<string, unknown>[])[1]).toMatchObject({ company: "Acme" });
    expect(out[0]).toHaveLength(2);
    expect((out[0][0].json as Record<string, unknown>).first_name).toBe("Alice");
    expect((out[0][1].json as Record<string, unknown>).first_name).toBe("Bob");
  });

  it("fetchRequest throws when requestId is empty", async () => {
    await expect(
      run({ operation: "fetchRequest", requestId: "" }),
    ).rejects.toThrow("requestId is required");
  });

  it("throws when credentials are missing", async () => {
    await expect(
      run({ operation: "enrich", additionalFields: { email: "test@example.com" } }, [{}], { credentials: {} }),
    ).rejects.toThrow("dropcontactApi credential is not configured");
  });

  it("continueOnFail returns error item on API failure", async () => {
    installFetch(mockResponse({ message: "Unauthorized" }, 403));
    const out = await run(
      { operation: "enrich", additionalFields: { email: "test@example.com" }, options: {} },
      [{ json: { email: "test@example.com" } }],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });
});
