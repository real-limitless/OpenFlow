import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.haloPSATool";

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
    getCredential: async () => ({ accessToken: "test-token" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error("no executor");
  return executor(ctx, node).then((out) => ({ out, ctx }));
}

describe("batch-queue haloPSATool — n8n-nodes-base.haloPSATool", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("HaloPSA (AI Tool)");
  });

  describe("Ticket operations", () => {
    it("gets all tickets", async () => {
      installFetch(mockResponse({ tickets: [{ id: 1, summary: "Test ticket", details: "Details here", agent_id: 42, targetdate: "2025-01-01" }] }));
      const { out } = await runTool({ resource: "ticket", operation: "getAll", returnAll: true }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(out[0][0].json).toMatchObject({ id: 1, summary: "Test ticket" });
    });

    it("gets a ticket by ID", async () => {
      installFetch(mockResponse({ id: 123, summary: "Specific ticket", details: "Details", agent_id: 7, targetdate: "2025-06-01" }));
      const { out } = await runTool({ resource: "ticket", operation: "get", resourceId: "123" }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect((out[0][0].json as Record<string, unknown>).id).toBe(123);
    });
  });

  describe("Client operations", () => {
    it("creates a client", async () => {
      installFetch(mockResponse({ id: 1, name: "Acme Corp" }, 201));
      const { out } = await runTool({ resource: "client", operation: "create", requestFields: { name: "Acme Corp" } }, [{}]);
      expect(out[0]).toHaveLength(1);
      expect((out[0][0].json as Record<string, unknown>).name).toBe("Acme Corp");
    });

    it("deletes a client (pass-through)", async () => {
      installFetch(mockResponse({}, 204));
      const { out } = await runTool({ resource: "client", operation: "delete", resourceId: "42" }, [{}]);
      expect(out[0]).toHaveLength(1);
    });
  });

  describe("Error handling", () => {
    it("returns error item when continueOnFail is set and credential missing", async () => {
      const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "ticket", operation: "getAll" } });
      const ctx = createExecutionContext({
        node, workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(String((out[0][0].json as Record<string, unknown>).error)).toContain("HaloPSA");
    });
  });
});
