import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.webflow";

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

describe("batch-queue webflow — n8n-nodes-base.webflow", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Webflow");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.webflow")).toBe(canonical);
  });

  it("creates an item via POST with fieldData body", async () => {
    installFetch(mockResponse({ id: "item_new", fieldData: { name: "Test Item", slug: "test-item" } }));
    const out = await run({
      authentication: "accessToken",
      resource: "item",
      operation: "create",
      siteId: "site_123",
      collectionId: "coll_456",
      live: false,
      fieldsUi: {
        fieldValues: [
          { fieldId: "name", fieldValue: "Test Item" },
          { fieldId: "slug", fieldValue: "test-item" },
        ],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/coll_456/items");
    expect(JSON.parse(calls[0].body!)).toEqual({
      fieldData: { name: "Test Item", slug: "test-item" },
    });
    expect(out[0][0].json).toMatchObject({ id: "item_new" });
  });

  it("appends /live when live=true on create", async () => {
    await run({
      authentication: "accessToken",
      resource: "item",
      operation: "create",
      collectionId: "coll_456",
      live: true,
      fieldsUi: { fieldValues: [{ fieldId: "name", fieldValue: "Live" }] },
    });

    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/coll_456/items/live");
  });

  it("gets a single item via GET", async () => {
    installFetch(mockResponse({ id: "item_789", fieldData: { name: "X" } }));
    const out = await run({
      authentication: "accessToken",
      resource: "item",
      operation: "get",
      collectionId: "coll_456",
      itemId: "item_789",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/coll_456/items/item_789");
    expect(out[0][0].json).toMatchObject({ id: "item_789" });
  });

  it("gets many items with limit query param and returns array", async () => {
    installFetch(
      mockResponse({
        items: [{ id: "a" }, { id: "b" }],
        pagination: { limit: 50, offset: 0, total: 2 },
      }),
    );
    const out = await run({
      authentication: "accessToken",
      resource: "item",
      operation: "getAll",
      collectionId: "coll_456",
      returnAll: false,
      limit: 50,
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/coll_456/items?limit=50");
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect(out[0][0].json).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("updates an item via PATCH with /live suffix and fieldData body", async () => {
    installFetch(mockResponse({ id: "item_789", fieldData: { name: "Updated Name" } }));
    const out = await run({
      authentication: "accessToken",
      resource: "item",
      operation: "update",
      collectionId: "coll_456",
      itemId: "item_789",
      live: true,
      fieldsUi: { fieldValues: [{ fieldId: "name", fieldValue: "Updated Name" }] },
    });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(
      "https://api.webflow.com/v2/collections/coll_456/items/item_789/live",
    );
    expect(JSON.parse(calls[0].body!)).toEqual({ fieldData: { name: "Updated Name" } });
    expect(out[0][0].json).toMatchObject({ id: "item_789" });
  });

  it("deletes an item and returns success:true on HTTP 204", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      authentication: "accessToken",
      resource: "item",
      operation: "delete",
      collectionId: "coll_456",
      itemId: "item_789",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/coll_456/items/item_789");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("returns success:false on non-204 delete", async () => {
    installFetch(mockResponse({ message: "not found" }, { status: 404 }));
    await expect(
      run({
        authentication: "accessToken",
        resource: "item",
        operation: "delete",
        collectionId: "coll_456",
        itemId: "item_789",
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("sends Bearer token from webflowApi credential", async () => {
    await run(
      {
        authentication: "accessToken",
        resource: "item",
        operation: "get",
        collectionId: "coll_456",
        itemId: "item_789",
      },
      [{}],
      { credentials: CREDS },
    );

    expect(calls[0].headers["Authorization"]).toBe("Bearer tok_123");
  });

  it("sends Bearer token from webflowOAuth2Api credential when oAuth2", async () => {
    await run(
      {
        authentication: "oAuth2",
        resource: "item",
        operation: "get",
        collectionId: "coll_456",
        itemId: "item_789",
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
          authentication: "accessToken",
          resource: "item",
          operation: "get",
          collectionId: "coll_456",
          itemId: "item_789",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/webflowApi credential is not configured/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "bad" }, { status: 500 }));
    const out = await run(
      {
        authentication: "accessToken",
        resource: "item",
        operation: "get",
        collectionId: "coll_456",
        itemId: "item_789",
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
          authentication: "accessToken",
          resource: "item",
          operation: "get",
          itemId: "item_789",
        },
        [{}],
        { credentials: CREDS },
      ),
    ).rejects.toThrow(/collectionId is required/);
  });

  it("makes one request per input item", async () => {
    await run(
      {
        authentication: "accessToken",
        resource: "item",
        operation: "get",
        collectionId: "coll_456",
        itemId: "={{ $json.id }}",
      },
      [{ id: "item_a" }, { id: "item_b" }],
      { credentials: CREDS },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.webflow.com/v2/collections/coll_456/items/item_a");
    expect(calls[1].url).toBe("https://api.webflow.com/v2/collections/coll_456/items/item_b");
  });
});