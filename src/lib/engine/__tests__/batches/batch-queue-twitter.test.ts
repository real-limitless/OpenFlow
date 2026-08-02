import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.twitter";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ data: { id: "12345", text: "ok" } })) {
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

function makeTestCtx(
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
  const ctx = makeTestCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { twitterOAuth2Api: { accessToken: "test-token-abc", userId: "user-001" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue twitter — n8n-nodes-base.twitter", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("X (Formerly Twitter)");
  });

  // --- Tweet: create ---
  it("creates a tweet", async () => {
    const res = await run({
      resource: "Tweet",
      operation: "create",
      text: "Hello from OpenFlow",
      simplify: true,
    });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/2/tweets");
    expect(calls[0].body).toBe(JSON.stringify({ text: "Hello from OpenFlow" }));
    expect(res[0][0].json).toHaveProperty("id", "12345");
  });

  // --- Tweet: reply ---
  it("replies to a tweet", async () => {
    const res = await run(
      {
        resource: "Tweet",
        operation: "reply",
        text: "Agreed",
        simplify: true,
      },
      [{ json: { tweetId: "1445880548472328192" } }],
    );

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/2/tweets");
    const body = JSON.parse(calls[0].body!);
    expect(body.text).toBe("Agreed");
    expect(body.reply.in_reply_to_tweet_id).toBe("1445880548472328192");
    expect(res[0][0].json).toHaveProperty("id", "12345");
  });

  // --- Tweet: search ---
  it("searches tweets", async () => {
    installFetch(
      mockResponse({
        data: [
          { id: "1", text: "hello" },
          { id: "2", text: "world" },
        ],
        meta: { result_count: 2 },
      }),
    );

    const res = await run({
      resource: "Tweet",
      operation: "search",
      searchQuery: "openflow -is:retweet",
      simplify: true,
    });

    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/2/tweets/search/recent");
    expect(calls[0].url).toContain("query=openflow+");
    expect(res[0]).toHaveLength(2);
    expect(res[0][0].json.id).toBe("1");
  });

  // --- Tweet: like ---
  it("likes a tweet", async () => {
    const res = await run({
      resource: "Tweet",
      operation: "like",
      tweetId: "1445880548472328192",
      simplify: true,
    });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/2/users/user-001/likes");
    expect(res[0][0].json.liked).toBe(true);
  });

  // --- Tweet: retweet ---
  it("retweets a tweet", async () => {
    const res = await run({
      resource: "Tweet",
      operation: "retweet",
      tweetId: "1445880548472328192",
      simplify: true,
    });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/2/users/user-001/retweets");
    expect(res[0][0].json.retweeted).toBe(true);
  });

  // --- Direct Message ---
  it("creates a direct message to @username (resolves then DMs)", async () => {
    const responses = [
      mockResponse({ data: { id: "906948460078698496", name: "Some User", username: "someUser" } }),
      mockResponse({ data: { dm_conversation_id: "conv-001", dm_event_id: "evt-001" } }),
    ];
    let respIdx = 0;
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
        return responses[respIdx++] ?? responses[responses.length - 1];
      }),
    );

    const res = await run({
      resource: "Direct Message",
      operation: "create",
      recipientIdentifier: "@someUser",
      messageText: "Hi there",
      simplify: true,
    });

    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain("/2/users/by/username/someUser");
    expect(calls[0].method).toBe("GET");
    expect(calls[1].url).toContain("/2/dm_conversations/with/906948460078698496/messages");
    expect(calls[1].method).toBe("POST");
    expect(res[0][0].json).toMatchObject({
      dm_conversation_id: "conv-001",
      dm_event_id: "evt-001",
    });
  });

  it("creates a direct message to a numeric user id (no resolution)", async () => {
    installFetch(
      mockResponse({ data: { dm_conversation_id: "conv-001", dm_event_id: "evt-001" } }),
    );

    const res = await run({
      resource: "Direct Message",
      operation: "create",
      recipientIdentifier: "906948460078698496",
      messageText: "Hello",
      simplify: true,
    });

    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/2/dm_conversations/with/906948460078698496/messages");
    expect(calls[0].method).toBe("POST");
    expect(res[0][0].json).toMatchObject({
      dm_conversation_id: "conv-001",
      dm_event_id: "evt-001",
    });
  });

  // --- User: get ---
  it("gets a user by id", async () => {
    installFetch(mockResponse({ data: { id: "42", name: "Test User", username: "testuser" } }));

    const res = await run({
      resource: "User",
      operation: "get",
      userIdentifier: "42",
      simplify: true,
    });

    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/2/users/42");
    expect(res[0][0].json.id).toBe("42");
  });

  // --- continueOnFail ---
  it("produces error item on continueOnFail", async () => {
    installFetch(mockResponse(
      { detail: "Not found" },
      { status: 404 },
    ));

    const res = await run(
      {
        continueOnFail: true,
        resource: "Tweet",
        operation: "delete",
        tweetId: "does-not-exist",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(res[0][0].json).toHaveProperty("error");
    expect(res[0][0].json.error).toContain("Not found");
  });

  // --- empty input yields [[]] per spec ---
  it("handles empty input", async () => {
    const res = await run(
      { resource: "Tweet", operation: "create", text: "hi" },
      [],
      { credentials: CREDS },
    );
    expect(res[0]).toHaveLength(0);
    expect(calls.length).toBe(0);
  });
});
