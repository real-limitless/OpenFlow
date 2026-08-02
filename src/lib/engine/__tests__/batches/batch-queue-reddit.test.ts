import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor, getExecutorMap } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.reddit";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: Record<string, unknown>) => {
      calls.push({ url: String(url) });
      const key = String(url).split("?")[0];
      if (!(key in routes)) {
        return mockJsonResponse(null, 404);
      }
      const auth = (opts?.headers as Record<string, string> | undefined)?.authorization;
      if (!auth) return mockJsonResponse({ error: "unauthorized" }, 401);
      return mockJsonResponse(routes[key]);
    }),
  );
}

async function runRedditNode(
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const map = getExecutorMap();
  const executor = map[TYPE];
  if (!executor) throw new Error(`No executor registered for ${TYPE}`);

  const normalized = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? item
      : { json: item },
  );

  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => normalized as any,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (_name: string) => ({ accessToken: "test-token" }),
  });
  return executor(ctx, node);
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue reddit — n8n-nodes-base.reddit", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Reddit");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.reddit")).toBe(canonical);
  });

  it("submit a self post — POST /api/submit", async () => {
    const fakeResponse = { id: "t3_abc123", url: "https://reddit.com/r/test/comments/abc" };
    installFetch({ "https://oauth.reddit.com/api/submit": fakeResponse });
    const out = await runRedditNode({
      resource: "Post",
      operation: "submit",
      subreddit: "test",
      title: "Hello from OpenFlow",
      postText: "First post",
      nsfw: false,
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(calls.some((c) => c.url.includes("/api/submit"))).toBe(true);
  });

  it("get all posts from a subreddit — expands children into items", async () => {
    const fakeListing = {
      kind: "Listing",
      data: {
        children: [
          { kind: "t3", data: { id: "xyz789", title: "Test Post", author: "testuser" } },
          { kind: "t3", data: { id: "abc123", title: "Second Post", author: "other" } },
        ],
      },
    };
    installFetch({ "https://oauth.reddit.com/r/opencode/new": fakeListing });
    const out = await runRedditNode({
      resource: "Post",
      operation: "getAll",
      subreddit: "r/opencode",
      sort: "new",
      limit: 50,
    }, [{}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ id: "xyz789", title: "Test Post", author: "testuser" });
    expect(out[0][1].json).toEqual({ id: "abc123", title: "Second Post", author: "other" });
    expect(calls.some((c) => c.url.includes("/r/opencode/new"))).toBe(true);
  });

  it("search posts in a subreddit — expands children and includes restrict_sr", async () => {
    const fakeSearch = {
      kind: "Listing",
      data: { children: [{ kind: "t3", data: { id: "abc", title: "OpenFlow thread" } }] },
    };
    installFetch({ "https://oauth.reddit.com/r/programming/search": fakeSearch });
    const out = await runRedditNode({
      resource: "Post",
      operation: "search",
      subreddit: "programming",
      query: "openflow",
      sort: "relevance",
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: "abc", title: "OpenFlow thread" });
    expect(calls.some((c) => c.url.includes("/r/programming/search"))).toBe(true);
    expect(calls.some((c) => c.url.includes("restrict_sr=on"))).toBe(true);
  });

  it("reply to a comment — POST /api/comment", async () => {
    const fakeResponse = { id: "t1_reply123" };
    installFetch({ "https://oauth.reddit.com/api/comment": fakeResponse });
    const out = await runRedditNode({
      resource: "Post Comment",
      operation: "reply",
      commentId: "t1_abc123",
      postText: "Agreed",
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeResponse);
  });

  it("get all comments in a post — strips t3_ prefix, hits /comments/{article}", async () => {
    const fakeComments = [
      { kind: "Listing", data: { children: [] } },
      { kind: "Listing", data: { children: [{ kind: "t1", data: { id: "comment1", body: "Nice" } }] } },
    ];
    installFetch({ "https://oauth.reddit.com/comments/xyz789": fakeComments });
    const out = await runRedditNode({
      resource: "Post Comment",
      operation: "getAll",
      postId: "t3_xyz789",
    }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: "comment1", body: "Nice" });
    expect(calls.some((c) => c.url.includes("/comments/xyz789"))).toBe(true);
  });

  it("continueOnFail produces error item", async () => {
    installFetch({});
    const out = await runRedditNode(
      { resource: "Post", operation: "delete", postId: "does-not-exist", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("submit with json.errors in response body throws", async () => {
    const errorResponse = { json: { errors: [["ALREADY_SUB", "already submitted", "t3_abc"]] } };
    installFetch({ "https://oauth.reddit.com/api/submit": errorResponse });
    await expect(
      runRedditNode({
        resource: "Post",
        operation: "submit",
        subreddit: "test",
        title: "Dupe",
        postText: "body",
        nsfw: false,
      }, [{}]),
    ).rejects.toThrow(/ALREADY_SUB/);
  });

  it("submit with json.errors produces error item on continueOnFail", async () => {
    const errorResponse = { json: { errors: [["RATELIMIT", "try again later"]] } };
    installFetch({ "https://oauth.reddit.com/api/submit": errorResponse });
    const out = await runRedditNode(
      { resource: "Post", operation: "submit", subreddit: "test", title: "Hi", postText: "body", nsfw: false },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/RATELIMIT/);
  });

  it("profile get returns user profile", async () => {
    const fakeProfile = { name: "testuser", total_karma: 1000 };
    installFetch({ "https://oauth.reddit.com/api/v1/me": fakeProfile });
    const out = await runRedditNode({ resource: "Profile", operation: "get" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeProfile);
  });

  it("subreddit get returns about info", async () => {
    const fakeAbout = { kind: "t5", data: { display_name: "test", subscribers: 100 } };
    installFetch({ "https://oauth.reddit.com/r/test/about": fakeAbout });
    const out = await runRedditNode({ resource: "Subreddit", operation: "get", subreddit: "test" }, [{}]);
    expect(out[0][0].json).toEqual(fakeAbout);
  });

  it("user get returns user info", async () => {
    const fakeUser = { kind: "t2", data: { name: "someuser", comment_karma: 500 } };
    installFetch({ "https://oauth.reddit.com/user/someuser/about": fakeUser });
    const out = await runRedditNode({ resource: "User", operation: "get", userIdentifier: "someuser" }, [{}]);
    expect(out[0][0].json).toEqual(fakeUser);
  });

  it("empty input returns empty output", async () => {
    const out = await runRedditNode({ resource: "Profile", operation: "get" }, []);
    expect(out[0]).toHaveLength(0);
  });

  it("unsupported resource/operation throws", async () => {
    await expect(
      runRedditNode({ resource: "Invalid", operation: "none" }, [{}]),
    ).rejects.toThrow(/unsupported/i);
  });

  it("missing credential throws", async () => {
    const map = getExecutorMap();
    const executor = map[TYPE]!;
    const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "Profile", operation: "get" } });
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    await expect(executor(ctx, node)).rejects.toThrow(/credential/i);
  });
});
