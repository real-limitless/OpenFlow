import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.rocketchat";

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
  rocketchatApi: {
    domain: "https://chat.example.com",
    userId: "user123",
    authKey: "token-abc-456",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue rocketchat — n8n-nodes-base.rocketchat", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Rocket.Chat");
  });

  it("post message to a public channel", async () => {
    installFetch({
      "POST https://chat.example.com/api/v1/chat.postMessage": mockResponse({
        success: true,
        channel: "general",
        message: { msg: "Hello from OpenFlow", rid: "GENERAL" },
      }),
    });
    const out = await run({
      resource: "chat",
      operation: "postMessage",
      channel: "#general",
      text: "Hello from OpenFlow",
      options: {},
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://chat.example.com/api/v1/chat.postMessage");
    expect(calls[0].headers["X-Auth-Token"]).toBe("token-abc-456");
    expect(calls[0].headers["X-User-Id"]).toBe("user123");
    const sent = JSON.parse(calls[0].body as string);
    expect(sent).toMatchObject({ channel: "#general", text: "Hello from OpenFlow" });
    expect(out[0][0].json).toMatchObject({
      success: true,
      channel: "general",
      message: { msg: "Hello from OpenFlow" },
    });
  });

  it("post message with an attachment", async () => {
    installFetch({
      "POST https://chat.example.com/api/v1/chat.postMessage": mockResponse({
        success: true,
        channel: "general",
        message: { msg: "Check this out", rid: "GENERAL", attachments: [{ title: "Status Update" }] },
      }),
    });
    const out = await run({
      resource: "chat",
      operation: "postMessage",
      channel: "#general",
      text: "Check this out",
      attachments: {
        attachmentsFields: [
          {
            title: "Status Update",
            text: "All systems operational",
            color: "#00ff00",
            fields: {
              fieldsValues: [
                { title: "Uptime", value: "99.9%", short: true },
                { title: "Latency", value: "12ms", short: true },
              ],
            },
          },
        ],
      },
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0]).toMatchObject({
      title: "Status Update",
      text: "All systems operational",
      color: "#00ff00",
    });
    expect(sent.attachments[0].fields).toHaveLength(2);
    expect(sent.attachments[0].fields[0]).toMatchObject({ title: "Uptime", value: "99.9%", short: true });
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("post message with JSON parameters mode", async () => {
    installFetch({
      "POST https://chat.example.com/api/v1/chat.postMessage": mockResponse({
        success: true,
        channel: "general",
        message: { msg: "JSON mode message" },
      }),
    });
    const out = await run({
      resource: "chat",
      operation: "postMessage",
      channel: "#general",
      text: "JSON mode message",
      jsonParameters: true,
      attachmentsJson: '[{"title":"Alert","text":"Something happened"}]',
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0]).toMatchObject({ title: "Alert", text: "Something happened" });
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("post message with options (alias, avatar, emoji)", async () => {
    installFetch({
      "POST https://chat.example.com/api/v1/chat.postMessage": mockResponse({
        success: true,
        channel: "general",
        message: { msg: "With options" },
      }),
    });
    const out = await run({
      resource: "chat",
      operation: "postMessage",
      channel: "#general",
      text: "With options",
      options: {
        alias: "Bot",
        avatar: "https://example.com/avatar.png",
        emoji: ":robot:",
      },
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent.alias).toBe("Bot");
    expect(sent.avatar).toBe("https://example.com/avatar.png");
    expect(sent.emoji).toBe(":robot:");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("throws on missing credential", async () => {
    await expect(
      run(
        { resource: "chat", operation: "postMessage", channel: "#general", text: "test" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow("Rocket.Chat: rocketchatApi credential is required");
  });

  it("throws on API error", async () => {
    installFetch({
      "POST https://chat.example.com/api/v1/chat.postMessage": mockResponse(
        { success: false, error: "invalid-channel", errorType: "error-invalid-channel" },
        { status: 400 },
      ),
    });
    await expect(
      run({
        resource: "chat",
        operation: "postMessage",
        channel: "#nonexistent-channel-12345",
        text: "This should fail",
      }),
    ).rejects.toThrow("invalid-channel");
  });

  it("continueOnFail returns error items", async () => {
    installFetch({
      "POST https://chat.example.com/api/v1/chat.postMessage": mockResponse(
        { success: false, error: "invalid-channel", errorType: "error-invalid-channel" },
        { status: 400 },
      ),
    });
    const out = await run(
      {
        resource: "chat",
        operation: "postMessage",
        channel: "#nonexistent-channel-12345",
        text: "This should fail gracefully",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(String(out[0][0].json.error)).toContain("invalid-channel");
  });

  it("processes multiple input items", async () => {
    installFetch({
      "POST https://chat.example.com/api/v1/chat.postMessage": mockResponse({
        success: true,
        channel: "general",
        message: { msg: "multi" },
      }),
    });
    const out = await run(
      {
        resource: "chat",
        operation: "postMessage",
        channel: "#general",
        text: "multi",
        options: {},
      },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});