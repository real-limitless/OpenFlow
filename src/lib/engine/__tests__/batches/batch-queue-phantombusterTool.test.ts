import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.phantombusterTool";

interface FetchCall { url: string; method: string; }

let calls: FetchCall[];

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return { status, statusText: status === 200 ? "OK" : "Error", ok: status >= 200 && status < 300, headers: { get() { return null; } }, async json() { return JSON.parse(text); }, async text() { return text; } };
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
  const node = { id: "1", name: "N", type: TYPE, typeVersion: 1, position: [0, 0] as [number, number], parameters };
  const ctx = createExecutionContext({
    node, workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => inputItems.map((item) => ({ json: item })),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ apiKey: "test-key" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error("no executor");
  return executor(ctx, node).then((out) => ({ out, ctx }));
}

describe("batch-queue phantombusterTool — n8n-nodes-base.phantombusterTool", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("PhantomBuster (AI Tool)");
  });

  it("gets an agent by ID", async () => {
    installFetch(mockResponse({ id: "42", name: "My Agent", scriptId: "script-1" }));
    const { out } = await runTool({ operation: "get", agentId: "42" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "42", name: "My Agent" });
    expect(calls[0].url).toContain("/agents/fetch?id=42");
  });

  it("launches an agent with key-value arguments", async () => {
    installFetch(mockResponse({ containerId: "c-001" }));
    const { out } = await runTool({
      operation: "launch",
      agentId: "42",
      jsonParameters: false,
      argumentsUi: { argumentValues: [{ key: "profileUrl", value: "https://linkedin.com/in/example" }] },
      resolveData: false,
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ containerId: "c-001" });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ id: "42", arguments: { profileUrl: "https://linkedin.com/in/example" } });
  });

  it("launches an agent with resolveData", async () => {
    installFetch([
      mockResponse({ containerId: "c-001" }),
      mockResponse({ id: "c-001", status: "finished", output: {} }),
    ]);
    const { out } = await runTool({ operation: "launch", agentId: "42", resolveData: true }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(calls[1].url).toContain("/containers/fetch?id=c-001");
    expect(out[0][0].json).toMatchObject({ id: "c-001", status: "finished" });
  });

  it("deletes an agent — always returns {success:true}", async () => {
    installFetch(mockResponse({ status: "ok" }));
    const { out } = await runTool({ operation: "delete", agentId: "99" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ success: true });
    expect(calls[0].url).toContain("/agents/delete");
    expect(calls[0].method).toBe("POST");
  });

  it("lists all agents with limit", async () => {
    const agents = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1), name: `Agent ${i + 1}` }));
    installFetch(mockResponse(agents));
    const { out } = await runTool({ operation: "getAll", returnAll: false, limit: 10 }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect(out[0][0].json).toHaveLength(10);
    expect(calls[0].url).toContain("/agents/fetch-all");
  });

  it("launch includes manualLaunch, maxInstanceCount, saveArgument in body", async () => {
    installFetch(mockResponse({ containerId: "c-002" }));
    const { out } = await runTool({
      operation: "launch",
      agentId: "42",
      manualLaunch: true,
      maxInstanceCount: 3,
      saveArgument: "default-args",
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.manualLaunch).toBe(true);
    expect(body.maxInstanceCount).toBe(3);
    expect(body.saveArgument).toBe("default-args");
  });

  it("getOutput includes prev* query params when set", async () => {
    installFetch(mockResponse({ containerId: "c-003" }));
    const { out } = await runTool({
      operation: "getOutput",
      agentId: "42",
      prevContainerId: "c-001",
      prevStatus: "finished",
      prevRuntimeEventIndex: 5,
      resolveData: false,
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("prevContainerId=c-001");
    expect(calls[0].url).toContain("prevStatus=finished");
    expect(calls[0].url).toContain("prevRuntimeEventIndex=5");
  });

  it("resolveData defaults to true for getOutput", async () => {
    installFetch([
      mockResponse({ containerId: "c-004" }),
      mockResponse({ result: "resolved" }),
    ]);
    const { out } = await runTool({ operation: "getOutput", agentId: "42" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(calls[1].url).toContain("/containers/fetch-result-object");
    expect(out[0][0].json).toMatchObject({ result: "resolved" });
  });

  it("resolveData defaults to true for launch", async () => {
    installFetch([
      mockResponse({ containerId: "c-005" }),
      mockResponse({ id: "c-005", status: "running" }),
    ]);
    const { out } = await runTool({ operation: "launch", agentId: "42" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(calls[1].url).toContain("/containers/fetch?id=c-005");
    expect(out[0][0].json).toMatchObject({ id: "c-005", status: "running" });
  });

  it("throws when credential is missing (credential required before per-item loop)", async () => {
    const node = { id: "1", name: "N", type: TYPE, typeVersion: 1, position: [0, 0] as [number, number], parameters: { operation: "get" } };
    const ctx = createExecutionContext({
      node, workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    await expect(executor(ctx, node)).rejects.toThrow("phantombusterApi");
  });
});