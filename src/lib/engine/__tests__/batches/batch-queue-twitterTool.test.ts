import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.twitterTool";

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
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
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
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
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

const CREDS = { twitterOAuth2Api: { accessToken: "test-token", userId: "12345" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue twitterTool — n8n-nodes-base.twitterTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("X (Twitter) Tool");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.twitterTool")).toBe(canonical);
  });

  it("Tweet.create — creates a tweet", async () => {
    installFetch(
      mockResponse({
        data: { id: "1900000000000000000", text: "Hello from the agent" },
      }),
    );

    const out = await run({
      resource: "Tweet",
      operation: "create",
      text: "Hello from the agent",
      simplify: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.twitter.com/2/tweets");
    expect(calls[0].headers.Authorization).toBe("Bearer test-token");

    const body = JSON.parse(calls[0].body!);
    expect(body.text).toBe("Hello from the agent");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("1900000000000000000");
  });

  it("Tweet.reply — replies to a tweet with tweetId from item json", async () => {
    installFetch(
      mockResponse({
        data: { id: "1900000000000000001", text: "Agreed" },
      }),
    );

    const out = await run(
      {
        resource: "Tweet",
        operation: "reply",
        text: "Agreed",
        simplify: true,
      },
      [{ json: { tweetId: "1445880548472328192" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(calls[0].body!);
    expect(body.text).toBe("Agreed");
    expect(body.reply.in_reply_to_tweet_id).toBe("1445880548472328192");

    expect(out[0][0].json.id).toBe("1900000000000000001");
  });

  it("Tweet.search — searches tweets", async () => {
    installFetch(
      mockResponse({
        data: [
          { id: "t1", text: "n8n automation tweet" },
          { id: "t2", text: "another tweet" },
        ],
        meta: { result_count: 2 },
      }),
    );

    const out = await run({
      resource: "Tweet",
      operation: "search",
      searchQuery: "n8n automation -is:retweet",
      simplify: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/tweets/search/recent");
    expect(calls[0].url).toContain("query=n8n+automation+-is%3Aretweet");

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("t1");
    expect(out[0][1].json.id).toBe("t2");
  });

  it("Direct Message.create — resolves @username and sends DM", async () => {
    installFetch([
      mockResponse({ data: { id: "98765", name: "someUser" } }),
      mockResponse({
        data: { dm_conversation_id: "conv-123", dm_event_id: "event-456" },
      }),
    ]);

    const out = await run({
      resource: "Direct Message",
      operation: "create",
      recipientIdentifier: "@someUser",
      messageText: "Hello from the agent",
      simplify: true,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.twitter.com/2/users/by/username/someUser");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toBe("https://api.twitter.com/2/dm_conversations/with/98765/messages");

    const dmBody = JSON.parse(calls[1].body!);
    expect(dmBody.text).toBe("Hello from the agent");

    expect(out[0][0].json.dm_conversation_id).toBe("conv-123");
    expect(out[0][0].json.dm_event_id).toBe("event-456");
  });

  it("User.get — gets user by username", async () => {
    installFetch(
      mockResponse({
        data: { id: "12345", name: "Test User", username: "testuser" },
      }),
    );

    const out = await run({
      resource: "User",
      operation: "get",
      userIdentifier: "@testuser",
      simplify: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.twitter.com/2/users/by/username/testuser");
    expect(out[0][0].json.id).toBe("12345");
  });

  it("List.addMember — adds member to list", async () => {
    installFetch(
      mockResponse({
        data: { is_member: true },
      }),
    );

    const out = await run({
      resource: "List",
      operation: "addMember",
      listId: "list-1",
      memberIdentifier: "member-1",
      simplify: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.twitter.com/2/lists/list-1/members");

    const body = JSON.parse(calls[0].body!);
    expect(body.user_id).toBe("member-1");

    expect(out[0][0].json.added).toBe(true);
  });

  it("fails when credential is missing", async () => {
    await expect(
      run(
        { resource: "Tweet", operation: "create", text: "test" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/twitterOAuth2Api credential is not configured/);
  });

  it("continueOnFail yields error item", async () => {
    installFetch(mockResponse({ detail: "Not found" }, { status: 404 }));
    const out = await run(
      {
        resource: "Tweet",
        operation: "delete",
        tweetId: "does-not-exist",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });

  it("empty input produces empty output", async () => {
    const out = await run(
      { resource: "Tweet", operation: "create", text: "test" },
      [],
    );
    expect(out[0]).toHaveLength(0);
  });
});
