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

const TYPE = "n8n-nodes-base.discordTool";

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
        url: String(url),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
    }),
  );
}

const CREDS = {
  discordBotApi: { botToken: "test-bot-token" },
};

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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue discordTool — n8n-nodes-base.discordTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc!.displayName).toBe("Discord Tool");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.discordTool")).toBe(canonical);
  });

  it("send message via bot token — posts to Discord API", async () => {
    installFetch(mockResponse({
      id: "123456789012345678",
      channel_id: "987654321",
      content: "Hello from workflow",
      author: { id: "12345", username: "my-bot" },
      timestamp: "2026-01-01T00:00:00.000000+00:00",
      type: 0,
      flags: 0,
    }));

    const out = await run({
      resource: "message",
      operation: "send",
      channelId: "987654321",
      text: "Hello from workflow",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/channels/987654321/messages");
    const body = JSON.parse(calls[0].body!);
    expect(body.content).toBe("Hello from workflow");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("123456789012345678");
    expect(out[0][0].json.content).toBe("Hello from workflow");
  });

  it("send message via webhook — posts to webhook URL", async () => {
    installFetch(mockResponse({ success: true }));

    const out = await run({
      authentication: "webhook",
      resource: "message",
      operation: "send",
      webhookUri: "https://discord.com/api/webhooks/123456/ABCdef",
      text: "Hello via webhook",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://discord.com/api/webhooks/123456/ABCdef");
    const body = JSON.parse(calls[0].body!);
    expect(body.content).toBe("Hello via webhook");
    expect(out[0][0].json.success).toBe(true);
  });

  it("get messages from a channel", async () => {
    installFetch(mockResponse([
      {
        id: "1111111111",
        channel_id: "987654321",
        content: "First message",
        author: { id: "111", username: "user1" },
        timestamp: "2026-01-01T00:00:00.000000+00:00",
        type: 0,
      },
      {
        id: "2222222222",
        channel_id: "987654321",
        content: "Second message",
        author: { id: "222", username: "user2" },
        timestamp: "2026-01-01T00:00:01.000000+00:00",
        type: 0,
      },
    ]));

    const out = await run({
      resource: "message",
      operation: "getAll",
      channelId: "987654321",
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/channels/987654321/messages");
    const params = new URLSearchParams(calls[0].url.split("?")[1]);
    expect(params.get("limit")).toBe("10");

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("1111111111");
    expect(out[0][0].json.content).toBe("First message");
    expect(out[0][1].json.id).toBe("2222222222");
  });

  it("react to a message", async () => {
    installFetch(mockResponse(null, { status: 204 }));

    const out = await run({
      resource: "message",
      operation: "react",
      channelId: "987654321",
      messageId: "1111111111",
      emoji: "\u2764\uFE0F",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("/channels/987654321/messages/1111111111/reactions/%E2%9D%A4%EF%B8%8F/@me");
    expect(out[0][0].json.success).toBe(true);
  });

  it("add a role to a member", async () => {
    installFetch(mockResponse(null, { status: 204 }));

    const out = await run({
      resource: "member",
      operation: "roleAdd",
      guildId: "123456789",
      userId: "555555555",
      role: "666666666",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("/guilds/123456789/members/555555555/roles/666666666");
    expect(out[0][0].json.success).toBe(true);
  });

  it("fails when credential is missing", async () => {
    installFetch(mockResponse({ message: "401: Unauthorized" }, { status: 401 }));
    await expect(
      run(
        { resource: "message", operation: "send", channelId: "123", text: "hi" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow();
  });

  it("fails when channelId is missing for send", async () => {
    await expect(
      run({ resource: "message", operation: "send", text: "hi" }),
    ).rejects.toThrow(/channelId/);
  });

  it("continueOnFail yields error item", async () => {
    installFetch(mockResponse({ message: "Unknown Channel" }, { status: 404 }));
    const out = await run(
      { resource: "message", operation: "send", channelId: "bad", text: "hi" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Unknown Channel/);
  });

  it("resolves expression parameters from input items", async () => {
    installFetch(mockResponse({
      id: "333",
      channel_id: "dynamic-channel",
      content: "Hello dynamic",
      author: { id: "1", username: "bot" },
      timestamp: "2026-01-01T00:00:00.000000+00:00",
      type: 0,
    }));

    const out = await run(
      {
        resource: "message",
        operation: "send",
        channelId: "={{ $json.channelId }}",
        text: "={{ $json.text }}",
      },
      [{ json: { channelId: "dynamic-channel", text: "Hello dynamic" } }],
    );

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.content).toBe("Hello dynamic");
    expect(out[0][0].json.channel_id).toBe("dynamic-channel");
    expect(out[0][0].json.content).toBe("Hello dynamic");
  });

  it("sendAndWait — sends a message with approval components", async () => {
    installFetch(mockResponse({
      id: "3333333333",
      channel_id: "987654321",
      content: "Approve this action?",
      author: { id: "bot-id", username: "my-bot" },
      timestamp: "2026-01-01T00:00:00.000000+00:00",
      type: 0,
    }));

    const out = await run({
      resource: "message",
      operation: "sendAndWait",
      channelId: "987654321",
      text: "Approve this action?",
      responseType: "approval",
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.content).toBe("Approve this action?");
    expect(body.components).toBeDefined();
    expect(body.components[0].components[0].custom_id).toBe("discord_approve");
    expect(out[0][0].json.id).toBe("3333333333");
  });
});
