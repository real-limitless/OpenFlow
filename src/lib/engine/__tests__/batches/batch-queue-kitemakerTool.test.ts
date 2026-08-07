import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.kitemakerTool";

interface FetchCall { url: string; method: string; }

let calls: FetchCall[];

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 201 ? "Created" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
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

function runTool(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = createExecutionContext({
    node,
    workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => inputItems.map((item) => ({ json: item })),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ accessToken: "test-token" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error("no executor");
  return executor(ctx, node).then((out) => ({ out, ctx }));
}

describe("batch-queue kitemakerTool — n8n-nodes-base.kitemakerTool", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Kitemaker Tool");
  });

  it("gets organization", async () => {
    installFetch(mockResponse({ id: "org-123", name: "My Org", createdAt: "2023-01-01T00:00:00.000Z", updatedAt: "2023-06-01T00:00:00.000Z" }));
    const { out } = await runTool({ resource: "organization", operation: "get" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "org-123", name: "My Org" });
    expect(calls[0].url).toContain("/organization");
  });

  it("creates a work item", async () => {
    installFetch(mockResponse({
      id: "wi-456",
      number: 42,
      title: "New bug fix",
      description: "Fixes the login issue",
      status: { id: "abc123", name: "In Progress" },
      space: { id: "space-1", name: "Engineering" },
      labels: [],
      effort: "Medium",
      impact: "Small",
      createdAt: "2024-01-15T10:30:00.000Z",
      updatedAt: "2024-01-15T10:30:00.000Z",
    }, 201));
    const { out } = await runTool(
      {
        resource: "workItem",
        operation: "create",
        title: "={{$json.myTitle}}",
        statusId: "abc123",
        description: "={{$json.myDescription}}",
        effort: "medium",
        impact: "small",
      },
      [{ myTitle: "New bug fix", myDescription: "Fixes the login issue" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "wi-456", title: "New bug fix" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/workitem");
  });

  it("lists work items", async () => {
    installFetch(mockResponse([
      { id: "wi-1", label: "Fix login bug" },
      { id: "wi-2", label: "Add dark mode" },
    ]));
    const { out } = await runTool({ resource: "workItem", operation: "getAll", spaceId: "space-1", returnAll: false, limit: 10 }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect(out[0][0].json).toHaveLength(2);
    expect(calls[0].url).toContain("/metadata/workitems");
  });

  it("updates a work item", async () => {
    installFetch(mockResponse({
      id: "wi-456",
      number: 42,
      title: "Updated: Fix login bug",
      status: { id: "abc123", name: "In Progress" },
      space: { id: "space-1", name: "Engineering" },
      labels: [],
      effort: "Medium",
      impact: "Small",
      createdAt: "2024-01-15T10:30:00.000Z",
      updatedAt: "2024-01-15T11:00:00.000Z",
    }));
    const { out } = await runTool(
      { resource: "workItem", operation: "update", workItemId: "wi-456", title: "={{$json.newTitle}}" },
      [{ newTitle: "Updated: Fix login bug" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "wi-456", title: "Updated: Fix login bug" });
    expect(calls[0].method).toBe("PUT");
  });

  it("returns error item when continueOnFail is set and credential missing", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "organization", operation: "get" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({ httpCode: 500 });
  });
});
