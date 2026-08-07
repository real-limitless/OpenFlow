import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.matrixTool";

function mockResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(responses?: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>>) {
  responseQueue = responses ? (Array.isArray(responses) ? [...responses] : [responses]) : [mockResponse({})];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      calls.push({
        url: typeof url === "string" ? url : String(url),
        method: (init?.method as string) ?? "GET",
        body: init?.body as string | undefined,
      });
      const resp = responseQueue.shift() ?? mockResponse({});
      return resp as unknown as Response;
    }),
  );
}

function restoreFetch() {
  vi.unstubAllGlobals();
}

describe("matrixTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("has a valid description", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc!.name).toBe(TYPE);
  });

  it("message:send sends a plain text message", async () => {
    const eventId = "$event-abc123";
    installFetch(mockResponse({ event_id: eventId }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "message",
        operation: "create",
        roomId: "!myroom:matrix.org",
        text: "Hello from OpenFlow",
        messageType: "m.text",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf-1", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { text: "Hello from OpenFlow" }, pairedItem: { item: 0, input: 0 } }],
      continueOnFail: false,
      getCredential: async () => ({
        homeserverUrl: "https://matrix.org",
        accessToken: "test-token",
      }),
    });
    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(1);
    expect(out[0].json.event_id).toBe(eventId);
  });

  it("account:me returns account info", async () => {
    installFetch(mockResponse({ user_id: "@testuser:matrix.org" }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "account",
        operation: "me",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf-1", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {}, pairedItem: { item: 0, input: 0 } }],
      continueOnFail: false,
      getCredential: async () => ({
        homeserverUrl: "https://matrix.org",
        accessToken: "test-token",
      }),
    });
    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(1);
    expect(out[0].json.user_id).toBe("@testuser:matrix.org");
  });

  it("room:invite invites a user", async () => {
    installFetch(mockResponse({}));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "room",
        operation: "invite",
        roomId: "!myroom:matrix.org",
        userId: "@friend:matrix.org",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf-1", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {}, pairedItem: { item: 0, input: 0 } }],
      continueOnFail: false,
      getCredential: async () => ({
        homeserverUrl: "https://matrix.org",
        accessToken: "test-token",
      }),
    });
    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(1);
  });

  it("message:getAll fetches room messages with filter", async () => {
    installFetch(mockResponse({
      chunk: [
        { event_id: "$e1", content: { body: "msg1" } },
        { event_id: "$e2", content: { body: "msg2" } },
      ],
    }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "message",
        operation: "getAll",
        roomId: "!myroom:matrix.org",
        limit: 10,
        otherOptions: { filter: JSON.stringify({ "contains_url": true, "types": ["m.room.message"] }) },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf-1", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {}, pairedItem: { item: 0, input: 0 } }],
      continueOnFail: false,
      getCredential: async () => ({
        homeserverUrl: "https://matrix.org",
        accessToken: "test-token",
      }),
    });
    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(2);
  });

  it("room:kick returns original item on continueOnFail", async () => {
    installFetch(mockResponse({ errcode: "M_FORBIDDEN", error: "You are not a room admin" }, { status: 403 }));

    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "room",
        operation: "kick",
        roomId: "!myroom:matrix.org",
        userId: "@badactor:matrix.org",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf-1", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {}, pairedItem: { item: 0, input: 0 } }],
      continueOnFail: true,
      getCredential: async () => ({
        homeserverUrl: "https://matrix.org",
        accessToken: "test-token",
      }),
    });
    const [out] = await executor(ctx, node);
    expect(out).toHaveLength(1);
  });
});
