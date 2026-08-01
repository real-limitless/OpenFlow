import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.rssFeedReadTool";

function mockFetchBody(xml: string, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: new Map(),
    async text() {
      return xml;
    },
  } as unknown as Response);
}

function rssFeedXml(
  overrides: Partial<{ title: string; description: string; link: string }> = {},
): string {
  const title = overrides.title ?? "Example Feed";
  const description = overrides.description ?? "An example RSS feed";
  const link = overrides.link ?? "https://example.com";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <description>${description}</description>
    <link>${link}</link>
    <item>
      <title>First Post</title>
      <link>https://example.com/first-post</link>
      <description>This is the first post.</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>123</guid>
      <category>Tech</category>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/second-post</link>
      <description>Second post content.</description>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("n8n-nodes-base.rssFeedReadTool", () => {
  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("fetches and parses a known RSS feed", async () => {
    mockFetchBody(rssFeedXml());

    const [out] = await runNode(TYPE, {
      url: "https://example.com/feed.xml",
    });

    expect(out).toHaveLength(1);
    const item = out[0] as INodeExecutionData;
    expect(item.json).toHaveProperty("title", "Example Feed");
    expect(item.json).toHaveProperty("description", "An example RSS feed");
    expect(item.json).toHaveProperty("link", "https://example.com");
    expect(item.json).toHaveProperty("items");
    const items = (item.json as Record<string, unknown>).items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveProperty("title", "First Post");
    expect(items[0]).toHaveProperty("link", "https://example.com/first-post");
    expect(items[1]).toHaveProperty("title", "Second Post");
  });

  it("throws for unreachable URL", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND nonexistent.invalid"));

    await expect(
      runNode(TYPE, { url: "https://nonexistent.invalid/feed.xml" }),
    ).rejects.toThrow();
  });

  it("throws for non-XML response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      statusText: "OK",
      ok: true,
      headers: new Map(),
      async text() {
        return "This is not XML";
      },
    } as unknown as Response);

    await expect(
      runNode(TYPE, { url: "https://example.com/not-feed" }),
    ).rejects.toThrow();
  });

  it("handles continueOnFail on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const [out] = await runNode(
      TYPE,
      { url: "https://example.com/feed.xml" },
      [{}],
      { continueOnFail: true },
    );

    expect(out).toHaveLength(1);
    expect((out[0] as INodeExecutionData).json).toHaveProperty("error");
  });

  it("handles Atom feeds", async () => {
    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <subtitle>An example Atom feed</subtitle>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Atom Post</title>
    <link href="https://example.com/atom-post" rel="alternate"/>
    <summary>Atom summary</summary>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>Author McAuthorface</name></author>
    <id>urn:uuid:abc-123</id>
  </entry>
</feed>`;
    mockFetchBody(atomXml);

    const [out] = await runNode(TYPE, {
      url: "https://example.com/atom.xml",
    });

    expect(out).toHaveLength(1);
    const item = out[0] as INodeExecutionData;
    expect((item.json as Record<string, unknown>).title).toBe("Atom Feed");
    const items = (item.json as Record<string, unknown>).items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveProperty("title", "Atom Post");
    expect(items[0]).toHaveProperty("author", "Author McAuthorface");
  });

  it("throws when url is empty", async () => {
    await expect(runNode(TYPE, { url: "" })).rejects.toThrow("url is required");
  });
});
