import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.redditTool";

function mockRedditResponse(data: unknown) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: { get() { return "application/json"; }, entries() { return new Map(); } },
    async json() { return JSON.parse(body); },
    async text() { return body; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let defaultResponse: ReturnType<typeof mockRedditResponse>;

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: (init?.method ?? "GET").toUpperCase(),
        headers,
        body: init?.body instanceof URLSearchParams ? init.body.toString() : typeof init?.body === "string" ? init.body : undefined,
      });
      return defaultResponse;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

const CREDS = {
  redditOAuth2Api: { accessToken: "reddit_token_abc" },
};

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

describe("batch-queue redditTool — n8n-nodes-base.redditTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).not.toBeUndefined();
    expect(getNodeType(TYPE).displayName).toBe("Reddit Tool");
  });

  describe("Post create (self)", () => {
    it("submits a self post", async () => {
      defaultResponse = mockRedditResponse({
        json: { data: { id: "t3_abc123", name: "t3_abc123" } },
      });
      const out = await run(
        {
          resource: "Post",
          operation: "create",
          subreddit: "test",
          title: "Hello",
          text: "World",
          kind: "self",
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://oauth.reddit.com/api/submit");
      expect(calls[0].body).toContain("kind=self");
      expect(calls[0].body).toContain("sr=test");
      expect(calls[0].body).toContain("title=Hello");
      expect(calls[0].body).toContain("text=World");
      expect(out[0][0].json).toMatchObject({ json: { data: { id: "t3_abc123" } } });
    });
  });

  describe("Post getAll", () => {
    it("fetches posts from a subreddit", async () => {
      defaultResponse = mockRedditResponse({
        data: {
          children: [
            { data: { id: "t3_1", title: "First", author: "u1" } },
            { data: { id: "t3_2", title: "Second", author: "u2" } },
          ],
        },
      });
      const out = await run(
        {
          resource: "Post",
          operation: "getAll",
          subreddit: "r/opencode",
          filters: { category: "new" },
          limit: 50,
          returnAll: false,
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/r/opencode/new?limit=50");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: "t3_1", title: "First" });
    });
  });

  describe("Post search across all Reddit", () => {
    it("searches posts with keyword", async () => {
      defaultResponse = mockRedditResponse({
        data: {
          children: [
            { data: { id: "t3_s1", title: "OpenFlow post" } },
          ],
        },
      });
      const out = await run(
        {
          resource: "Post",
          operation: "search",
          keyword: "openflow",
          location: "allReddit",
          limit: 25,
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/search?q=openflow");
      expect(calls[0].url).not.toContain("restrict_sr=on");
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "t3_s1", title: "OpenFlow post" });
    });
  });

  describe("Post Comment create", () => {
    it("creates a top-level comment", async () => {
      defaultResponse = mockRedditResponse({
        json: { data: { id: "t1_cmt1", name: "t1_cmt1" } },
      });
      const out = await run(
        {
          resource: "Post Comment",
          operation: "create",
          postId: "l0me7x",
          commentText: "Great post!",
        },
        [{ json: {} }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://oauth.reddit.com/api/comment");
      expect(calls[0].body).toContain("thing_id=t3_l0me7x");
      expect(calls[0].body).toContain("text=Great+post");
      expect(out[0][0].json).toMatchObject({ json: { data: { id: "t1_cmt1" } } });
    });
  });

  describe("Post Comment reply", () => {
    it("replies to a comment", async () => {
      defaultResponse = mockRedditResponse({
        json: { data: { id: "t1_reply1", name: "t1_reply1" } },
      });
      const out = await run(
        {
          resource: "Post Comment",
          operation: "reply",
          commentId: "gla7fmt",
          replyText: "Agreed",
        },
        [{ json: { commentId: "gla7fmt" } }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].body).toContain("thing_id=t1_gla7fmt");
      expect(calls[0].body).toContain("text=Agreed");
    });
  });

  describe("continueOnFail", () => {
    it("produces error item when delete fails", async () => {
      defaultResponse = mockRedditResponse({ error: 404, reason: "not found" });
      defaultResponse.ok = false;
      defaultResponse.status = 404;
      const out = await run(
        {
          resource: "Post",
          operation: "delete",
          postId: "does-not-exist",
          continueOnFail: true,
        },
        [{ json: {} }],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
    });
  });

  describe("Profile get", () => {
    it("fetches authenticated user identity", async () => {
      defaultResponse = mockRedditResponse({ name: "testuser", id: "abc123" });
      const out = await run(
        { resource: "Profile", operation: "get", details: "identity" },
        [{ json: {} }],
      );
      expect(calls[0].url).toContain("/api/v1/me");
      expect(out[0][0].json).toMatchObject({ name: "testuser" });
    });
  });

  describe("User get", () => {
    it("fetches user about", async () => {
      defaultResponse = mockRedditResponse({ name: "someuser", link_karma: 100 });
      const out = await run(
        { resource: "User", operation: "get", username: "someuser", userDetails: "about" },
        [{ json: {} }],
      );
      expect(calls[0].url).toContain("/user/someuser/about");
      expect(out[0][0].json).toMatchObject({ name: "someuser" });
    });
  });

  describe("Subreddit get", () => {
    it("fetches subreddit about", async () => {
      defaultResponse = mockRedditResponse({
        display_name: "opencode",
        subscribers: 1000,
      });
      const out = await run(
        { resource: "Subreddit", operation: "get", subreddit: "opencode", content: "about" },
        [{ json: {} }],
      );
      expect(calls[0].url).toContain("/r/opencode/about");
      expect(out[0][0].json).toMatchObject({ display_name: "opencode" });
    });
  });

  describe("empty input", () => {
    it("returns empty output for no input items", async () => {
      const out = await run(
        { resource: "Post", operation: "getAll", subreddit: "test" },
        [],
      );
      expect(out[0]).toHaveLength(0);
    });
  });
});
