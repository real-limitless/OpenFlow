import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.discord";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return text ? JSON.parse(text) : null;
    },
    async text() {
      return text;
    },
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
  fallback: ReturnType<typeof mockResponse> = mockResponse({ ok: true }),
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
    typeVersion?: number;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: opts?.typeVersion ?? 2,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { discordBotApi: { botToken: "bot-token-123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue discord — n8n-nodes-base.discord", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Discord");
  });

  it("V1 sends basic webhook message", async () => {
    installFetch({
      "POST https://discord.com/api/webhooks/123/TOKEN": mockResponse(null, { status: 204 }),
    });
    const out = await run(
      {
        webhookUri: "https://discord.com/api/webhooks/123/TOKEN",
        text: "Hello World!",
        options: {},
      },
      [{}],
      { typeVersion: 1, credentials: {} },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body as string)).toEqual({ content: "Hello World!" });
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("V1 sends with embeds", async () => {
    installFetch({
      "POST https://discord.com/api/webhooks/123/TOKEN": mockResponse(null, { status: 204 }),
    });
    const out = await run(
      {
        webhookUri: "https://discord.com/api/webhooks/123/TOKEN",
        text: "",
        options: {
          embeds: '[{"title": "Test", "description": "Body", "color": 16711680}]',
        },
      },
      [{}],
      { typeVersion: 1, credentials: {} },
    );
    expect(out[0][0].json).toEqual({ success: true });
    const body = JSON.parse(calls[0].body as string);
    expect(body.embeds).toEqual([{ title: "Test", description: "Body", color: 16711680 }]);
  });

  it("V2 sends message (botToken, to channel)", async () => {
    installFetch({
      "POST https://discord.com/api/v10/channels/987654321/messages": mockResponse({
        id: "msg1",
        channel_id: "987654321",
        content: "Hello from bot!",
      }),
    });
    const out = await run({
      authentication: "botToken",
      resource: "message",
      operation: "send",
      guildId: { mode: "id", value: "123456789" },
      sendTo: "channel",
      channelId: { mode: "id", value: "987654321" },
      content: "Hello from bot!",
      options: {},
    });
    expect(out[0][0].json).toMatchObject({
      id: "msg1",
      channel_id: "987654321",
      content: "Hello from bot!",
    });
    expect(calls[0].headers.Authorization).toBe("Bot bot-token-123");
  });

  it("V2 sends with embed fixedCollection", async () => {
    installFetch({
      "POST https://discord.com/api/v10/channels/987654321/messages": mockResponse({
        id: "msg2",
        channel_id: "987654321",
        content: "Check this embed",
        embeds: [{ title: "Hello", description: "World", color: 0x3498db }],
      }),
    });
    const out = await run({
      authentication: "botToken",
      resource: "message",
      operation: "send",
      guildId: { mode: "id", value: "123456789" },
      sendTo: "channel",
      channelId: { mode: "id", value: "987654321" },
      content: "Check this embed",
      embeds: {
        values: [
          {
            inputMethod: "fields",
            title: "Hello",
            description: "World",
            color: "#3498db",
          },
        ],
      },
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent.embeds[0]).toMatchObject({
      title: "Hello",
      description: "World",
      color: 0x3498db,
    });
    expect(out[0][0].json).toHaveProperty("embeds");
  });

  it("V2 creates channel", async () => {
    installFetch({
      "POST https://discord.com/api/v10/guilds/123456789/channels": mockResponse({
        id: "ch1",
        name: "new-channel",
        type: 0,
        nsfw: false,
      }),
    });
    const out = await run({
      authentication: "botToken",
      resource: "channel",
      operation: "create",
      guildId: { mode: "id", value: "123456789" },
      name: "new-channel",
      type: "0",
      options: { nsfw: false, rate_limit_per_user: 5 },
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent).toMatchObject({
      name: "new-channel",
      type: 0,
      nsfw: false,
      rate_limit_per_user: 5,
    });
    expect(out[0][0].json).toMatchObject({
      id: "ch1",
      name: "new-channel",
      type: 0,
      nsfw: false,
    });
  });

  it("V2 get many messages (simplified)", async () => {
    installFetch({
      "GET https://discord.com/api/v10/channels/987654321/messages?limit=10": mockResponse([
        {
          id: "m1",
          channel_id: "987654321",
          author: { id: "u1" },
          content: "hi",
          timestamp: "2024-01-01T00:00:00.000Z",
          type: 0,
          extra: "drop-me",
        },
      ]),
    });
    const out = await run({
      authentication: "botToken",
      resource: "message",
      operation: "getAll",
      guildId: { mode: "id", value: "123456789" },
      channelId: { mode: "id", value: "987654321" },
      returnAll: false,
      limit: 10,
      options: { simplify: true },
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      id: "m1",
      channel_id: "987654321",
      author: { id: "u1" },
      content: "hi",
      timestamp: "2024-01-01T00:00:00.000Z",
      type: 0,
    });
    expect(out[0][0].json).not.toHaveProperty("extra");
  });

  it("V2 adds role to member", async () => {
    installFetch({
      "PUT https://discord.com/api/v10/guilds/123456789/members/555666777/roles/888999000":
        mockResponse(null, { status: 204 }),
    });
    const out = await run({
      authentication: "botToken",
      resource: "member",
      operation: "roleAdd",
      guildId: { mode: "id", value: "123456789" },
      userId: { mode: "id", value: "555666777" },
      role: ["888999000"],
    });
    expect(out[0][0].json).toEqual({ success: true });
    expect(calls[0].method).toBe("PUT");
  });

  it("V2 sendAndWait posts approval components", async () => {
    installFetch({
      "POST https://discord.com/api/v10/channels/987654321/messages": mockResponse({
        id: "wait1",
        channel_id: "987654321",
        content: "Approve this?\n\n_Sent via n8n_",
        components: [{ type: 1 }],
      }),
    });
    const out = await run({
      authentication: "botToken",
      resource: "message",
      operation: "sendAndWait",
      guildId: { mode: "id", value: "123456789" },
      sendTo: "channel",
      channelId: { mode: "id", value: "987654321" },
      content: "Approve this?",
      responseType: "approval",
      options: { limitWaitTime: false, appendAttribution: true },
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent.content).toContain("Approve this?");
    expect(sent.content).toContain("Sent via n8n");
    expect(sent.components).toBeDefined();
    expect(out[0][0].json).toMatchObject({ id: "wait1" });
  });

  it("continueOnFail returns error items", async () => {
    installFetch({
      "POST https://discord.com/api/v10/channels/valid/messages": mockResponse({
        id: "111",
        content: "Test",
      }),
      "POST https://discord.com/api/v10/channels/invalid/messages": mockResponse(
        { message: "Unknown Channel", code: 10003 },
        { status: 404 },
      ),
    });
    const out = await run(
      {
        authentication: "botToken",
        resource: "message",
        operation: "send",
        sendTo: "channel",
        channelId: "={{ $json.channelId }}",
        content: "Test",
      },
      [{ json: { channelId: "valid" } }, { json: { channelId: "invalid" } }],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "111" });
    expect(out[0][1].json).toHaveProperty("error");
  });

  it("throws when guildId missing for channel create", async () => {
    await expect(
      run({
        authentication: "botToken",
        resource: "channel",
        operation: "create",
        name: "test",
        type: "0",
      }),
    ).rejects.toThrow("Discord: guildId is required");
  });
});
