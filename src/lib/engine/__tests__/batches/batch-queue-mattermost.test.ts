import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mattermost";

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
  mattermostApi: {
    baseUrl: "https://mattermost.example.com",
    accessToken: "test-token-123",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mattermost — n8n-nodes-base.mattermost", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mattermost");
  });

  it("post message to channel", async () => {
    installFetch({
      "POST https://mattermost.example.com/api/v4/posts": mockResponse({
        id: "post1",
        channel_id: "abc123",
        message: "Hello from n8n!",
        create_at: 1700000000000,
      }),
    });
    const out = await run({
      resource: "message",
      operation: "post",
      channelId: "abc123",
      message: "Hello from n8n!",
      options: {},
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mattermost.example.com/api/v4/posts");
    const sent = JSON.parse(calls[0].body as string);
    expect(sent).toMatchObject({ channel_id: "abc123", message: "Hello from n8n!" });
    expect(out[0][0].json).toMatchObject({
      id: "post1",
      channel_id: "abc123",
      message: "Hello from n8n!",
    });
  });

  it("create public channel", async () => {
    installFetch({
      "POST https://mattermost.example.com/api/v4/channels": mockResponse({
        id: "ch1",
        name: "my-new-channel",
        display_name: "My New Channel",
        type: "O",
        team_id: "team1",
      }),
    });
    const out = await run({
      resource: "channel",
      operation: "create",
      channelName: "my-new-channel",
      displayName: "My New Channel",
      type: "O",
      options: {},
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent).toMatchObject({
      name: "my-new-channel",
      display_name: "My New Channel",
      type: "O",
    });
    expect(out[0][0].json).toMatchObject({
      id: "ch1",
      name: "my-new-channel",
      display_name: "My New Channel",
      type: "O",
    });
  });

  it("get all users (paginated)", async () => {
    installFetch({
      "GET https://mattermost.example.com/api/v4/users?per_page=10": mockResponse([
        { id: "u1", username: "alice", email: "alice@example.com" },
        { id: "u2", username: "bob", email: "bob@example.com" },
      ]),
    });
    const out = await run({
      resource: "user",
      operation: "getAll",
      returnAll: false,
      limit: 10,
    });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "u1", username: "alice" });
    expect(out[0][1].json).toMatchObject({ id: "u2", username: "bob" });
  });

  it("add reaction to post", async () => {
    installFetch({
      "POST https://mattermost.example.com/api/v4/reactions": mockResponse({
        user_id: "user1",
        post_id: "post123",
        emoji_name: "+1",
        create_at: 1700000000000,
      }),
    });
    const out = await run({
      resource: "reaction",
      operation: "add",
      postId: "post123",
      emojiName: "+1",
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent).toMatchObject({ post_id: "post123", emoji_name: "+1" });
    expect(out[0][0].json).toMatchObject({ post_id: "post123", emoji_name: "+1" });
  });

  it("remove reaction from post uses correct delete URL", async () => {
    installFetch({
      "DELETE https://mattermost.example.com/api/v4/reactions/user456/post123/+1": mockResponse(null, { status: 200 }),
    });
    const out = await run({
      resource: "reaction",
      operation: "remove",
      postId: "post123",
      emojiName: "+1",
      userId: "user456",
    });
    expect(out[0][0].json).toEqual({ success: true });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://mattermost.example.com/api/v4/reactions/user456/post123/+1");
  });

  it("invite user to team", async () => {
    installFetch({
      "POST https://mattermost.example.com/api/v4/teams/team123/invite": mockResponse(null, { status: 200 }),
    });
    const out = await run({
      resource: "user",
      operation: "invite",
      teamId: "team123",
      userId: "user456",
    });
    expect(out[0][0].json).toEqual({ success: true });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mattermost.example.com/api/v4/teams/team123/invite");
  });

  it("delete channel returns success", async () => {
    installFetch({
      "DELETE https://mattermost.example.com/api/v4/channels/ch1": mockResponse(null, { status: 200 }),
    });
    const out = await run({
      resource: "channel",
      operation: "delete",
      channelId: "ch1",
    });
    expect(out[0][0].json).toEqual({ success: true });
    expect(calls[0].method).toBe("DELETE");
  });

  it("post ephemeral message", async () => {
    installFetch({
      "POST https://mattermost.example.com/api/v4/posts/ephemeral": mockResponse({
        id: "ep1",
        channel_id: "ch1",
        message: "ephemeral msg",
        user_id: "u1",
      }),
    });
    const out = await run({
      resource: "message",
      operation: "postEphemeral",
      channelId: "ch1",
      message: "ephemeral msg",
      userId: "u1",
    });
    const sent = JSON.parse(calls[0].body as string);
    expect(sent).toMatchObject({ channel_id: "ch1", message: "ephemeral msg", user_id: "u1" });
    expect(out[0][0].json).toHaveProperty("id");
  });

  it("continueOnFail returns error items", async () => {
    installFetch({
      "POST https://mattermost.example.com/api/v4/posts": mockResponse(
        { message: "Invalid channel", status_code: 400 },
        { status: 400 },
      ),
    });
    const out = await run(
      {
        resource: "message",
        operation: "post",
        channelId: "bad-channel",
        message: "test",
        options: {},
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("throws when channelName missing for channel create", async () => {
    await expect(
      run({
        resource: "channel",
        operation: "create",
        displayName: "Test",
        type: "O",
        options: {},
      }),
    ).rejects.toThrow("Mattermost: channelName is required");
  });

  it("throws when userId missing for reaction remove", async () => {
    await expect(
      run({
        resource: "reaction",
        operation: "remove",
        postId: "post123",
        emojiName: "+1",
      }),
    ).rejects.toThrow("Mattermost: userId is required for reaction remove");
  });
});