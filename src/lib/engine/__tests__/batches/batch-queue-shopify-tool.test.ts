import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.shopifyTool";

function mockShopifyResponse(data: unknown) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: new Map(),
    async json() { return JSON.parse(body); },
    async text() { return body; },
  };
}

function mockShopifyError(status: number, message: string) {
  const body = JSON.stringify({ errors: message });
  return {
    status,
    statusText: "Error",
    ok: false,
    headers: new Map(),
    async json() { return JSON.parse(body); },
    async text() { return body; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: (init?.method ?? "GET").toUpperCase(),
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return defaultResponse;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let defaultResponse: ReturnType<typeof mockShopifyResponse>;

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

const CREDS = {
  shopifyApi: { shopSubdomain: "testshop", accessToken: "shpat_abc123" },
};

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
  const items = inputItems.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
  const ctx = makeCtx(items, node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue shopifyTool — n8n-nodes-base.shopifyTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Shopify (AI Tool)");
  });

  it("creates a product with additional fields", async () => {
    defaultResponse = mockShopifyResponse({
      product: { id: 12345, title: "AI-generated Widget", vendor: "n8n Test" },
    });
    const out = await run({
      resource: "product",
      operation: "create",
      additionalFields: { title: "AI-generated Widget", vendor: "n8n Test" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/admin/api/2024-01/products.json");
    expect(calls[0].headers["X-Shopify-Access-Token"]).toBe("shpat_abc123");
    const body = JSON.parse(calls[0].body!);
    expect(body.product.title).toBe("AI-generated Widget");
    expect(out[0][0].json).toMatchObject({ id: 12345, title: "AI-generated Widget" });
  });

  it("gets an order by ID", async () => {
    defaultResponse = mockShopifyResponse({
      order: { id: 67890, created_at: "2024-01-15T10:00:00Z", line_items: [] },
    });
    const out = await run({
      resource: "order",
      operation: "get",
      orderId: 67890,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/admin/api/2024-01/orders/67890.json");
    expect(out[0][0].json).toMatchObject({ id: 67890 });
  });

  it("gets all products with limit", async () => {
    defaultResponse = mockShopifyResponse({
      products: [
        { id: 1, title: "A" },
        { id: 2, title: "B" },
        { id: 3, title: "C" },
      ],
    });
    const out = await run({
      resource: "product",
      operation: "getAll",
      returnAll: false,
      limit: 5,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/admin/api/2024-01/products.json");
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toMatchObject({ id: 1, title: "A" });
  });

  it("deletes a product", async () => {
    defaultResponse = mockShopifyResponse({});
    const out = await run({
      resource: "product",
      operation: "delete",
      productId: 12345,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/admin/api/2024-01/products/12345.json");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("throws on invalid credentials", async () => {
    defaultResponse = mockShopifyError(401, "Unauthorized");
    await expect(
      run({
        resource: "product",
        operation: "getAll",
        returnAll: true,
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "product", operation: "get", productId: 1 },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow("Shopify Tool: shopifyApi credential is not configured");
  });

  it("continueOnFail emits error item", async () => {
    defaultResponse = mockShopifyError(401, "Unauthorized");
    const out = await run(
      {
        resource: "product",
        operation: "getAll",
        returnAll: true,
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toMatchObject({ message: "Unauthorized" });
  });

  it("resolves expressions from input items", async () => {
    defaultResponse = mockShopifyResponse({
      product: { id: 99, title: "Expression Product" },
    });
    const out = await run(
      {
        resource: "product",
        operation: "create",
        additionalFields: { title: "=$json.productName", variants: [{ price: "=$json.price" }] },
      },
      [{ json: { productName: "AI Widget", price: "19.99" } }],
    );
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.product.title).toBe("AI Widget");
    expect(body.product.variants[0].price).toBe("19.99");
    expect(out[0][0].json).toMatchObject({ id: 99 });
  });
});
