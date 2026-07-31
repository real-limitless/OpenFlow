import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.trello";

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
}

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

describe("batch-queue trello — n8n-nodes-base.trello", () => {
  beforeEach(() => {
    installFetch(mockResponse({ id: "card_001", name: "Test Card" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Trello");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.trello")).toBe(getExecutor(TYPE));
  });

  describe("card create", () => {
    it("creates a card via POST /cards with evaluated expressions", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "card",
          operation: "create",
          listId: { __rl: true, value: "abc123list", mode: "id" },
          name: "={{ $json.cardName }}",
          additionalFields: {
            fields: [
              { name: "desc", value: "Created by automation" },
              { name: "pos", value: "top" },
            ],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { cardName: "Test Card", listId: "abc123list" } }],
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
      expect(call.url).toContain("name=Test+Card");
      expect(call.url).toContain("idList=abc123list");
      expect(call.url).toContain("desc=Created+by+automation");
      expect(call.url).toContain("pos=top");
    });
  });

  it("card create with flat additionalFields and expression evaluation", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "card",
        operation: "create",
        listId: { __rl: true, value: "={{ $json.listId }}", mode: "id" },
        name: "={{ $json.cardName }}",
        additionalFields: {
          desc: "={{ $json.description }}",
          pos: "top",
          due: "2024-12-31",
        },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { cardName: "Expr Card", listId: "exprListId", description: "From expression" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    const call = lastCall();
    expect(call.url).toContain("name=Expr+Card");
    expect(call.url).toContain("idList=exprListId");
    expect(call.url).toContain("desc=From+expression");
    expect(call.url).toContain("pos=top");
    expect(call.url).toContain("due=2024-12-31");
  });

  describe("board create", () => {
    it("creates a board via POST /boards", async () => {
      installFetch(mockResponse({
        id: "board_001",
        name: "Test Board",
        url: "https://trello.com/b/abc123",
        defaultLists: true,
      }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "board",
          operation: "create",
          name: "Test Board",
          additionalFields: {
            fields: [
              { name: "defaultLists", value: "true" },
            ],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "board_001", name: "Test Board" });
      expect(calls[calls.length - 1].url).toContain("/boards");
      expect(calls[calls.length - 1].method).toBe("POST");
    });
  });

  describe("list create", () => {
    it("creates a list via POST /boards/{boardId}/lists", async () => {
      installFetch(mockResponse({
        id: "list_001",
        name: "My List",
        idBoard: "board123",
        closed: false,
      }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "list",
          operation: "create",
          boardId: { __rl: true, value: "board123", mode: "id" },
          name: "My List",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { boardId: "board123" } }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "list_001", name: "My List", idBoard: "board123", closed: false });
      const call = lastCall();
      expect(call.url).toContain("/boards/board123/lists");
      expect(call.method).toBe("POST");
    });
  });

  describe("card comment create", () => {
    it("creates a comment via POST /cards/{cardId}/actions/comments", async () => {
      installFetch(mockResponse({
        id: "action_001",
        type: "commentCard",
        data: { text: "This is a comment", card: { id: "card123" } },
        date: "2024-01-01T00:00:00.000Z",
      }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "cardComment",
          operation: "create",
          cardId: { __rl: true, value: "card123", mode: "id" },
          text: "This is a comment",
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
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        id: "action_001",
        type: "commentCard",
        data: { text: "This is a comment", card: { id: "card123" } },
      });
      const call = lastCall();
      expect(call.url).toContain("/cards/card123/actions/comments");
      expect(call.method).toBe("POST");
    });
  });

  describe("label add and remove", () => {
    it("adds a label to a card via POST /cards/{cardId}/idLabels", async () => {
      installFetch(mockResponse([
        { id: "label456", name: "Test Label", color: "green" },
      ]));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "label",
          operation: "addLabel",
          cardId: { __rl: true, value: "card123", mode: "id" },
          labelId: "label456",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { cardId: "card123", labelId: "label456" } }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      const call = lastCall();
      expect(call.url).toContain("/cards/card123/idLabels");
      expect(call.method).toBe("POST");
    });

    it("removes a label from a card via DELETE /cards/{cardId}/idLabels/{labelId}", async () => {
      installFetch(mockResponse({ success: true }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "label",
          operation: "removeLabel",
          cardId: { __rl: true, value: "card123", mode: "id" },
          labelId: "label456",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { cardId: "card123", labelId: "label456" } }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key", apiToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await executor(ctx, node);
      const call = lastCall();
      expect(call.url).toContain("/cards/card123/idLabels/label456");
      expect(call.method).toBe("DELETE");
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true", async () => {
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
});