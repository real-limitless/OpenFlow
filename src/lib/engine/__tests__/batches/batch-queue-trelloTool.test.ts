import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.trelloTool";

function mockResponse(body: unknown, init: { status?: number } = {}) {
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

interface FetchCall { url: string; method: string }

let calls: FetchCall[];

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({})) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

describe("batch-queue trelloTool — n8n-nodes-base.trelloTool", () => {
  beforeEach(() => {
    installFetch(mockResponse({ id: "card_001", name: "Test Card" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Trello (AI Tool)");
  });

  it("creates a card via POST /cards", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "card",
        operation: "create",
        listId: { __rl: true, value: "abc123list", mode: "id" },
        name: "Test Card via Tool",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { listId: "abc123list" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "card_001", name: "Test Card" });
    const call = lastCall();
    expect(call.url).toContain("/cards");
    expect(call.url).toContain("key=test-key");
    expect(call.url).toContain("token=test-token");
    expect(call.method).toBe("POST");
    expect(call.url).toContain("name=Test+Card+via+Tool");
    expect(call.url).toContain("idList=abc123list");
  });

  it("gets a board via GET /boards/{boardId}", async () => {
    installFetch(mockResponse({ id: "board_001", name: "My Board", url: "https://trello.com/b/abc" }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "board",
        operation: "get",
        boardId: { __rl: true, value: "board_001", mode: "id" },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { boardId: "board_001" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "board_001", name: "My Board" });
    const call = lastCall();
    expect(call.url).toContain("/boards/board_001");
    expect(call.method).toBe("GET");
  });

  it("adds a comment via POST /cards/{cardId}/actions/comments", async () => {
    installFetch(mockResponse({
      id: "action_001",
      type: "commentCard",
      data: { text: "Reviewed and approved", card: { id: "card123" } },
    }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "cardComment",
        operation: "create",
        cardId: { __rl: true, value: "card123", mode: "id" },
        text: "Reviewed and approved",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { cardId: "card123" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0][0].json).toMatchObject({
      id: "action_001",
      type: "commentCard",
      data: { text: "Reviewed and approved", card: { id: "card123" } },
    });
    const call = lastCall();
    expect(call.url).toContain("/cards/card123/actions/comments");
    expect(call.method).toBe("POST");
  });

  it("updates a checklist item via PUT /cards/{cardId}/checklist/{checklistId}/checkItem/{checkItemId}", async () => {
    installFetch(mockResponse({
      id: "item_001",
      name: "Subtask",
      state: "complete",
    }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "checklist",
        operation: "updateCheckItem",
        cardId: { __rl: true, value: "card123", mode: "id" },
        checklistId: "cl123",
        checkItemId: "item_001",
        state: "complete",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { cardId: "card123" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0][0].json).toMatchObject({
      id: "item_001",
      name: "Subtask",
      state: "complete",
    });
    const call = lastCall();
    expect(call.url).toContain("/cards/card123/checklist/cl123/checkItem/item_001");
    expect(call.method).toBe("PUT");
  });

  it("gets cards on a list via GET /lists/{listId}/cards", async () => {
    installFetch(mockResponse([
      { id: "card-1", name: "Card A" },
      { id: "card-2", name: "Card B" },
    ]));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "list",
        operation: "getCards",
        boardId: { __rl: true, value: "board-id-123", mode: "id" },
        listId: { __rl: true, value: "list-id-456", mode: "id" },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { boardId: "board-id-123", listId: "list-id-456" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "card-1", name: "Card A" });
    expect(out[0][1].json).toMatchObject({ id: "card-2", name: "Card B" });
    const call = lastCall();
    expect(call.url).toContain("/lists/list-id-456/cards");
    expect(call.method).toBe("GET");
  });

  it("continueOnFail returns error items", async () => {
    installFetch(mockResponse({ message: "not found" }, { status: 404 }));
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "card",
        operation: "create",
        listId: { __rl: true, value: "listId", mode: "id" },
        name: "Test",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String), code: 500 } });
  });
});
