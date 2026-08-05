import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.codaTool";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      if (!(key in routes)) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue coda-tool — n8n-nodes-base.codaTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Coda (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.codaTool")).toBe(canonical);
  });

  it("Table — GetAllRows returns items array", async () => {
    const fakeRows = {
      items: [
        { id: "row-111", name: "Item A", values: { "col-1": "A", "col-2": 10 } },
        { id: "row-222", name: "Item B", values: { "col-1": "B", "col-2": 20 } },
      ],
      nextPageToken: null,
    };
    installFetch({
      "https://coda.io/apis/v1/docs/AbCDeFGH/tables/grid-123456/rows": fakeRows,
    });
    const out = await runNode(TYPE, { resource: "Table", operation: "getAllRows", docId: "AbCDeFGH", tableId: "grid-123456" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeRows);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://coda.io/apis/v1/docs/AbCDeFGH/tables/grid-123456/rows");
  });

  it("Table — createRow posts data and returns requestId", async () => {
    const fakeResponse = { requestId: "req-abc-123", id: "row-333" };
    const payload = { rows: [{ cells: [{ column: "col-1", value: "New Item" }, { column: "col-2", value: 5 }] }] };
    installFetch({
      "https://coda.io/apis/v1/docs/AbCDeFGH/tables/grid-123456/rows": fakeResponse,
    });
    const out = await runNode(TYPE, { resource: "Table", operation: "createRow", docId: "AbCDeFGH", tableId: "grid-123456", data: payload }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.requestId).toBe("req-abc-123");
    expect(out[0][0].json.id).toBe("row-333");
    expect(calls).toHaveLength(1);
  });

  it("Formula — Get returns formula object", async () => {
    const fakeFormula = {
      id: "formula-xyz",
      type: "formula",
      href: "https://coda.io/apis/v1/docs/AbCDeFGH/formulas/formula-xyz",
      name: "Total",
      value: 42,
    };
    installFetch({
      "https://coda.io/apis/v1/docs/AbCDeFGH/formulas/formula-xyz": fakeFormula,
    });
    const out = await runNode(TYPE, { resource: "Formula", operation: "get", docId: "AbCDeFGH", formulaId: "formula-xyz" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeFormula);
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail — returns error item instead of throwing", async () => {
    installFetch({});
    const out = await runNode(TYPE, { resource: "Table", operation: "getAllRows", docId: "NONE", tableId: "x" }, [{}], { continueOnFail: true });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
