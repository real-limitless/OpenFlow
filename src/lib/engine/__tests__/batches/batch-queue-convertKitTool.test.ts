import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.convertKitTool";

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
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
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
    }),
  );
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
  const creds = opts?.credentials ?? CREDS;
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

const CREDS = { convertKitApi: { apiKey: "test_api_secret" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue convertKitTool — n8n-nodes-base.convertKitTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc.displayName).toBe("ConvertKit (AI Tool)");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.convertKitTool")).toBe(canonical);
  });

  it("tag.create — creates a tag via tool", async () => {
    installFetch(mockResponse({ tag: { id: 123, name: "test-tag" } }));

    const out = await run({
      resource: "tag",
      operation: "create",
      name: "test-tag",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/tags");
    expect(calls[0].url).toContain("api_secret=test_api_secret");

    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("test-tag");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.tag).toEqual({ id: 123, name: "test-tag" });
  });

  it("tag.create — with $fromAI expression", async () => {
    installFetch(mockResponse({ tag: { id: 456, name: "ai-tag" } }));

    const out = await run({
      resource: "tag",
      operation: "create",
      name: "={{ $fromAI() }}",
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("={{ $fromAI() }}");

    expect(out[0][0].json.tag.name).toBe("ai-tag");
  });

  it("tag.getAll — gets all tags", async () => {
    installFetch(mockResponse({ tags: [{ id: 1, name: "Tag A" }, { id: 2, name: "Tag B" }] }));

    const out = await run({
      resource: "tag",
      operation: "getAll",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/tags");

    expect(out[0][0].json.tags).toHaveLength(2);
    expect(out[0][0].json.tags[0].name).toBe("Tag A");
  });

  it("form.addSubscriber — subscribes to a form", async () => {
    installFetch(mockResponse({ subscriber: { id: 789, email: "test@example.com" } }));

    const out = await run({
      resource: "form",
      operation: "addSubscriber",
      formId: "12345",
      email: "test@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/forms/12345/subscribe");

    const body = JSON.parse(calls[0].body!);
    expect(body.email).toBe("test@example.com");

    expect(out[0][0].json.subscriber.email).toBe("test@example.com");
  });

  it("tagSubscriber.add — tags a subscriber", async () => {
    installFetch(mockResponse({ subscriber: { id: 111, email: "user@test.com" } }));

    const out = await run({
      resource: "tagSubscriber",
      operation: "add",
      tagId: "42",
      email: "user@test.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/tags/42/subscribe");

    const body = JSON.parse(calls[0].body!);
    expect(body.email).toBe("user@test.com");

    expect(out[0][0].json.subscriber.email).toBe("user@test.com");
  });

  it("non-AI expression-based usage (backward compatible)", async () => {
    installFetch(mockResponse({ tag: { id: 999, name: "test-tag" } }));

    const out = await run(
      {
        resource: "tag",
        operation: "create",
        name: "={{ $json.tagName }}",
      },
      [{ json: { tagName: "test-tag" } }],
    );

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("test-tag");

    expect(out[0][0].json.tag.name).toBe("test-tag");
  });

  it("fails when credential is missing", async () => {
    await expect(
      run(
        { resource: "tag", operation: "getAll" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/API Secret is required/);
  });

  it("continueOnFail yields error item", async () => {
    installFetch(mockResponse({ error: "Not found" }, { status: 404 }));
    const out = await run(
      { resource: "tag", operation: "create", name: "x" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });

  it("customField.create — creates a custom field", async () => {
    installFetch(mockResponse({ custom_field: { id: 1, label: "Company", key: "company" } }));

    const out = await run({
      resource: "customField",
      operation: "create",
      label: "Company",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/custom_fields");

    const body = JSON.parse(calls[0].body!);
    expect(body.label).toBe("Company");

    expect(out[0][0].json.customField.label).toBe("Company");
  });

  it("customField.getAll — gets all custom fields", async () => {
    installFetch(mockResponse({ custom_fields: [{ id: 1, label: "Company" }] }));

    const out = await run({
      resource: "customField",
      operation: "getAll",
    });

    expect(calls).toHaveLength(1);
    expect(out[0][0].json.customFields).toHaveLength(1);
  });

  it("sequence.addSubscriber — subscribes to a sequence", async () => {
    installFetch(mockResponse({ subscriber: { id: 222, email: "seq@test.com" } }));

    const out = await run({
      resource: "sequence",
      operation: "addSubscriber",
      sequenceId: "seq1",
      email: "seq@test.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/sequences/seq1/subscribe");
    expect(out[0][0].json.subscriber.email).toBe("seq@test.com");
  });
});
