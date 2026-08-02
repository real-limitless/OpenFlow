import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";
import { _clearPollStatesForTest } from "../../executors/rss-feed-read-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.rssFeedReadTrigger";

function mockResponse(body: string, status = 200) {
  return {
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/rss+xml", entries: () => new Map([["content-type", "application/rss+xml"]]).entries() },
    async text() { return body; },
  };
}

function rssFeed(items: Array<{ title: string; link: string; pubDate?: string }>): string {
  const itemsXml = items.map((it) =>
    `<item><title>${it.title}</title><link>${it.link}</link>${it.pubDate ? `<pubDate>${it.pubDate}</pubDate>` : ""}</item>`
  ).join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><link>https://example.com</link>${itemsXml}</channel></rss>`;
}

let routes: Record<string, string> = {};

function installFetch(map: Record<string, string>) {
  routes = map;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = String(url);
    const body = routes[key];
    if (body === undefined) return mockResponse("not found", 404);
    return mockResponse(body);
  }));
}

beforeEach(() => {
  _clearPollStatesForTest();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue rssFeedReadTrigger — n8n-nodes-base.rssFeedReadTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("RSS Feed Trigger");
  });

  it("emits one item per new feed entry (happy path)", async () => {
    installFetch({
      "https://example.com/feed.xml": rssFeed([
        { title: "First Post", link: "https://example.com/first-post", pubDate: "Mon, 01 Jan 2024 00:00:00 GMT" },
      ]),
    });
    const out = await runNode(TYPE, { feedUrl: "https://example.com/feed.xml" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("First Post");
    expect(out[0][0].json.link).toBe("https://example.com/first-post");
    expect(out[0][0].json.pubDate).toBe("Mon, 01 Jan 2024 00:00:00 GMT");
  });

  it("empty feed produces no items", async () => {
    installFetch({
      "https://example.com/empty.xml": rssFeed([]),
    });
    const out = await runNode(TYPE, { feedUrl: "https://example.com/empty.xml" }, [{}]);
    expect(out[0]).toEqual([]);
  });

  it("deduplicates duplicate entries returned in same poll (same guid)", async () => {
    installFetch({
      "https://example.com/feed.xml": rssFeed([
        { title: "A", link: "https://example.com/a" },
        { title: "A", link: "https://example.com/a" },
      ]),
    });
    const out = await runNode(TYPE, { feedUrl: "https://example.com/feed.xml" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("A");
  });

  it("unreachable feed throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { feedUrl: "https://invalid.invalid/no-feed" }, [{}]),
    ).rejects.toThrow();
  });

  it("produces one item for one entry (single item test)", async () => {
    installFetch({
      "https://example.com/single.xml": rssFeed([
        { title: "Only", link: "https://example.com/only" },
      ]),
    });
    const out = await runNode(TYPE, { feedUrl: "https://example.com/single.xml" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("Only");
  });

  it("first poll emits all, second poll emits nothing (dedup across polls)", async () => {
    installFetch({
      "https://example.com/feed.xml": rssFeed([
        { title: "Post 1", link: "https://example.com/1", pubDate: "Mon, 01 Jan 2024 00:00:00 GMT" },
        { title: "Post 2", link: "https://example.com/2", pubDate: "Mon, 02 Jan 2024 00:00:00 GMT" },
        { title: "Post 3", link: "https://example.com/3", pubDate: "Mon, 03 Jan 2024 00:00:00 GMT" },
      ]),
    });
    const first = await runNode(TYPE, { feedUrl: "https://example.com/feed.xml" }, [{}]);
    expect(first[0]).toHaveLength(3);
    expect(first[0][0].json.guid).toBeUndefined();

    const second = await runNode(TYPE, { feedUrl: "https://example.com/feed.xml" }, [{}]);
    expect(second[0]).toHaveLength(0);
  });

  it("third poll emits only the genuinely new entry", async () => {
    installFetch({
      "https://example.com/feed.xml": rssFeed([
        { title: "Post 1", link: "https://example.com/1" },
        { title: "Post 2", link: "https://example.com/2" },
        { title: "Post 3", link: "https://example.com/3" },
      ]),
    });
    const first = await runNode(TYPE, { feedUrl: "https://example.com/feed.xml" }, [{}]);
    expect(first[0]).toHaveLength(3);

    const second = await runNode(TYPE, { feedUrl: "https://example.com/feed.xml" }, [{}]);
    expect(second[0]).toHaveLength(0);

    routes["https://example.com/feed.xml"] = rssFeed([
      { title: "Post 1", link: "https://example.com/1" },
      { title: "Post 2", link: "https://example.com/2" },
      { title: "Post 3", link: "https://example.com/3" },
      { title: "Post 4", link: "https://example.com/4" },
    ]);
    const third = await runNode(TYPE, { feedUrl: "https://example.com/feed.xml" }, [{}]);
    expect(third[0]).toHaveLength(1);
    expect(third[0][0].json.title).toBe("Post 4");
    expect(third[0][0].json.link).toBe("https://example.com/4");
  });

  it("empty feed URL throws required error", async () => {
    await expect(
      runNode(TYPE, { feedUrl: "" }, [{}]),
    ).rejects.toThrow();
  });
});
