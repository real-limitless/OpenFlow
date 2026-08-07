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

const TYPE = "n8n-nodes-base.mattermostTool";

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
  mattermostApi: { baseUrl: "https://mattermost.example.com", accessToken: "test-token" },
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

describe("batch-queue mattermostTool — n8n-nodes-base.mattermostTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc!.displayName).toBe("Mattermost");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("posts a message to a channel", async () => {
    installFetch(mockResponse({
      id: "generated-post-id",
      channel_id: "abc123",
      message: "Hello from OpenFlow",
    }));

    const out = await run({
      resource: "message",
      operation: "post",
      channelId: "abc123",
      message: "Hello from OpenFlow",
    }, [{ json: { channelId: "abc123", text: "Hello from OpenFlow" } }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/api/v4/posts");
    const body = JSON.parse(calls[0].body!);
    expect(body.channel_id).toBe("abc123");
    expect(body.message).toBe("Hello from OpenFlow");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("generated-post-id");
  });

  it("creates a new channel", async () => {
    installFetch(mockResponse({
      id: "channel-1",
      name: "announcements",
      display_name: "Announcements",
      type: "O",
    }));

    const out = await run({
      resource: "channel",
      operation: "create",
      channelName: "announcements",
      displayName: "Announcements",
      type: "O",
      teamId: "team123",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/api/v4/channels");
    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("announcements");
    expect(body.display_name).toBe("Announcements");
    expect(body.type).toBe("O");
    expect(body.team_id).toBe("team123");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("channel-1");
    expect(out[0][0].json.name).toBe("announcements");
  });

  it("gets a user by email", async () => {
    installFetch(mockResponse({
      id: "user-1",
      username: "johndoe",
      email: "user@example.com",
      create_at: 1700000000000,
    }));

    const out = await run({
      resource: "user",
      operation: "getByEmail",
      email: "user@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/api/v4/users/email/user@example.com");

    expect(out[0][0].json.id).toBe("user-1");
    expect(out[0][0].json.email).toBe("user@example.com");
  });

  it("adds a reaction to a post", async () => {
    installFetch(mockResponse({
      user_id: "bot-1",
      post_id: "post123",
      emoji_name: "+1",
    }));

    const out = await run({
      resource: "reaction",
      operation: "add",
      postId: "post123",
      emojiName: "+1",
      userId: "bot-1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/api/v4/reactions");
    const body = JSON.parse(calls[0].body!);
    expect(body.post_id).toBe("post123");
    expect(body.emoji_name).toBe("+1");
    expect(body.user_id).toBe("bot-1");

    expect(out[0][0].json.emoji_name).toBe("+1");
  });

  it("handles an API error with continueOnFail", async () => {
    installFetch(mockResponse(
      { error: "Channel not found", message: "Channel not found" },
      { status: 404 },
    ));

    const out = await run({
      resource: "message",
      operation: "post",
      channelId: "nonexistent",
      message: "This will fail",
    }, [{}], { continueOnFail: true, credentials: CREDS });

    expect(calls).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });

  it("throws error when credential is missing", async () => {
    await expect(run(
      { resource: "message", operation: "post", channelId: "c1", message: "hi" },
      [{}],
      { credentials: {} },
    )).rejects.toThrow("mattermostApi credential is required");
  });
});
