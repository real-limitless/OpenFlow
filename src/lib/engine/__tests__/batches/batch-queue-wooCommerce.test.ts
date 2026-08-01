import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.wooCommerce";
const CREDS = { woocommerceApi: { url: "https://example.com", consumerKey: "ck_test", consumerSecret: "cs_test" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: {
      get: (name: string) => {
        const h: Record<string, string> = { "content-type": "application/json" };
        return h[name.toLowerCase()] ?? null;
      },
    },
    async json() { return text ? JSON.parse(text) : {}; },
    async text() { return text; },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;
let calls: Array<{ url: string; method: string; body?: unknown }>;

function installFetch(h: Handler) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      calls.push({ url: lastUrl, method: lastMethod, body });
      return h(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: INodeExecutionData[] = [{ json: {} }],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { woocommerceApi: { name: "woocommerceApi" } },
  });
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => inputItems,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wooCommerce executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create a product", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/wc/v3/products")) {
        return mockResponse({ id: 123, name: "Notebook", type: "simple", regular_price: "12.00" });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "product",
      operation: "create",
      data: JSON.stringify({ name: "Notebook", type: "simple", regular_price: "12.00" }),
    });

    expect(out[0][0].json).toMatchObject({ id: 123, name: "Notebook" });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/wc/v3/products");
    expect(lastBody).toMatchObject({ name: "Notebook", type: "simple", regular_price: "12.00" });
  });

  it("retrieve one order", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/wc/v3/orders/42")) {
        return mockResponse({ id: 42, status: "processing", total: "99.99" });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "order",
      operation: "get",
      id: 42,
    });

    expect(out[0][0].json).toMatchObject({ id: 42, status: "processing" });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("/wc/v3/orders/42");
  });

  it("retrieve all customers across pages", async () => {
    let pageNum = 0;
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/wc/v3/customers")) {
        pageNum++;
        if (pageNum === 1) {
          return mockResponse([{ id: 1, email: "a@b.com" }, { id: 2, email: "c@d.com" }]);
        }
        return mockResponse([]);
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "customer",
      operation: "getAll",
      returnAll: true,
      options: { perPage: 2 },
    });

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: 1 });
    expect(out[0][1].json).toMatchObject({ id: 2 });
    expect(lastUrl).toContain("per_page=2");
  });

  it("update then delete a product", async () => {
    installFetch((url, method) => {
      if (method === "PUT" && url.includes("/wc/v3/products/7")) {
        return mockResponse({ id: 7, name: "Notebook", regular_price: "15.00" });
      }
      if (method === "DELETE" && url.includes("/wc/v3/products/7")) {
        return mockResponse({ id: 7, status: "deleted" });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "product",
      operation: "update",
      id: 7,
      data: JSON.stringify({ regular_price: "15.00" }),
    });

    expect(out[0][0].json).toMatchObject({ id: 7, regular_price: "15.00" });
    expect(lastMethod).toBe("PUT");
    expect(lastUrl).toContain("/wc/v3/products/7");
    expect(lastBody).toMatchObject({ regular_price: "15.00" });

    const out2 = await run({
      resource: "product",
      operation: "delete",
      id: 7,
    });

    expect(out2[0][0].json).toMatchObject({ id: 7, status: "deleted" });
    expect(lastMethod).toBe("DELETE");
    expect(lastUrl).toContain("/wc/v3/products/7");
  });

  it("propagate an API failure", async () => {
    installFetch(() => mockResponse({ code: "woocommerce_rest_authentication_error", message: "Invalid authentication" }, 401));
    await expect(run(
      {
        resource: "customer",
        operation: "get",
        id: 3,
      },
      [{ json: {} }],
    )).rejects.toThrow();

    const out = await run(
      {
        resource: "customer",
        operation: "get",
        id: 3,
      },
      [{ json: {} }],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.objectContaining({ message: expect.stringContaining("Invalid authentication") }) });
  });
});