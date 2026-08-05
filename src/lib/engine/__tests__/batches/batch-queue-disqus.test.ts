import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.disqus";

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
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      if (!(key in routes)) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue disqus — n8n-nodes-base.disqus", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Disqus");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.disqus")).toBe(canonical);
  });

  it("forum — get returns forum details", async () => {
    const fakeResponse = {
      code: 0,
      response: {
        id: "12345",
        name: "My Forum",
        shortname: "myforum",
        description: "A test forum",
      },
    };
    installFetch({
      "https://disqus.com/api/3.0/forums/details.json?forum=myforum": fakeResponse,
    });
    const out = await runNode(TYPE, { resource: "forum", operation: "get", forum: "myforum" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(calls).toHaveLength(1);
  });

  it("forum — getCategories returns category list with cursor", async () => {
    const fakeResponse = {
      code: 0,
      response: [
        { id: "1", title: "General", order: 0, forum: "myforum" },
        { id: "2", title: "Support", order: 1, forum: "myforum" },
      ],
      cursor: { prev: null, next: "cursor:abc", hasNext: true },
    };
    installFetch({
      "https://disqus.com/api/3.0/forums/listCategories.json?forum=myforum": fakeResponse,
    });
    const out = await runNode(TYPE, { resource: "forum", operation: "getCategories", forum: "myforum" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(calls).toHaveLength(1);
  });

  it("forum — getThreads returns thread list", async () => {
    const fakeResponse = {
      code: 0,
      response: [
        { id: "thread1", title: "Welcome thread", link: "https://example.com/thread1", posts: 5 },
      ],
    };
    installFetch({
      "https://disqus.com/api/3.0/forums/listThreads.json?forum=myforum": fakeResponse,
    });
    const out = await runNode(TYPE, { resource: "forum", operation: "getThreads", forum: "myforum" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(calls).toHaveLength(1);
  });

  it("forum — getPosts returns post list with threadId", async () => {
    const fakeResponse = {
      code: 0,
      response: [
        { id: "post1", message: "<p>Hello world</p>", author: { username: "alice" }, createdAt: "2024-01-01T00:00:00" },
      ],
    };
    installFetch({
      "https://disqus.com/api/3.0/forums/listPosts.json?forum=myforum&thread=thread1": fakeResponse,
    });
    const out = await runNode(TYPE, { resource: "forum", operation: "getPosts", forum: "myforum", threadId: "thread1" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with missing forum yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "forum", operation: "get", forum: "" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing forum throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "forum", operation: "get", forum: "" }, [{}]),
    ).rejects.toThrow(/forum parameter is required/i);
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeResponse = { code: 0, response: { id: "12345" } };
    installFetch({
      "https://disqus.com/api/3.0/forums/details.json?forum=myforum": fakeResponse,
    });
    const out = await runNode(TYPE, { resource: "forum", operation: "get", forum: "myforum" }, [{}, {}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(out[0][1].json).toEqual(fakeResponse);
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "forum", operation: "get", forum: "myforum" }, [{}]),
    ).rejects.toThrow();
  });
});
