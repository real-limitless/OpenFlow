import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.zulip";

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
      const hdrs: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) hdrs[k] = v;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        headers: hdrs,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
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
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = {
  zulipApi: {
    url: "https://zulip.example.com",
    email: "bot@example.com",
    apiKey: "test-api-key",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue zulip — n8n-nodes-base.zulip", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Zulip");
  });

  it("send private message", async () => {
    installFetch({
      "POST https://zulip.example.com/api/v1/messages": mockResponse({
        id: 123,
        msg: "",
        result: "success",
      }),
    });
    const [out] = await run({
      resource: "message",
      operation: "sendPrivate",
      to: ["user@example.com"],
      content: "Hello from n8n",
    });
    expect(out[0].json).toEqual({ id: 123, msg: "", result: "success" });
    expect(calls.length).toBe(1);
    const call = calls[0];
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://zulip.example.com/api/v1/messages");
    expect(call.headers["Authorization"]).toMatch(/^Basic /);
    const body = JSON.parse(call.body!);
    expect(body.type).toBe("private");
    expect(body.to).toBe("user@example.com");
    expect(body.content).toBe("Hello from n8n");
  });

  it("send stream message", async () => {
    installFetch({
      "POST https://zulip.example.com/api/v1/messages": mockResponse({
        id: 124,
        msg: "",
        result: "success",
      }),
    });
    const [out] = await run({
      resource: "message",
      operation: "sendStream",
      stream: 1,
      topic: "general",
      content: "Stream test",
    });
    expect(out[0].json).toEqual({ id: 124, msg: "", result: "success" });
    const call = calls[0];
    const body = JSON.parse(call.body!);
    expect(body.type).toBe("stream");
    expect(body.stream).toBe(1);
    expect(body.topic).toBe("general");
    expect(body.content).toBe("Stream test");
  });

  it("get all users — unwrapped members", async () => {
    installFetch({
      "GET https://zulip.example.com/api/v1/users": mockResponse({
        members: [
          { email: "alice@example.com", user_id: 1, full_name: "Alice" },
        ],
        result: "success",
        msg: "",
      }),
    });
    const [out] = await run({
      resource: "user",
      operation: "getAll",
      additionalFields: {},
    });
    expect(out).toHaveLength(1);
    expect(out[0].json).toMatchObject({
      email: "alice@example.com",
      user_id: 1,
      full_name: "Alice",
    });
  });

  it("get all streams — unwrapped streams array", async () => {
    installFetch({
      "GET https://zulip.example.com/api/v1/streams": mockResponse({
        streams: [
          { stream_id: 1, name: "general", description: "General chat" },
        ],
        result: "success",
        msg: "",
      }),
    });
    const [out] = await run({
      resource: "stream",
      operation: "getAll",
      additionalFields: {},
    });
    expect(out).toHaveLength(1);
    expect(out[0].json).toMatchObject({
      stream_id: 1,
      name: "general",
      description: "General chat",
    });
  });

  it("get subscribed streams — unwrapped subscriptions array", async () => {
    installFetch({
      "GET https://zulip.example.com/api/v1/users/me/subscriptions": mockResponse({
        subscriptions: [
          { stream_id: 1, name: "general", description: "General chat" },
        ],
        result: "success",
        msg: "",
      }),
    });
    const [out] = await run({
      resource: "stream",
      operation: "getSubscribed",
    });
    expect(out).toHaveLength(1);
    expect(out[0].json).toMatchObject({
      stream_id: 1,
      name: "general",
    });
  });

  it("create stream with subscriptions", async () => {
    installFetch({
      "POST https://zulip.example.com/api/v1/users/me/subscriptions": mockResponse({
        result: "success",
        msg: "",
        subscribed: { "test-stream": "test-stream" },
      }),
    });
    const [out] = await run({
      resource: "stream",
      operation: "create",
      subscriptions: {
        properties: [{ name: "test-stream", description: "A test stream" }],
      },
      additionalFields: { announce: true },
    });
    expect(out[0].json).toMatchObject({
      result: "success",
      subscribed: { "test-stream": "test-stream" },
    });
    const call = calls[0];
    const body = JSON.parse(call.body!);
    expect(body).toHaveProperty("subscriptions");
    const subs = JSON.parse(body.subscriptions);
    expect(subs).toEqual([{ name: "test-stream", description: "A test stream" }]);
    expect(body.announce).toBe(true);
  });

  it("upload file to message — returns uri merged with base", async () => {
    installFetch({
      "POST https://zulip.example.com/api/v1/user_uploads": mockResponse({
        id: 125,
        msg: "",
        result: "success",
        uri: "/user_uploads/abc123/file.txt",
      }),
    });
    const binaryData = btoa("hello world");
    const inputItem = {
      json: {},
      binary: {
        data: {
          data: binaryData,
          fileName: "test.txt",
          mimeType: "text/plain",
        },
      },
    };
    const [out] = await run(
      {
        resource: "message",
        operation: "updateFile",
        dataBinaryProperty: "data",
      },
      [inputItem],
    );
    expect(out[0].json).toMatchObject({
      id: 125,
      result: "success",
      uri: "https://zulip.example.com/user_uploads/abc123/file.txt",
    });
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://zulip.example.com/api/v1/user_uploads");
  });

  it("continueOnFail returns error item", async () => {
    installFetch({}, mockResponse({ msg: "Bad request" }, { status: 400 }));
    const [out] = await run(
      {
        resource: "message",
        operation: "sendPrivate",
        to: ["bad@example.com"],
        content: "Hi",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0].json).toHaveProperty("error");
    expect(String(out[0].json.error)).toMatch(/Bad request/);
  });
});
