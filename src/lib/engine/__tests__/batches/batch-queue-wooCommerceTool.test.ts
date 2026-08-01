import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.wooCommerceTool";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(_name: string) {
        return null;
      },
      entries() {
        return new Map<string, string>().entries();
      },
      forEach() {},
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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ id: 1 })) {
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
      return response;
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

const CREDS = {
  woocommerceApi: {
    url: "https://example.com",
    consumerKey: "ck_123",
    consumerSecret: "cs_456",
  },
};

const PRODUCT_RESPONSE = { id: 42, name: "AI-generated notebook", type: "simple", regular_price: "14.99" };

const ORDER_RESPONSE = {
  id: 101,
  status: "processing",
  total: "29.99",
  currency: "USD",
  billing: { first_name: "John", last_name: "Doe" },
  line_items: [{ product_id: 1, quantity: 2 }],
};

const CUSTOMER_RESPONSE = { id: 99, email: "john@example.com", first_name: "John", last_name: "Doe" };

const LIST_RESPONSE = [
  { id: 1, name: "Product A" },
  { id: 2, name: "Product B" },
  { id: 3, name: "Product C" },
];

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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue wooCommerceTool — n8n-nodes-base.wooCommerceTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("WooCommerce (AI Tool)");
  });

  // Acceptance: Create a product
  it("creates a product via POST /products", async () => {
    installFetch(mockResponse(PRODUCT_RESPONSE));
    const out = await run(
      {
        resource: "product",
        operation: "create",
        productFields: JSON.stringify({ name: "AI-generated notebook", type: "simple", regular_price: "14.99" }),
      },
      [{ json: { name: "AI-generated notebook", type: "simple", regular_price: "14.99" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://example.com/wc/v3/products");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toMatchObject({
      name: "AI-generated notebook",
      type: "simple",
      regular_price: "14.99",
    });
    expect(out[0][0].json).toMatchObject({ id: 42, name: "AI-generated notebook" });
  });

  // Acceptance: Get an order by ID using expression
  it("gets an order by ID via GET /orders/:id", async () => {
    installFetch(mockResponse(ORDER_RESPONSE));
    const out = await run(
      {
        resource: "order",
        operation: "get",
        orderId: "= $json.orderId",
      },
      [{ orderId: 101 }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://example.com/wc/v3/orders/101");
    expect(out[0][0].json).toMatchObject({ id: 101, status: "processing", total: "29.99", currency: "USD" });
  });

  // Acceptance: Delete a customer
  it("deletes a customer via DELETE /customers/:id", async () => {
    installFetch(mockResponse(CUSTOMER_RESPONSE));
    const out = await run(
      {
        resource: "customer",
        operation: "delete",
        customerId: "= $json.customerId",
      },
      [{ customerId: 42 }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://example.com/wc/v3/customers/42?force=true");
    expect(out[0][0].json).toMatchObject({ id: 99, email: "john@example.com" });
  });

  // Acceptance: Get All products with limit
  it("gets all products with limit via GET /products", async () => {
    installFetch(mockResponse(LIST_RESPONSE));
    const out = await run(
      {
        resource: "product",
        operation: "getAll",
        returnAll: false,
        limit: 5,
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/products?");
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toMatchObject({ id: 1, name: "Product A" });
    expect(out[0][1].json).toMatchObject({ id: 2, name: "Product B" });
    expect(out[0][2].json).toMatchObject({ id: 3, name: "Product C" });
  });

  // Acceptance: Update a product
  it("updates a product via PUT /products/:id", async () => {
    const updated = { id: 42, name: "Updated notebook", regular_price: "19.99" };
    installFetch(mockResponse(updated));
    const out = await run(
      {
        resource: "product",
        operation: "update",
        productId: "42",
        productFields: JSON.stringify({ regular_price: "19.99" }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://example.com/wc/v3/products/42");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toMatchObject({ regular_price: "19.99" });
    expect(out[0][0].json).toMatchObject({ id: 42, regular_price: "19.99" });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "product", operation: "create", productFields: "{}" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/woocommerceApi credential is not configured/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ message: "Invalid consumer key" }, { status: 401 }));
    await expect(
      run(
        { resource: "product", operation: "get", productId: "1" },
        [{}],
      ),
    ).rejects.toThrow(/Invalid consumer key/);
  });

  it("continueOnFail emits error item and continues", async () => {
    installFetch(mockResponse({ message: "Not found" }, { status: 404 }));
    const out = await run(
      {
        resource: "product",
        operation: "get",
        productId: "= $json.productId",
      },
      [{ productId: "bad" }, { productId: "good" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
