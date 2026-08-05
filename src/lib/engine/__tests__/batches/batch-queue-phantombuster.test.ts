import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.phantombuster";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

interface FetchCall { url: string; method?: string; body?: string }

let calls: FetchCall[] = [];

function installMockFetch(routeMatcher?: (url: string) => boolean, response?: unknown) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, opts?: RequestInit) => {
    calls.push({ url: String(url), method: opts?.method as string | undefined, body: opts?.body as string | undefined });
    if (routeMatcher && !routeMatcher(String(url))) {
      return mockJsonResponse({ error: "not found" }, 404);
    }
    return mockJsonResponse(response ?? {});
  }));
}

function buildCtx(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
): ReturnType<typeof createExecutionContext> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  return createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => inputItems.map((json) => ({ json })),
    continueOnFail: false,
    getCredential: async () => ({ apiKey: "test-api-key" }),
  });
}

const fakeAgent = { id: "42", name: "Test Agent", scriptId: "123" };
const fakeAgents = [fakeAgent, { id: "43", name: "Agent 2", scriptId: "456" }];
const fakeLaunchResult = { containerId: "c-789", status: "running" };
const fakeContainer = { id: "c-789", status: "finished", output: "data" };
const fakeOutput = { containerId: "c-789", outputData: "raw output" };
const fakeResultObject = { result: "resolved data" };
const fakeDeleteResult = { success: true };

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue phantombuster — n8n-nodes-base.phantombuster", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("PhantomBuster");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.phantombuster")).toBe(canonical);
  });

  it("get an agent by ID", async () => {
    installMockFetch((url) => url.includes("agents/fetch?id=42"), fakeAgent);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({ resource: "agent", operation: "get", agentId: "42" });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "42", name: "Test Agent" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("agents/fetch?id=42");
  });

  it("launch an agent with key-value arguments", async () => {
    installMockFetch((url) => url.includes("agents/launch"), fakeLaunchResult);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({
      resource: "agent", operation: "launch", agentId: "42",
      jsonParameters: false,
      argumentsUi: { argumentValues: [{ key: "profileUrl", value: "https://linkedin.com/in/example" }] },
    });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ containerId: "c-789" });
    expect(calls).toHaveLength(1);
    const parsedBody = JSON.parse(calls[0].body!);
    expect(parsedBody).toMatchObject({ id: "42", arguments: { profileUrl: "https://linkedin.com/in/example" } });
  });

  it("launch an agent with resolveData", async () => {
    let callCount = 0;
    installMockFetch((url) => {
      callCount++;
      return true;
    }, undefined);
    // Override to return different responses per call
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push({ url: String(url) });
      const u = String(url);
      if (u.includes("agents/launch")) return mockJsonResponse(fakeLaunchResult);
      if (u.includes("containers/fetch?id=c-789")) return mockJsonResponse(fakeContainer);
      return mockJsonResponse({ error: "unexpected" }, 404);
    }));
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({ resource: "agent", operation: "launch", agentId: "42", resolveData: true });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "c-789", status: "finished" });
    expect(calls).toHaveLength(2);
  });

  it("delete an agent", async () => {
    installMockFetch((url) => url.includes("agents/delete"), fakeDeleteResult);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({ resource: "agent", operation: "delete", agentId: "99" });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ success: true });
    const parsedBody = JSON.parse(calls[0].body!);
    expect(parsedBody).toMatchObject({ id: "99" });
  });

  it("list all agents with limit", async () => {
    installMockFetch((url) => url.includes("agents/fetch-all"), fakeAgents);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({ resource: "agent", operation: "getAll", returnAll: false, limit: 1 });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toBeInstanceOf(Array);
    expect((out[0][0].json as unknown[]).length).toBe(1);
  });

  it("getOutput without resolveData", async () => {
    installMockFetch((url) => url.includes("agents/fetch-output"), fakeOutput);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({ resource: "agent", operation: "getOutput", agentId: "42", resolveData: false });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ containerId: "c-789" });
    expect(calls).toHaveLength(1);
  });

  it("getOutput with resolveData", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push({ url: String(url) });
      const u = String(url);
      if (u.includes("agents/fetch-output")) return mockJsonResponse(fakeOutput);
      if (u.includes("containers/fetch-result-object")) return mockJsonResponse(fakeResultObject);
      return mockJsonResponse({ error: "unexpected" }, 404);
    }));
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({ resource: "agent", operation: "getOutput", agentId: "42", resolveData: true });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ result: "resolved data" });
    expect(calls).toHaveLength(2);
  });

  it("missing agentId throws", async () => {
    installMockFetch(() => false);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({ resource: "agent", operation: "get", agentId: "" });
    await expect(executor(ctx, ctx.node)).rejects.toThrow(/agentId/);
  });

  it("continueOnFail with API error yields error item", async () => {
    installMockFetch(() => false);
    const node = makeNode({ name: "N", type: TYPE, parameters: {
      resource: "agent", operation: "get", agentId: "999",
    }});
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing API key credential throws", async () => {
    installMockFetch(() => false);
    const node = makeNode({ name: "N", type: TYPE, parameters: {
      resource: "agent", operation: "get", agentId: "42",
    }});
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/Credential/);
  });

  it("unsupported operation throws", async () => {
    installMockFetch(() => false);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({ resource: "agent", operation: "unknown" });
    await expect(executor(ctx, ctx.node)).rejects.toThrow(/unsupported operation/);
  });
});
