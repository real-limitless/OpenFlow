import { describe, it, expect, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mondayComTool";

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

describe("batch-queue mondayComTool — n8n-nodes-base.mondayComTool", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("monday.com (AI Tool)");
  });

  it("gets all boards", async () => {
    installFetch(mockResponse({ data: { boards: [{ id: "1234567890", name: "My Board", state: "active", board_kind: "public" }] } }));
    const { out } = await runTool({ resource: "Board", operation: "Get all boards", options: { limit: 5, state: "active" } }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ data: { boards: [{ id: "1234567890", name: "My Board", state: "active", board_kind: "public" }] } });
  });

  it("creates an item in a board's group", async () => {
    installFetch(mockResponse({ data: { create_item: { id: "9876543210", name: "New Task" } } }));
    const { out } = await runTool({ resource: "Board Item", operation: "Create an item in a board's group", boardId: "1234567890", groupId: "topics", itemName: "New Task", columnValues: '{"status":{"index":0}}' }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ data: { create_item: { id: "9876543210" } } });
  });

  it("changes a column value for a board item", async () => {
    installFetch(mockResponse({ data: { change_column_value: { id: "9876543210", name: "Task" } } }));
    const { out } = await runTool({ resource: "Board Item", operation: "Change a column value for a board item", boardId: "1234567890", itemId: "9876543210", columnId: "status", columnValue: '{"label":"Working on it"}' }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ data: { change_column_value: { id: "9876543210" } } });
  });

  it("gets items by column value", async () => {
    installFetch(mockResponse({ data: { items_by_column_values: [{ id: "item-1", name: "Matching Task" }] } }));
    const { out } = await runTool({ resource: "Board Item", operation: "Get items by column value", boardId: "1234567890", columnId: "status", columnValueSearch: "Working on it" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ data: { items_by_column_values: [{ id: "item-1" }] } });
  });

  it("throws on unsupported resource/operation", async () => {
    await expect(runTool({ resource: "Board", operation: "NonExistent" }, [{}])).rejects.toThrow("monday.com Tool: unsupported resource/operation");
  });

  it("handles continueOnFail", async () => {
    installFetch(mockResponse({}, 500));
    const { out } = await runTool({ resource: "Board", operation: "Get all boards" }, [{}], { continueOnFail: true });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
