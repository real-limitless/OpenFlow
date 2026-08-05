import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { seedBuiltinExecutors } from "../../index";
import { makeNode } from "../helpers";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { createExecutionContext, type ExecutionContext } from "@/sdk";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.convertKit";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map([["content-type", "application/json"]]),
    async text() { return text; },
    async json() { return JSON.parse(text); },
  };
}

interface FetchCall { url: string; method: string; body: string | undefined }

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response = mockResponse({ tags: [{ id: 1, name: "test" }] })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return nextResponse;
  }));
}

const CREDS = { convertKitApi: { apiKey: "ck_test_123" } };

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials = CREDS,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue convertKit — n8n-nodes-base.convertKit", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ConvertKit");
  });

  it("sends api_secret as URL query param for GET requests", async () => {
    installFetch(mockResponse({ tags: [{ id: 1, name: "newsletter" }] }));
    await run({ resource: "tag", operation: "getAll" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api_secret=ck_test_123");
    expect(calls[0].method).toBe("GET");
  });

  it("sends api_secret as URL query param for POST requests", async () => {
    installFetch(mockResponse({ tag: { id: 99, name: "newsletter-2024" } }));
    await run({ resource: "tag", operation: "create", name: "newsletter-2024" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api_secret=ck_test_123");
    expect(calls[0].method).toBe("POST");
  });

  it("creates a tag via POST", async () => {
    installFetch(mockResponse({ tag: { id: 99, name: "newsletter-2024" } }));
    const out = await run({ resource: "tag", operation: "create", name: "newsletter-2024" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/tags");
    expect(out[0][0].json).toMatchObject({ tag: { id: 99, name: "newsletter-2024" } });
  });

  it("lists tags via GET and returns tags array", async () => {
    installFetch(mockResponse({ tags: [{ id: 1, name: "a" }, { id: 2, name: "b" }] }));
    const out = await run({ resource: "tag", operation: "getAll" });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/tags");
    expect(out[0][0].json.tags).toHaveLength(2);
  });

  it("subscribes to form via POST", async () => {
    installFetch(mockResponse({ subscriber: { id: 42, email: "test@example.com" } }));
    const out = await run({
      resource: "form",
      operation: "addSubscriber",
      formId: "12345",
      email: "test@example.com",
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/forms/12345/subscribe");
    expect(out[0][0].json.subscriber.email).toBe("test@example.com");
  });

  it("removes tag from subscriber via DELETE", async () => {
    installFetch(mockResponse({}, 204));
    const out = await run({
      resource: "tagSubscriber",
      operation: "remove",
      email: "test@example.com",
      tagId: "1",
    });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/tags/1/unsubscribe");
    expect(out[0][0].json.success).toBe(true);
  });

  it("throws when credential is missing", async () => {
    await expect(
      run({ resource: "tag", operation: "getAll" }, [{}], { credentials: {} }),
    ).rejects.toThrow(/API Secret is required/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ error: "Not Found" }, 404));
    const out = await run(
      { resource: "tag", operation: "getAll" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("makes one request per input item", async () => {
    installFetch(mockResponse({ tags: [{ id: 1 }] }));
    await run(
      { resource: "tag", operation: "getAll" },
      [{ id: "a" }, { id: "b" }],
    );
    expect(calls).toHaveLength(2);
  });
});
