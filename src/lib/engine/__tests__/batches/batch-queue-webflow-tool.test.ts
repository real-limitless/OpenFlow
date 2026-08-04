import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.webflowTool";

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
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(
  response: ReturnType<typeof mockResponse> = mockResponse({ id: "item_1" }),
) {
  nextResponse = response;
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
      return nextResponse;
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
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { webflowApi: { accessToken: "tok_123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue webflow-tool — n8n-nodes-base.webflowTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Webflow (AI Tool)");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.webflowTool")).toBe(canonical);
  });

  it("creates an item via POST with fieldData body", async () => {
    installFetch(mockResponse({ id: "item_new", fieldData: { name: "Test Item" } }));
    const out = await run({
      resource: "item",
      operation: "create",
      siteId: "site_abc",
      collectionId: "col_xyz",
      live: false,
      fieldsUi: {
        fieldValues: [{ fieldId: "name", fieldValue: "Test Item" }],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/col_xyz/items");
    expect(JSON.parse(calls[0].body!)).toEqual({
      fieldData: { name: "Test Item" },
    });
    expect(out[0][0].json).toMatchObject({ id: "item_new" });
  });

  it("gets a single item via GET", async () => {
    installFetch(mockResponse({ id: "item_123", fieldData: { name: "X" } }));
    const out = await run({
      resource: "item",
      operation: "get",
      siteId: "site_abc",
      collectionId: "col_xyz",
      itemId: "item_123",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/col_xyz/items/item_123");
    expect(out[0][0].json).toMatchObject({ id: "item_123" });
  });

  it("deletes an item and returns success:true on HTTP 204", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      resource: "item",
      operation: "delete",
      siteId: "site_abc",
      collectionId: "col_xyz",
      itemId: "item_123",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/col_xyz/items/item_123");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("returns success:false on non-204 delete", async () => {
    installFetch(mockResponse({ message: "not found" }, { status: 404 }));
    const out = await run({
      resource: "item",
      operation: "delete",
      siteId: "site_abc",
      collectionId: "col_xyz",
      itemId: "item_123",
    });
    expect(out[0][0].json).toEqual({ success: false });
  });

  it("gets many items with limit", async () => {
    installFetch(
      mockResponse({
        items: [{ id: "a" }, { id: "b" }],
        pagination: { limit: 10, offset: 0, total: 2 },
      }),
    );
    const out = await run({
      resource: "item",
      operation: "getAll",
      siteId: "site_abc",
      collectionId: "col_xyz",
      returnAll: false,
      limit: 10,
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/col_xyz/items?limit=10");
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect(out[0][0].json).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("sends Bearer token from webflowApi credential", async () => {
    await run(
      {
        resource: "item",
        operation: "get",
        collectionId: "col_xyz",
        itemId: "item_123",
      },
      [{}],
      { credentials: CREDS },
    );

    expect(calls[0].headers["Authorization"]).toBe("Bearer tok_123");
  });

  it("sends Bearer token from webflowOAuth2Api credential", async () => {
    await run(
      {
        resource: "item",
        operation: "get",
        collectionId: "col_xyz",
        itemId: "item_123",
      },
      [{}],
      { credentials: { webflowOAuth2Api: { accessToken: "oauth_tok" } } },
    );

    expect(calls[0].headers["Authorization"]).toBe("Bearer oauth_tok");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "item",
          operation: "get",
          collectionId: "col_xyz",
          itemId: "item_123",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/No valid credential found/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "bad" }, { status: 500 }));
    const out = await run(
      {
        resource: "item",
        operation: "get",
        collectionId: "col_xyz",
        itemId: "nonexistent",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json).toHaveProperty("message");
  });

  it("throws when collectionId is missing", async () => {
    await expect(
      run(
        {
          resource: "item",
          operation: "get",
          itemId: "item_123",
        },
        [{}],
        { credentials: CREDS },
      ),
    ).rejects.toThrow(/collectionId is required/);
  });

  it("makes one request per input item", async () => {
    await run(
      {
        resource: "item",
        operation: "get",
        collectionId: "col_xyz",
        itemId: "={{ $json.id }}",
      },
      [{ id: "item_a" }, { id: "item_b" }],
      { credentials: CREDS },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/col_xyz/items/item_a");
    expect(calls[1].url).toBe("https://api.webflow.com/v2/collections/col_xyz/items/item_b");
  });
});
