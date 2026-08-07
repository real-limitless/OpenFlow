import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import type { INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.quickbase";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; }, entries() { return new Map().entries(); } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

let calls: Array<{ url: string; method: string; body: string | undefined }>;
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>>) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return responseQueue.shift() ?? mockResponse({});
  }));
}

function restoreFetch() {
  vi.unstubAllGlobals();
}

async function run(
  params: Record<string, unknown>,
  creds?: Record<string, string>,
): Promise<INodeExecutionData[][]> {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);

  const n = {
    id: "test",
    name: "Quick Base",
    type: TYPE,
    typeVersion: 1,
    position: [0, 0],
    parameters: { resource: "record", operation: "create", ...params },
  };

  const { createExecutionContext } = await import("@/sdk");
  const ctx = createExecutionContext({
    node: n,
    workflow: {
      id: "wf", name: "T", active: false, nodes: [n], connections: {}, settings: {},
    },
    getNodeInputItems: () => [{ json: {}, pairedItem: { item: 0, input: 0 } }],
    continueOnFail: false,
    getCredential: async () => creds ?? null,
  });
  return executor(ctx, n);
}

describe("quickbase executor", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { restoreFetch(); vi.useRealTimers(); });

  it("is registered and has description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE)?.name).toBe(TYPE);
  });

  it("throws without credentials", async () => {
    installFetch(mockResponse({}));
    await expect(run({ tableId: "t" })).rejects.toThrow("credentials");
  });

  it("creates a record", async () => {
    installFetch(mockResponse({
      data: [{ "6": { value: "New Customer" }, "3": { value: "12345" } }],
    }));
    const [out] = await run(
      { tableId: "t1", fields: '{"6":"New Customer"}' },
      { hostname: "test", userToken: "tok" },
    );
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(calls[0].body!);
    expect(body.to).toBe("t1");
    expect(out.length).toBe(1);
    expect(out[0].json["6"]).toEqual({ value: "New Customer" });
  });

  it("gets all records with filter and sort", async () => {
    installFetch(mockResponse({
      data: [{ "3": { value: "1" }, "6": { value: "A" } }],
    }));
    const [out] = await run(
      { resource: "record", operation: "getAll", tableId: "t1", filter: "{6.CT.'x'}", limit: 50, sortBy: "3", sortDirection: "DESC" },
      { hostname: "test", userToken: "tok" },
    );
    const body = JSON.parse(calls[0].body!);
    expect(body.from).toBe("t1");
    expect(body.where).toBe("{6.CT.'x'}");
    expect(body.options.limit).toBe(50);
    expect(body.sortBy[0].fieldId).toBe(3);
    expect(body.sortBy[0].order).toBe("DESC");
    expect(out.length).toBe(1);
    expect(out[0].json["6"]).toEqual({ value: "A" });
  });

  it("upserts a record", async () => {
    installFetch(mockResponse({
      data: [{ "6": { value: "Name" }, "3": { value: "99" } }],
    }));
    const [out] = await run(
      { resource: "record", operation: "upsert", tableId: "t1", upsertKey: "6", fields: '{"6":"Name"}' },
      { hostname: "test", userToken: "tok" },
    );
    const body = JSON.parse(calls[0].body!);
    expect(body.mergeFieldId).toBe("6");
    expect(out[0].json["6"]).toEqual({ value: "Name" });
  });

  it("runs a report", async () => {
    installFetch(mockResponse({
      data: [{ col1: "val1" }, { col1: "val2" }],
    }));
    const [out] = await run(
      { resource: "report", operation: "run", tableId: "t1", reportId: "100" },
      { hostname: "test", userToken: "tok" },
    );
    const body = JSON.parse(calls[0].body!);
    expect(body.reportId).toBe("100");
    expect(out.length).toBe(1);
    expect(Array.isArray(out[0].json.data)).toBe(true);
    expect(out[0].json.data).toHaveLength(2);
  });

  it("gets all fields", async () => {
    installFetch(mockResponse({
      data: [{ id: 6, label: "Company" }],
    }));
    const [out] = await run(
      { resource: "field", operation: "getAll", tableId: "t1" },
      { hostname: "test", userToken: "tok" },
    );
    expect(out.length).toBe(1);
  });
});
