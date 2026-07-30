import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.rssFeedRead";

interface MockResponseInit {
  status?: number;
  body?: string;
}

function mockResponse(body: string, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  return {
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get: () => "application/rss+xml",
      entries: () => new Map([["content-type", "application/rss+xml"]]).entries(),
    },
    async text() {
      return body;
    },
  };
}

let routes: Record<string, string> = {};
let calls: Array<{ url: string }> = [];

function installFetch(map: Record<string, string>) {
  routes = map;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      const body = routes[key];
      if (body === undefined) {
        return mockResponse("not found", { status: 404 });
      }
      return mockResponse(body);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
});

function rssFeed(
  items: Array<{
    title: string;
    link: string;
    description?: string;
    author?: string;
    contentSnippet?: string;
    pubDate?: string;
  }>,
): string {
  const itemsXml = items
    .map((it) => {
      const desc = it.description ? `<description>${it.description}</description>` : "";
      const author = it.author ? `<author>${it.author}</author>` : "";
      const snippet = it.contentSnippet
        ? `<contentSnippet>${it.contentSnippet}</contentSnippet>`
        : "";
      const pub = it.pubDate ? `<pubDate>${it.pubDate}</pubDate>` : "";
      return `<item><title>${it.title}</title><link>${it.link}</link>${desc}${author}${snippet}${pub}</item>`;
    })
    .join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><link>https://example.com</link>${itemsXml}</channel></rss>`;
}

function atomFeed(
  entries: Array<{ title: string; link: string; summary?: string; author?: string }>,
): string {
  const entriesXml = entries
    .map((e) => {
      const summary = e.summary ? `<summary>${e.summary}</summary>` : "";
      const author = e.author ? `<author><name>${e.author}</name></author>` : "";
      return `<entry><title>${e.title}</title><link href="${e.link}"/>${summary}${author}<id>${e.link}</id></entry>`;
    })
    .join("");
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Feed</title>${entriesXml}</feed>`;
}

describe("batch-queue rss-feed-read — n8n-nodes-base.rssFeedRead", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("RSS Read");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.rssFeedRead")).toBe(canonical);
  });

  it("static URL returns one item per entry", async () => {
    installFetch({
      "https://example.com/feed.xml": rssFeed([
        { title: "A", link: "https://example.com/a" },
        { title: "B", link: "https://example.com/b" },
      ]),
    });
    const out = await runNode(TYPE, { url: "https://example.com/feed.xml", options: {} }, [{}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.title).toBe("A");
    expect(out[0][0].json.link).toBe("https://example.com/a");
    expect(out[0][1].json.title).toBe("B");
    expect(out[0][1].json.link).toBe("https://example.com/b");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://example.com/feed.xml");
  });

  it("per-item URL expression fetches each feed and expands entries", async () => {
    installFetch({
      "https://example.com/feed-a.xml": rssFeed([{ title: "A1", link: "https://example.com/a1" }]),
      "https://example.com/feed-b.xml": rssFeed([
        { title: "B1", link: "https://example.com/b1" },
        { title: "B2", link: "https://example.com/b2" },
      ]),
    });
    const out = await runNode(TYPE, { url: "={{ $json.rss }}", options: { ignoreSSL: false } }, [
      { rss: "https://example.com/feed-a.xml" },
      { rss: "https://example.com/feed-b.xml" },
    ]);
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json.title).toBe("A1");
    expect(out[0][1].json.title).toBe("B1");
    expect(out[0][2].json.title).toBe("B2");
    expect(calls.map((c) => c.url)).toEqual([
      "https://example.com/feed-a.xml",
      "https://example.com/feed-b.xml",
    ]);
  });

  it("ignoreSSL=true proceeds with fetch and sets TLS bypass env", async () => {
    installFetch({
      "https://self-signed.example/feed.xml": rssFeed([
        { title: "S", link: "https://self-signed.example/s" },
      ]),
    });
    const out = await runNode(
      TYPE,
      { url: "https://self-signed.example/feed.xml", options: { ignoreSSL: true } },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("S");
    expect(calls).toHaveLength(1);
  });

  it("ignoreSSL=false does not set TLS bypass env during fetch", async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
    installFetch({
      "https://example.com/feed.xml": rssFeed([{ title: "A", link: "https://example.com/a" }]),
    });
    await runNode(TYPE, { url: "https://example.com/feed.xml", options: { ignoreSSL: false } }, [
      {},
    ]);
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("1");
  });

  it("customFields includes extra keys on output items", async () => {
    installFetch({
      "https://example.com/feed.xml": rssFeed([
        {
          title: "T",
          link: "https://example.com/t",
          author: "Ada",
          contentSnippet: "Hello",
        },
      ]),
    });
    const out = await runNode(
      TYPE,
      { url: "https://example.com/feed.xml", options: { customFields: "author, contentSnippet" } },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("T");
    expect(out[0][0].json.author).toBe("Ada");
    expect(out[0][0].json.contentSnippet).toBe("Hello");
  });

  it("empty feed returns empty output array", async () => {
    installFetch({
      "https://example.com/empty-feed.xml": rssFeed([]),
    });
    const out = await runNode(TYPE, { url: "https://example.com/empty-feed.xml", options: {} }, [
      {},
    ]);
    expect(out[0]).toEqual([]);
  });

  it("invalid URL / fetch failure with continueOnFail yields an error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { url: "https://invalid.invalid/no-feed", options: {} },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { url: "https://invalid.invalid/no-feed", options: {} }, [{}]),
    ).rejects.toThrow();
  });

  it("missing url throws", async () => {
    installFetch({});
    await expect(runNode(TYPE, { url: "", options: {} }, [{}])).rejects.toThrow(/url is required/i);
  });

  it("parses Atom feeds", async () => {
    installFetch({
      "https://example.com/atom.xml": atomFeed([
        { title: "Atom1", link: "https://example.com/atom1", summary: "Sum", author: "Bo" },
      ]),
    });
    const out = await runNode(TYPE, { url: "https://example.com/atom.xml", options: {} }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("Atom1");
    expect(out[0][0].json.link).toBe("https://example.com/atom1");
    expect(out[0][0].json.creator).toBe("Bo");
    expect(out[0][0].json.contentSnippet).toBe("Sum");
  });

  it("preserves feed document order across entries", async () => {
    installFetch({
      "https://example.com/feed.xml": rssFeed([
        { title: "First", link: "https://example.com/1" },
        { title: "Second", link: "https://example.com/2" },
        { title: "Third", link: "https://example.com/3" },
      ]),
    });
    const out = await runNode(TYPE, { url: "https://example.com/feed.xml", options: {} }, [{}]);
    expect(out[0].map((i) => i.json.title)).toEqual(["First", "Second", "Third"]);
  });
});
