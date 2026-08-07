import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.storyblok";

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

describe("batch-queue storyblok — n8n-nodes-base.storyblok", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Storyblok");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.storyblok")).toBe(canonical);
  });

  it("content get — single story", async () => {
    const fakeStory = {
      story: {
        id: 12345,
        name: "Test Story",
        slug: "test-story",
        full_slug: "blog/test-story",
        content: { headline: "Hello" },
        published: true,
        updated_at: "2024-01-01T00:00:00Z",
        created_at: "2024-01-01T00:00:00Z",
      },
    };
    installFetch({
      "https://cdn.storyblok.com/v1/cdn/stories/12345?token=": fakeStory,
    });
    const out = await runNode(TYPE, { source: "content", operation: "get", spaceId: "288868", storyId: "12345" }, [{ json: { id: "12345" } }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeStory);
    expect(calls[0].url).toContain("cdn.storyblok.com/v1/cdn/stories/12345?token=");
  });

  it("content getAll with filters", async () => {
    const fakeStories = {
      stories: [
        { id: 1, name: "Blog 1", slug: "blog-1", full_slug: "blog/blog-1", content: {}, published: true },
        { id: 2, name: "Blog 2", slug: "blog-2", full_slug: "blog/blog-2", content: {}, published: true },
      ],
    };
    installFetch({
      "https://cdn.storyblok.com/v1/cdn/stories/?token=&starts_with=blog%2F&per_page=10&version=published": fakeStories,
    });
    const out = await runNode(
      TYPE,
      { source: "content", operation: "getAll", spaceId: "288868", filters: { starts_with: "blog/", per_page: "10", version: "published" } },
      [{ json: {} }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe(1);
    expect(out[0][1].json.id).toBe(2);
    expect(calls).toHaveLength(1);
  });

  it("management publish story", async () => {
    const fakeResponse = { story: { id: 2141, published: true } };
    installFetch({
      "https://mapi.storyblok.com/v1/spaces/288868/stories/2141/publish": fakeResponse,
    });
    const out = await runNode(TYPE, { source: "management", operation: "publish", spaceId: "288868", storyId: "2141" }, [{ json: { story_id: "2141" } }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(calls[0].url).toContain("publish");
  });

  it("management delete story", async () => {
    const fakeResponse = { success: true };
    installFetch({
      "https://mapi.storyblok.com/v1/spaces/288868/stories/2141": fakeResponse,
    });
    const { out } = await runNodeWithCtx(
      TYPE,
      { source: "management", operation: "delete", spaceId: "288868", storyId: "2141" },
      [{ json: { story_id: "2141" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(calls[0].url).toContain("stories/2141");
  });

  it("missing spaceId throws validation error", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { source: "content", operation: "get", spaceId: "", storyId: "" }, [{}]),
    ).rejects.toThrow(/spaceId is required/i);
  });

  it("content URL includes token query param from credential", async () => {
    const fakeStory = { story: { id: 42, name: "Sec" } };
    installFetch({
      "https://cdn.storyblok.com/v1/cdn/stories/42?token=my_content_token": fakeStory,
    });
    const { out } = await runNodeWithCtx(
      TYPE,
      { source: "content", operation: "get", spaceId: "1", storyId: "42" },
      [{}],
      {
        credentials: { storyblokApi: { contentAccessToken: "my_content_token" } },
      },
    );
    expect(out[0][0].json).toEqual(fakeStory);
    expect(calls[0].url).toContain("token=my_content_token");
  });

  it("management URL uses Authorization header, no token query param", async () => {
    const fakeResponse = { story: { id: 5 } };
    installFetch({
      "https://mapi.storyblok.com/v1/spaces/1/stories/5": fakeResponse,
    });
    const { out } = await runNodeWithCtx(
      TYPE,
      { source: "management", operation: "get", spaceId: "1", storyId: "5" },
      [{}],
      {
        credentials: { storyblokApi: { accessToken: "pat_abc" } },
      },
    );
    expect(out[0][0].json).toEqual(fakeResponse);
    expect(calls[0].url).not.toContain("token=");
  });

  it("continueOnFail with invalid operation yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { source: "content", operation: "get", spaceId: "288868", storyId: "99999" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });
});
