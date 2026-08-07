import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.unleashedSoftware";
const CREDENTIALS = {
  unleashedSoftwareApi: {
    apiId: "test-api-id",
    apiKey: "test-api-key",
  },
};

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async text() { return JSON.stringify(body); },
    async json() { return body; },
  };
}

let calls: Array<{ url: string; headers: Record<string, string> }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const key = String(url).split("?")[0];
      calls.push({ url: String(url), headers: (opts?.headers as Record<string, string>) ?? {} });
      const match = Object.keys(routes).find((k) => key.includes(k));
      if (!match) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[match]);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue unleashedSoftware — n8n-nodes-base.unleashedSoftware", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Unleashed Software");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.unleashedSoftware")).toBe(canonical);
  });

  it("salesOrder — getAll returns paginated Items", async () => {
    const fakeItems = [
      { OrderNumber: "SO-001", OrderStatus: "Placed", Customer: { CustomerCode: "C001" }, SalesOrderLines: [{ LineTotal: 100 }], SubTotal: 100, TaxTotal: 10, Total: 110 },
    ];
    installFetch({
      "/SalesOrders": { Pagination: { pageNumber: 1, pageSize: 200, numberOfPages: 1, totalItems: 1 }, Items: fakeItems },
    });
    const out = await runNode(TYPE, { resource: "salesOrder", operation: "getAll", returnAll: false, limit: 50, filters: {} }, [{}], { credentials: CREDENTIALS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.OrderNumber).toBe("SO-001");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/SalesOrders");
    expect(calls[0].url).toContain("pageSize=50");
  });

  it("salesOrder — getAll with orderStatus filter", async () => {
    const fakeItems = [
      { OrderNumber: "SO-002", OrderStatus: "Placed" },
      { OrderNumber: "SO-003", OrderStatus: "Backordered" },
    ];
    installFetch({
      "/SalesOrders": { Pagination: { pageNumber: 1, pageSize: 200, numberOfPages: 1, totalItems: 2 }, Items: fakeItems },
    });
    const out = await runNode(TYPE, { resource: "salesOrder", operation: "getAll", returnAll: true, filters: { orderStatus: ["Placed", "Backordered"] } }, [{}], { credentials: CREDENTIALS });
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("orderStatus=Placed%2CBackordered");
  });

  it("stockOnHand — get returns single item by productId", async () => {
    const fakeItem = { ProductCode: "ABC", QtyOnHand: 50, AvailableQty: 45, AvgCost: 12.5 };
    installFetch({
      "/StockOnHand/7fc624f7-738a-4e95-aed1-758662372899": fakeItem,
    });
    const out = await runNode(TYPE, { resource: "stockOnHand", operation: "get", productId: "7fc624f7-738a-4e95-aed1-758662372899" }, [{ json: {} }], { credentials: CREDENTIALS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.ProductCode).toBe("ABC");
    expect(out[0][0].json.AvailableQty).toBe(45);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/StockOnHand/7fc624f7-738a-4e95-aed1-758662372899");
  });

  it("stockOnHand — getAll with warehouseCode filter", async () => {
    const fakeItems = [
      { ProductCode: "WH-ITEM", QtyOnHand: 10, Warehouse: { Code: "MAIN" } },
    ];
    installFetch({
      "/StockOnHand": { Pagination: { pageNumber: 1, pageSize: 200, numberOfPages: 1, totalItems: 1 }, Items: fakeItems },
    });
    const out = await runNode(TYPE, { resource: "stockOnHand", operation: "getAll", returnAll: true, filters: { warehouseCode: "MAIN" } }, [{}], { credentials: CREDENTIALS });
    expect(out[0]).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("warehouseCode=MAIN");
  });

  it("api-auth-signature is a non-trivial Base64 HMAC (not btoa of concatenated secrets)", async () => {
    installFetch({
      "/SalesOrders": { Pagination: { pageNumber: 1, pageSize: 200, numberOfPages: 1, totalItems: 1 }, Items: [] },
    });
    await runNode(TYPE, { resource: "salesOrder", operation: "getAll", returnAll: false, limit: 1 }, [{}], { credentials: CREDENTIALS });
    expect(calls[0].headers["api-auth-id"]).toBe("test-api-id");
    expect(calls[0].headers["api-auth-signature"]).toBeTruthy();
    const sig = calls[0].headers["api-auth-signature"];
    expect(sig.length).toBeGreaterThan(20);
    expect(sig).not.toContain("test-api-key");
    expect(sig).not.toContain("test-api-id");
  });

  it("missing credentials throws error", async () => {
    await expect(
      runNode(TYPE, { resource: "salesOrder", operation: "getAll", returnAll: false, limit: 1 }, [{}]),
    ).rejects.toThrow(/credential is not configured/i);
  });

  it("continueOnFail with missing credentials produces error item", async () => {
    const out = await runNode(TYPE, { resource: "salesOrder", operation: "getAll", returnAll: false, limit: 1, continueOnFail: true }, [{}], { continueOnFail: true });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("pagination preserves filter params on subsequent pages", async () => {
    installFetch({
      "/SalesOrders": { Pagination: { pageNumber: 1, pageSize: 100, numberOfPages: 2, totalItems: 150 }, Items: Array.from({ length: 100 }, (_, i) => ({ OrderNumber: `SO-${i}`, OrderStatus: "Placed" })) },
    });
    const out = await runNode(TYPE, { resource: "salesOrder", operation: "getAll", returnAll: true, filters: { orderStatus: "Placed" } }, [{}], { credentials: CREDENTIALS });
    expect(out[0].length).toBeGreaterThan(100);
    expect(calls.length).toBeGreaterThan(1);
    for (const c of calls) {
      expect(c.url).toContain("orderStatus=Placed");
    }
  });
});
