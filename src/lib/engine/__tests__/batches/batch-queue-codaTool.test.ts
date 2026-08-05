import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.codaTool";
const API_BASE = "https://coda.io/apis/v1";

function mockFetch(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Map(),
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>>,
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
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

async function runCodaTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = {},
) {
  const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue codaTool — n8n-nodes-base.codaTool", () => {
  it("is registered as executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("resolves under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.codaTool")).toBe(canonical);
  });

  it("getAllRows: lists rows from a table", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      mockFetch({
        items: [
          { id: "row-111", name: "Item A", values: { "col-1": "A", "col-2": 10 } },
          { id: "row-222", name: "Item B", values: { "col-1": "B", "col-2": 20 } },
        ],
        nextPageToken: null,
      });
    try {
      const out = await runCodaTool(
        {
          resource: "Table",
          operation: "getAllRows",
          docId: "AbCDeFGH",
          tableId: "grid-123456",
        },
        [{}],
        { codaApi: { accessToken: "tok_abc" } },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({
        items: [
          { id: "row-111", name: "Item A", values: { "col-1": "A", "col-2": 10 } },
          { id: "row-222", name: "Item B", values: { "col-1": "B", "col-2": 20 } },
        ],
        nextPageToken: null,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("createRow: inserts a row and returns requestId", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const reqUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      expect(reqUrl).toBe(`${API_BASE}/docs/AbCDeFGH/tables/grid-123456/rows`);
      return mockFetch({ requestId: "req-abc-123", id: "row-333" }, 202);
    };
    try {
      const out = await runCodaTool(
        {
          resource: "Table",
          operation: "createRow",
          docId: "AbCDeFGH",
          tableId: "grid-123456",
          data: { rows: [{ cells: [{ column: "col-1", value: "New Item" }, { column: "col-2", value: 5 }] }] },
        },
        [{ json: { name: "New Item", quantity: 5 } }],
        { codaApi: { accessToken: "tok_abc" } },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({
        requestId: "req-abc-123",
        id: "row-333",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("formula get: retrieves a formula", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      mockFetch({
        id: "formula-xyz",
        type: "formula",
        href: `${API_BASE}/docs/AbCDeFGH/formulas/formula-xyz`,
        name: "Total",
        value: 42,
      });
    try {
      const out = await runCodaTool(
        {
          resource: "Formula",
          operation: "get",
          docId: "AbCDeFGH",
          formulaId: "formula-xyz",
        },
        [{}],
        { codaApi: { accessToken: "tok_abc" } },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({
        id: "formula-xyz",
        type: "formula",
        href: `${API_BASE}/docs/AbCDeFGH/formulas/formula-xyz`,
        name: "Total",
        value: 42,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("continueOnFail: returns error item instead of throwing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockFetch({ message: "Not found" }, 404);
    try {
      const node = makeNode({
        name: "N",
        type: TYPE,
        typeVersion: 1,
        parameters: {
          resource: "Table",
          operation: "getAllRows",
          docId: "AbCDeFGH",
          tableId: "grid-123456",
        },
      });
      const items = toItems([{}]);
      const ctx = createExecutionContext({
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
        continueOnFail: true,
        getCredential: async () => ({ accessToken: "tok_abc" }),
      });
      const executor = getExecutor(TYPE)!;
      const out = await executor(ctx, node);

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, string>).error).toContain("Coda API error 404");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
