import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.twist";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const map = new Map<string, string>([["content-type", "application/json"]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return text ? JSON.parse(text) : null; },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse({}),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
    }),
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name: string) => credentials?.[name] ?? null,
  });
}

describe(`Twist (${TYPE})`, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("creates a thread in a channel", async () => {
    const responseBody = { id: 42, title: "Hello from n8n", content: "This is a test thread" };
    installFetch({
      "POST https://api.twist.com/api/v3/threads/add": mockResponse(responseBody),
    });

    const node: INode = {
      id: "1",
      name: "Twist",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "thread",
        operation: "create",
        channelId: 12345,
        title: "Hello from n8n",
        content: "This is a test thread",
      },
    };

    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = makeCtx(items, node, false, {
      twistOAuth2Api: { accessToken: "test-token" },
    });

    const executor = getExecutor(TYPE)!;
    const [out] = await executor(ctx, node);

    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(responseBody);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.twist.com/api/v3/threads/add");
    const parsedBody = JSON.parse(calls[0].body!);
    expect(parsedBody.channel_id).toBe(12345);
    expect(parsedBody.title).toBe("Hello from n8n");
    expect(parsedBody.content).toBe("This is a test thread");
  });

  it("lists all channels in a workspace", async () => {
    const channels = [
      { id: 1, name: "general" },
      { id: 2, name: "random" },
    ];
    installFetch({
      "POST https://api.twist.com/api/v3/channels/get": mockResponse(channels),
    });

    const node: INode = {
      id: "2",
      name: "Twist",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "channel",
        operation: "getAll",
        workspaceId: 42,
      },
    };

    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = makeCtx(items, node, false, {
      twistOAuth2Api: { accessToken: "test-token" },
    });

    const executor = getExecutor(TYPE)!;
    const [out] = await executor(ctx, node);

    expect(out).toHaveLength(2);
    expect(out[0].json).toEqual(channels[0]);
    expect(out[1].json).toEqual(channels[1]);
    const parsedBody = JSON.parse(calls[0].body!);
    expect(parsedBody.workspace_id).toBe(42);
  });

  it("creates a comment on a thread", async () => {
    const responseBody = { id: 99, thread_id: 9999, content: "A new comment" };
    installFetch({
      "POST https://api.twist.com/api/v3/comments/add": mockResponse(responseBody),
    });

    const node: INode = {
      id: "3",
      name: "Twist",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "comment",
        operation: "create",
        threadId: 9999,
        content: "A new comment",
      },
    };

    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = makeCtx(items, node, false, {
      twistOAuth2Api: { accessToken: "test-token" },
    });

    const executor = getExecutor(TYPE)!;
    const [out] = await executor(ctx, node);

    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(responseBody);
    const parsedBody = JSON.parse(calls[0].body!);
    expect(parsedBody.thread_id).toBe(9999);
    expect(parsedBody.content).toBe("A new comment");
  });

  it("sends a message in a conversation", async () => {
    const responseBody = { id: 10, conversation_id: 777, content: "Direct message" };
    installFetch({
      "POST https://api.twist.com/api/v3/conversations/messages/add": mockResponse(responseBody),
    });

    const node: INode = {
      id: "4",
      name: "Twist",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "messageConversation",
        operation: "create",
        conversationId: 777,
        content: "Direct message",
      },
    };

    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = makeCtx(items, node, false, {
      twistOAuth2Api: { accessToken: "test-token" },
    });

    const executor = getExecutor(TYPE)!;
    const [out] = await executor(ctx, node);

    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(responseBody);
    const parsedBody = JSON.parse(calls[0].body!);
    expect(parsedBody.conversation_id).toBe(777);
    expect(parsedBody.content).toBe("Direct message");
  });

  it("handles API errors with continueOnFail", async () => {
    installFetch(
      {},
      mockResponse({ error_code: 404, error_string: "Channel not found", error_uuid: "abc-123" }, { status: 404 }),
    );

    const node: INode = {
      id: "5",
      name: "Twist",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "channel",
        operation: "get",
        channelId: 0,
      },
    };

    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = makeCtx(items, node, true, {
      twistOAuth2Api: { accessToken: "test-token" },
    });

    const executor = getExecutor(TYPE)!;
    const [out] = await executor(ctx, node);

    expect(out).toHaveLength(1);
    expect(out[0].json).toHaveProperty("error");
  });

  it("throws when credential is missing", async () => {
    const node: INode = {
      id: "6",
      name: "Twist",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "thread",
        operation: "create",
      },
    };

    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx = makeCtx(items, node, false);

    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/credential/i);
  });
});
