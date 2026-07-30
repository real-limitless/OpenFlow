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
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
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
      return JSON.parse(text);
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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ success: true })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return nextResponse;
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
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = {
  discordBotApi: { accessToken: "bot-token-123" },
  discordOAuth2Api: { accessToken: "oauth2-token-456" },
  discordWebhookApi: { webhookUri: "https://discord.com/api/webhooks/123/abc" },
};

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

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.discord")).toBe(canonical);
  });

  it("V1 webhook send returns success", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run(
      {
        webhookUri: "https://discord.com/api/webhooks/123/abc",
        text: "Hello from n8n!",
        options: {},
      },
      [{}],
      { credentials: {} },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://discord.com/api/webhooks/123/abc");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ content: "Hello from n8n!" });
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("V2 bot token — message send to channel", async () => {
    installFetch(
      mockResponse({
        id: "123456789012345678",
        channel_id: "896347036838936577",
        author: { id: "987654321098765432", username: "MyBot", bot: true },
        content: "Deployed v1.2.3",
        timestamp: "2024-01-15T10:30:00.000Z",
      }),
    );
    const out = await run(
      {
        authentication: "botToken",
        resource: "message",
        operation: "send",
        guildId: { mode: "id", value: "896347036838936576" },
        sendTo: "channel",
        channelId: { mode: "id", value: "896347036838936577" },
        content: "={{ $json.text }}",
        options: { tts: false },
        embeds: { values: [] },
        files: { values: [] },
      },
      [{ text: "Deployed v1.2.3" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://discord.com/api/v10/channels/896347036838936577/messages");
    expect(calls[0].headers["Authorization"]).toBe("Bot bot-token-123");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ content: "Deployed v1.2.3", tts: false });
    expect(out[0][0].json).toMatchObject({
      id: "123456789012345678",
      channel_id: "896347036838936577",
      content: "Deployed v1.2.3",
      author: { id: "987654321098765432", username: "MyBot", bot: true },
      timestamp: "2024-01-15T10:30:00.000Z",
    });
  });

  it("V2 bot token — message send with embeds (fields mode)", async () => {
    installFetch(
      mockResponse({
        id: "111",
        channel_id: "896347036838936577",
        content: "",
        embeds: [{ title: "Alert", description: "High CPU usage", color: 16711680 }],
      }),
    );
    const out = await run(
      {
        authentication: "botToken",
        resource: "message",
        operation: "send",
        guildId: { mode: "id", value: "896347036838936576" },
        sendTo: "channel",
        channelId: { mode: "id", value: "896347036838936577" },
        content: "",
        options: {},
        embeds: {
          values: [
            {
              inputMethod: "fields",
              title: "={{ $json.title }}",
              description: "={{ $json.description }}",
              color: 16711680,
              timestamp: "={{ new Date().toISOString() }}",
            },
          ],
        },
        files: { values: [] },
      },
      [{ title: "Alert", description: "High CPU usage" }],
    );

    expect(calls).toHaveLength(1);
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.embeds).toHaveLength(1);
    expect(sentBody.embeds[0].title).toBe("Alert");
    expect(sentBody.embeds[0].description).toBe("High CPU usage");
    expect(sentBody.embeds[0].color).toBe(16711680);
    expect(sentBody.embeds[0].timestamp).toBeTruthy();
    expect(out[0][0].json).toMatchObject({
      embeds: [{ title: "Alert", description: "High CPU usage", color: 16711680 }],
    });
  });

  it("V2 OAuth2 — channel get many with filter", async () => {
    installFetch(
      mockResponse([
        { id: "100", name: "general", type: 0, guild_id: "896347036838936576" },
        { id: "101", name: "voice-chat", type: 2, guild_id: "896347036838936576" },
        { id: "102", name: "category-1", type: 4, guild_id: "896347036838936576" },
      ]),
    );
    const out = await run(
      {
        authentication: "oAuth2",
        resource: "channel",
        operation: "getAll",
        guildId: { mode: "id", value: "896347036838936576" },
        returnAll: true,
        options: { filter: ["0", "2"], simplify: true },
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain(
      "https://discord.com/api/v10/guilds/896347036838936576/channels",
    );
    expect(calls[0].headers["Authorization"]).toBe("Bearer oauth2-token-456");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({
      id: "100",
      name: "general",
      type: 0,
      guild_id: "896347036838936576",
    });
    expect(out[0][1].json).toMatchObject({
      id: "101",
      name: "voice-chat",
      type: 2,
      guild_id: "896347036838936576",
    });
  });

  it("V2 bot token — member role add", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run(
      {
        authentication: "botToken",
        resource: "member",
        operation: "roleAdd",
        guildId: { mode: "id", value: "896347036838936576" },
        userId: { mode: "id", value: "={{ $json.userId }}" },
        role: ["111111111111111111", "222222222222222222"],
      },
      [{ userId: "786953432728469534" }],
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(
      "https://discord.com/api/v10/guilds/896347036838936576/members/786953432728469534/roles/111111111111111111",
    );
    expect(calls[1].method).toBe("PUT");
    expect(calls[1].url).toBe(
      "https://discord.com/api/v10/guilds/896347036838936576/members/786953432728469534/roles/222222222222222222",
    );
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("V2 webhook — send with wait", async () => {
    installFetch(
      mockResponse({
        id: "999",
        content: "Webhook test",
        author: { username: "n8n Bot" },
      }),
    );
    const out = await run(
      {
        authentication: "webhook",
        operation: "sendLegacy",
        content: "={{ $json.msg }}",
        options: { wait: true, username: "n8n Bot" },
        embeds: { values: [] },
        files: { values: [] },
      },
      [{ msg: "Webhook test" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://discord.com/api/webhooks/123/abc?wait=true");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ content: "Webhook test", username: "n8n Bot" });
    expect(out[0][0].json).toMatchObject({
      id: "999",
      content: "Webhook test",
      author: { username: "n8n Bot" },
    });
  });

  it("throws when bot token credential is missing", async () => {
    await expect(
      run(
        {
          authentication: "botToken",
          resource: "message",
          operation: "send",
          guildId: { mode: "id", value: "896347036838936576" },
          sendTo: "channel",
          channelId: { mode: "id", value: "896347036838936577" },
          content: "Hello",
          embeds: { values: [] },
          files: { values: [] },
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/discordBotApi credential is not configured/);
  });

  it("throws when neither content nor embeds is set", async () => {
    await expect(
      run(
        {
          authentication: "botToken",
          resource: "message",
          operation: "send",
          guildId: { mode: "id", value: "896347036838936576" },
          sendTo: "channel",
          channelId: { mode: "id", value: "896347036838936577" },
          content: "",
          embeds: { values: [] },
          files: { values: [] },
        },
        [{}],
      ),
    ).rejects.toThrow(/Either content or embeds must be set/);
  });

  it("throws on Discord API error", async () => {
    installFetch(
      mockResponse({ message: "Missing Access", code: 50001 }, { status: 403 }),
    );
    await expect(
      run(
        {
          authentication: "botToken",
          resource: "channel",
          operation: "get",
          channelId: { mode: "id", value: "INVALID" },
        },
        [{}],
      ),
    ).rejects.toThrow(/Missing Access/);
  });

  it("continueOnFail emits error item on API error and continues", async () => {
    const responses = [
      mockResponse({ message: "Missing Access", code: 50001 }, { status: 403 }),
      mockResponse({ id: "100", name: "general", type: 0 }),
    ];
    let idx = 0;
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit | undefined) => {
        const headers: Record<string, string> = {};
        const h = init?.headers as Record<string, string> | undefined;
        if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
          headers,
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        return responses[idx++] ?? responses[responses.length - 1];
      }),
    );

    const out = await run(
      {
        authentication: "botToken",
        resource: "channel",
        operation: "get",
        channelId: "={{ $json.channel }}",
      },
      [{ channel: "INVALID" }, { channel: "100" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toContain("Missing Access");
    expect(out[0][1].json).toMatchObject({ id: "100", name: "general", type: 0 });
  });

  it("V2 bot token — channel create", async () => {
    installFetch(
      mockResponse({
        id: "200",
        name: "new-channel",
        type: 0,
        guild_id: "896347036838936576",
      }),
    );
    const out = await run({
      authentication: "botToken",
      resource: "channel",
      operation: "create",
      guildId: { mode: "id", value: "896347036838936576" },
      name: "new-channel",
      type: 0,
      options: { topic: "A new channel" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://discord.com/api/v10/guilds/896347036838936576/channels",
    );
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ name: "new-channel", type: 0, topic: "A new channel" });
    expect(out[0][0].json).toMatchObject({
      id: "200",
      name: "new-channel",
      type: 0,
    });
  });

  it("V2 bot token — channel delete returns success", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      authentication: "botToken",
      resource: "channel",
      operation: "delete",
      channelId: { mode: "id", value: "200" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://discord.com/api/v10/channels/200");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("V2 bot token — message delete returns success", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      authentication: "botToken",
      resource: "message",
      operation: "delete",
      guildId: { mode: "id", value: "896347036838936576" },
      channelId: { mode: "id", value: "896347036838936577" },
      messageId: "123456789012345678",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(
      "https://discord.com/api/v10/channels/896347036838936577/messages/123456789012345678",
    );
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("V2 bot token — message react with emoji", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      authentication: "botToken",
      resource: "message",
      operation: "react",
      guildId: { mode: "id", value: "896347036838936576" },
      channelId: { mode: "id", value: "896347036838936577" },
      messageId: "123456789012345678",
      emoji: "👍",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain(
      "https://discord.com/api/v10/channels/896347036838936577/messages/123456789012345678/reactions/",
    );
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("V2 bot token — member role remove", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      authentication: "botToken",
      resource: "member",
      operation: "roleRemove",
      guildId: { mode: "id", value: "896347036838936576" },
      userId: { mode: "id", value: "786953432728469534" },
      role: ["111111111111111111"],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(
      "https://discord.com/api/v10/guilds/896347036838936576/members/786953432728469534/roles/111111111111111111",
    );
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("V1 webhook send with options", async () => {
    installFetch(mockResponse("", { status: 204 }));
    await run(
      {
        webhookUri: "https://discord.com/api/webhooks/123/abc",
        text: "Hello with options!",
        options: {
          username: "Custom Bot",
          avatarUrl: "https://example.com/avatar.png",
          tts: true,
        },
      },
      [{}],
      { credentials: {} },
    );

    expect(calls).toHaveLength(1);
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({
      content: "Hello with options!",
      username: "Custom Bot",
      avatar_url: "https://example.com/avatar.png",
      tts: true,
    });
  });

  it("V1 webhook send throws when webhookUri is missing", async () => {
    await expect(
      run(
        {
          text: "Hello",
          options: {},
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/Webhook uri is required/);
  });

  it("V2 webhook send without wait returns success", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run(
      {
        authentication: "webhook",
        operation: "sendLegacy",
        content: "No wait",
        options: { wait: false },
        embeds: { values: [] },
        files: { values: [] },
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://discord.com/api/webhooks/123/abc");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("V2 bot token — message send to user creates DM channel first", async () => {
    const responses = [
      mockResponse({ id: "dm-channel-999", recipients: [{ id: "786953432728469534" }] }),
      mockResponse({
        id: "msg-001",
        channel_id: "dm-channel-999",
        content: "Direct message",
        author: { id: "987654321098765432", username: "MyBot", bot: true },
      }),
    ];
    let idx = 0;
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit | undefined) => {
        const headers: Record<string, string> = {};
        const h = init?.headers as Record<string, string> | undefined;
        if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
          headers,
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        return responses[idx++] ?? responses[responses.length - 1];
      }),
    );

    const out = await run({
      authentication: "botToken",
      resource: "message",
      operation: "send",
      guildId: { mode: "id", value: "896347036838936576" },
      sendTo: "user",
      userId: { mode: "id", value: "786953432728469534" },
      content: "Direct message",
      embeds: { values: [] },
      files: { values: [] },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://discord.com/api/v10/users/@me/channels");
    const dmBody = JSON.parse(calls[0].body as string);
    expect(dmBody).toEqual({ recipient_id: "786953432728469534" });
    expect(calls[1].url).toBe(
      "https://discord.com/api/v10/channels/dm-channel-999/messages",
    );
    expect(out[0][0].json).toMatchObject({
      id: "msg-001",
      content: "Direct message",
    });
  });

  it("V2 bot token — message send with flags", async () => {
    installFetch(mockResponse({ id: "1", content: "Flagged" }));
    await run({
      authentication: "botToken",
      resource: "message",
      operation: "send",
      guildId: { mode: "id", value: "896347036838936576" },
      sendTo: "channel",
      channelId: { mode: "id", value: "896347036838936577" },
      content: "Flagged",
      options: { flags: ["SUPPRESS_EMBEDS", "SUPPRESS_NOTIFICATIONS"] },
      embeds: { values: [] },
      files: { values: [] },
    });

    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.flags).toBe(4 | 4096);
  });

  it("V2 bot token — channel update", async () => {
    installFetch(
      mockResponse({ id: "200", name: "renamed-channel", type: 0 }),
    );
    const out = await run({
      authentication: "botToken",
      resource: "channel",
      operation: "update",
      channelId: { mode: "id", value: "200" },
      name: "renamed-channel",
      options: { topic: "Updated topic" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("https://discord.com/api/v10/channels/200");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ name: "renamed-channel", topic: "Updated topic" });
    expect(out[0][0].json).toMatchObject({ id: "200", name: "renamed-channel" });
  });

  it("V2 bot token — member get many with simplify", async () => {
    installFetch(
      mockResponse([
        {
          user: { id: "u1", username: "alice" },
          roles: ["r1"],
          nick: "Alice",
          joined_at: "2024-01-01T00:00:00.000Z",
        },
        {
          user: { id: "u2", username: "bob" },
          roles: ["r2"],
          nick: null,
          joined_at: "2024-01-02T00:00:00.000Z",
        },
      ]),
    );
    const out = await run({
      authentication: "botToken",
      resource: "member",
      operation: "getAll",
      guildId: { mode: "id", value: "896347036838936576" },
      returnAll: false,
      limit: 50,
      options: { simplify: true },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      "https://discord.com/api/v10/guilds/896347036838936576/members",
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({
      user: { id: "u1", username: "alice" },
      roles: ["r1"],
      permissions: undefined,
    });
    expect(out[0][1].json).toEqual({
      user: { id: "u2", username: "bob" },
      roles: ["r2"],
      permissions: undefined,
    });
  });
});