import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.quickbaseTool";
const CREDS = { quickbaseApi: { hostname: "mycompany", userToken: "test-token-123" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: (name: string) => { const h: Record<string, string> = { "content-type": "application/json" }; return h[name.toLowerCase()] ?? null; } },
    async json() { return text ? JSON.parse(text) : {}; },
    async text() { return text; },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let lastUrl: string;
let lastMethod: string;
let lastBody: unknown;

function installFetch(h: Handler) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    let body: unknown;
    if (init?.body && typeof init.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    lastBody = body;
    lastUrl = String(url);
    lastMethod = init?.method ?? "GET";
    return h(String(url), init?.method ?? "GET", body);
  }));
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: INodeExecutionData[] = [{ json: {} }],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters, credentials: { quickbaseApi: { name: "quickbaseApi" } } });
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => inputItems,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

describe("batch-queue quickbaseTool — n8n-nodes-base.quickbaseTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    lastUrl = "";
    lastMethod = "";
    lastBody = undefined;
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.displayName).toBe("Quick Base (AI Tool)");
  });

  it("create a record with simplified output", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("api.quickbase.com/v1/records")) {
        return mockResponse({
          data: [{ "6": { value: "New Customer" }, "7": { value: "contact@example.com" } }],
          metadata: { totalRecords: 1 },
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "record",
      operation: "create",
      tableId: "abc123",
      columns: "name,email",
      simple: true,
    });

    const record = out[0][0].json as Record<string, unknown>;
    expect(record).toHaveProperty("6", "New Customer");
    expect(record).toHaveProperty("7", "contact@example.com");
  });

  it("getAll records with a where filter", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("api.quickbase.com/v1/records")) {
        return mockResponse({
          data: [
            { "3": { value: "1" }, "6": { value: "Customer A" } },
            { "3": { value: "2" }, "6": { value: "Customer B" } },
          ],
          metadata: { totalRecords: 2 },
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "record",
      operation: "getAll",
      tableId: "abc123",
      where: "{3.GT.0}",
      returnAll: true,
    });

    expect(out[0]).toHaveLength(2);
    const body = lastBody as Record<string, unknown> | undefined;
    expect(body?.from).toBe("abc123");
  });

  it("upsert by merge field", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("api.quickbase.com/v1/records")) {
        return mockResponse({
          data: [{ "6": { value: "Updated Name" }, recordId: "123" }],
          metadata: { totalRecords: 1 },
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "record",
      operation: "upsert",
      tableId: "abc123",
      columns: "id,name",
      updateKey: "id",
      mergeFieldId: 3,
      simple: true,
    }, [{ json: { id: "123", name: "Updated Name" } }]);

    const record = out[0][0].json as Record<string, unknown>;
    expect(record).toHaveProperty("6", "Updated Name");
  });

  it("get all fields for a table", async () => {
    installFetch((url) => {
      if (url.includes("api.quickbase.com/v1/fields")) {
        return mockResponse({
          data: [
            { id: 1, label: "Name", type: "text" },
            { id: 2, label: "Email", type: "email" },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "field",
      operation: "getAll",
      tableId: "abc123",
    });

    const result = out[0][0].json as Record<string, unknown>;
    expect(result).toHaveProperty("data");
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[])).toHaveLength(2);
  });

  it("report get operation", async () => {
    installFetch((url) => {
      if (url.includes("api.quickbase.com/v1/reports/")) {
        return mockResponse({ id: "report1", name: "My Report" });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "report",
      operation: "get",
      reportId: "report1",
    });

    expect(out[0][0].json).toMatchObject({ id: "report1", name: "My Report" });
  });

  it("throws on missing credential", async () => {
    const node = makeNode({
      name: "N", type: TYPE,
      parameters: { resource: "record", operation: "create", tableId: "abc123" },
      credentials: {},
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    await expect(getExecutor(TYPE)!(ctx, node)).rejects.toThrow(/Quick Base API credentials are required/);
  });

  it("continueOnFail returns error json", async () => {
    installFetch(() => mockResponse({ message: "Not authorized" }, 401));
    const out = await run(
      { resource: "record", operation: "create", tableId: "abc123", columns: "name" },
      [{ json: {} }],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: { message: expect.stringContaining("Not authorized") } });
  });

  it("download file", async () => {
    installFetch((url) => {
      if (url.includes("api.quickbase.com/v1/files")) {
        return mockResponse({ fileUrl: "https://files.quickbase.com/doc.pdf" });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "file",
      operation: "download",
      tableId: "abc123",
      recordId: "456",
      fieldId: "7",
      versionNumber: 1,
      binaryPropertyName: "data",
    });

    expect(out[0][0].json).toHaveProperty("fileUrl");
  });
});
