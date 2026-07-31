import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mondayCom";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 204 ? "No Content" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({ data: {} }),
) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    const next = responseQueue.shift() ?? mockResponse({ data: {} });
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

describe("batch-queue mondayCom — n8n-nodes-base.mondayCom", () => {
  beforeEach(() => {
    installFetch(mockResponse({ data: { create_board: { id: "board_001", name: "Test Board" } } }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("monday.com");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.mondayCom")).toBe(getExecutor(TYPE));
  });

  describe("board create", () => {
    it("creates a board via GraphQL mutation", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "board",
          operation: "create",
          name: "Test Board",
          kind: "public",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "board_001", name: "Test Board" });
      const call = lastCall();
      expect(call.url).toBe("https://api.monday.com/v2");
      expect(call.method).toBe("POST");
      expect(call.body).toContain("create_board");
      expect(call.body).toContain("Test Board");
      expect(call.body).toContain("public");
    });
  });

  describe("board get", () => {
    it("gets a board by ID", async () => {
      installFetch(mockResponse({ data: { boards: [{ id: "board_001", name: "My Board", board_kind: "public" }] } }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "board",
          operation: "get",
          boardId: "board_001",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "board_001", name: "My Board" });
      expect(lastCall().body).toContain("boards(ids:");
    });
  });

  describe("board getAll", () => {
    it("returns all boards", async () => {
      installFetch(mockResponse({ data: { boards: [{ id: "b1", name: "Board 1" }, { id: "b2", name: "Board 2" }] } }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "board",
          operation: "getAll",
          returnAll: true,
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: "b1" });
      expect(out[0][1].json).toMatchObject({ id: "b2" });
    });
  });

  describe("board item create", () => {
    it("creates a board item with expressions", async () => {
      installFetch(mockResponse({ data: { create_item: { id: "item_001", name: "New Task" } } }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "boardItem",
          operation: "create",
          boardId: "={{ $json.boardId }}",
          groupId: "={{ $json.groupId }}",
          name: "={{ $json.itemName }}",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { boardId: "123", groupId: "topics", itemName: "New Task" } }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "item_001", name: "New Task" });
      const body = lastCall().body;
      expect(body).toContain("create_item");
      expect(body).toContain("123");
      expect(body).toContain("topics");
      expect(body).toContain("New Task");
    });
  });

  describe("board item change column value", () => {
    it("changes a column value", async () => {
      installFetch(mockResponse({ data: { change_column_value: { id: "item_001", name: "Task" } } }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "boardItem",
          operation: "changeColumnValue",
          boardId: "1234567890",
          itemId: "={{ $json.itemId }}",
          columnId: "status",
          value: '{"label": "Done"}',
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { itemId: "9876543210" } }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "item_001", name: "Task" });
      const body = lastCall().body;
      expect(body).toContain("change_column_value");
      expect(body).toContain("9876543210");
    });
  });

  describe("board item getAll with limit", () => {
    it("returns items with limit", async () => {
      installFetch(mockResponse({
        data: { boards: [{ items_page: { items: [{ id: "i1", name: "Item 1" }, { id: "i2", name: "Item 2" }] } }] },
      }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "boardItem",
          operation: "getAll",
          boardId: "1234567890",
          returnAll: false,
          limit: 10,
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: "i1" });
      expect(lastCall().body).toContain("items_page");
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true", async () => {
      installFetch(mockResponse({ errors: [{ message: "Board not found" }] }, { status: 200 }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "board",
          operation: "get",
          boardId: "nonexistent",
          continueOnFail: true,
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: "monday.com request failed: Board not found" });
    });
  });
});