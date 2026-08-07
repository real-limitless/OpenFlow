import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftDynamicsCrmTool";

interface FetchCall { url: string; method: string; }

let calls: FetchCall[];

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return { status, statusText: status === 200 ? "OK" : status === 201 ? "Created" : "Error", ok: status >= 200 && status < 300, headers: { get() { return null; } }, async json() { return JSON.parse(text); }, async text() { return text; } };
}

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({})) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function runTool(parameters: Record<string, unknown>, inputItems: Array<Record<string, unknown>> = [{}], opts?: { continueOnFail?: boolean }) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = createExecutionContext({
    node, workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => inputItems.map((item) => ({ json: item })),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ accessToken: "test-token", subdomain: "org", region: "crm.dynamics.com" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error("no executor");
  return executor(ctx, node).then((out) => ({ out, ctx }));
}

describe("batch-queue microsoftDynamicsCrmTool — n8n-nodes-base.microsoftDynamicsCrmTool", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft Dynamics CRM");
  });

  it("creates an account", async () => {
    installFetch(mockResponse({ name: "Test Company Inc", accountid: "00000000-0000-0000-0000-000000000001" }, 201));
    const { out } = await runTool({ resource: "account", operation: "create", name: "Test Company Inc" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ name: "Test Company Inc", accountid: "00000000-0000-0000-0000-000000000001" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/accounts");
  });

  it("gets an account by ID", async () => {
    installFetch(mockResponse({ accountid: "00000000-0000-0000-0000-000000000001", name: "Existing Corp" }));
    const { out } = await runTool({ resource: "account", operation: "get", accountId: "00000000-0000-0000-0000-000000000001" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ accountid: "00000000-0000-0000-0000-000000000001", name: "Existing Corp" });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("accounts(00000000-0000-0000-0000-000000000001)");
  });

  it("gets all accounts with filter", async () => {
    installFetch(mockResponse({ value: [{ accountid: "1", name: "Test A" }, { accountid: "2", name: "Test B" }] }));
    const { out } = await runTool({ resource: "account", operation: "getAll", returnAll: true, filters: { query: "startswith(name, 'Test')" } }, [{}]);
    expect(calls[0].url).toContain("$filter=");
    expect(calls[0].url).toContain("startswith(name%2C%20'Test')");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ accountid: "1", name: "Test A" });
    expect(out[0][1].json).toMatchObject({ accountid: "2", name: "Test B" });
  });

  it("updates an account", async () => {
    installFetch(mockResponse({ accountid: "00000000-0000-0000-0000-000000000001", name: "Updated Company Name" }));
    const { out } = await runTool({ resource: "account", operation: "update", accountId: "00000000-0000-0000-0000-000000000001", updateFields: { name: "Updated Company Name" } }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ accountid: "00000000-0000-0000-0000-000000000001", name: "Updated Company Name" });
    expect(calls[0].method).toBe("PATCH");
  });

  it("deletes an account (pass-through)", async () => {
    installFetch(mockResponse(null, 204));
    const { out } = await runTool({ resource: "account", operation: "delete", accountId: "00000000-0000-0000-0000-000000000001" }, [{ existingKey: "val" }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ existingKey: "val" });
    expect(calls[0].method).toBe("DELETE");
  });

  it("throws on missing name for create", async () => {
    installFetch();
    await expect(runTool({ resource: "account", operation: "create" }, [{}])).rejects.toThrow("name is required");
  });

  it("throws on missing accountId for get", async () => {
    installFetch();
    await expect(runTool({ resource: "account", operation: "get" }, [{}])).rejects.toThrow("accountId is required");
  });
});
