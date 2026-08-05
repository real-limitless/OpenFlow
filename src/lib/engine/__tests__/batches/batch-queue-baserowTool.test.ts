import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.baserowTool";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async json() {
      return JSON.parse(text || "{}");
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];
type Handler = (url: string, method: string, body?: string) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h?: Handler) {
  calls = [];
  handler =
    h ??
    ((_url, _method) => mockResponse({}));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ url, method, body: body ?? undefined });
      return handler(url, method, body);
    }),
  );
}

function uninstallFetch() {
  vi.unstubAllGlobals();
}

function ctxFor(nodeOverrides: Partial<INode> = {}): ExecutionContext {
  return createExecutionContext({
    node: makeNode({
      type: TYPE,
      name: "N",
      parameters: {
        operation: "create",
        tableId: 12345,
        ...nodeOverrides.parameters,
      },
      ...nodeOverrides,
    }),
    workflow: { id: "wf-test", name: "Test", active: false, nodes: [], connections: {}, settings: {} },
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail: false,
    getCredential: async (_name: string) => null,
  });
}

async function runTool(
  params: Record<string, unknown>,
  cred?: Record<string, unknown>,
): Promise<INodeExecutionData[][]> {
  const exec = getExecutor(TYPE);
  if (!exec) throw new Error(`${TYPE} not registered`);
  const node = makeNode({ type: TYPE, name: "N", parameters: params });
  const creds = cred ?? {};
  const ctx = createExecutionContext({
    node,
    workflow: { id: "wf", name: "W", active: false, nodes: [], connections: {}, settings: {} },
    getNodeInputItems: () => [{ json: {} }],
    continueOnFail: false,
    getCredential: async (name: string): Promise<Record<string, unknown> | null> => {
      if (name === "baserowApi") return (creds.baserowApi ?? null) as Record<string, unknown> | null;
      if (name === "baserowTokenApi") return (creds.baserowTokenApi ?? null) as Record<string, unknown> | null;
      return null;
    },
  });
  return exec(ctx, node);
}

describe("baserowTool", () => {
  beforeEach(() => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/database/rows/table/12345/batch/")) {
        const items = body ? JSON.parse(body) : [];
        return mockResponse(items.map((_: unknown, i: number) => ({ id: i + 10, name: (items[i] as Record<string, unknown>).name ?? "" })));
      }
      if (method === "DELETE" && url.includes("/batch/")) {
        return mockResponse({ success: true }, { status: 204 });
      }
      if (url.includes("/database/rows/table/12345/") && method === "GET") {
        return mockResponse({ results: [{ id: 2, name: "active-item", value: 100 }] });
      }
      if (method === "POST") {
        return mockResponse({ id: 1, name: "Test Row", value: 42, order: 0.0 });
      }
      if (method === "PATCH") {
        return mockResponse({ id: 1, name: "Test Row", value: 99 });
      }
      if (method === "DELETE") {
        return mockResponse({ success: true }, { status: 204 });
      }
      return mockResponse({});
    });
  });

  afterEach(() => {
    uninstallFetch();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("create row", async () => {
    const result = await runTool({
      operation: "create",
      tableId: 12345,
      data: { name: "Test Row", value: 42 },
    });
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toMatchObject({ id: 1, name: "Test Row", value: 42 });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/database/rows/table/12345/");
  });

  it("get many rows with filter", async () => {
    const result = await runTool({
      operation: "getAll",
      tableId: 12345,
      filters: { "field_1__contains": "active" },
      options: { size: 10 },
    });
    expect(result[0].length).toBeGreaterThanOrEqual(1);
    expect(result[0][0].json).toMatchObject({ id: 2, name: "active-item", value: 100 });
  });

  it("update row", async () => {
    const result = await runTool({
      operation: "update",
      tableId: 12345,
      rowId: 1,
      data: { value: 99 },
    });
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toMatchObject({ id: 1, value: 99 });
    expect(calls[0].method).toBe("PATCH");
  });

  it("delete row", async () => {
    const result = await runTool({
      operation: "delete",
      tableId: 12345,
      rowId: 1,
    });
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toMatchObject({ success: true });
  });

  it("batch create", async () => {
    const result = await runTool({
      operation: "createMultiple",
      tableId: 12345,
      data: [{ name: "A" }, { name: "B" }],
    });
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].json).toMatchObject({ id: 10, name: "A" });
    expect(result[0][1].json).toMatchObject({ id: 11, name: "B" });
  });
});
