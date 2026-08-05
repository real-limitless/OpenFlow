import { describe, it, expect, beforeEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.contentful";

function mockFetch(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

const MOCK_ENTRY_RESPONSE = {
  sys: { id: "abc123", type: "Entry" },
  fields: { title: { "en-US": "Test Entry" } },
};

const MOCK_ENTRIES_RESPONSE = {
  items: [
    { sys: { id: "1" }, fields: { title: { "en-US": "First" } } },
    { sys: { id: "2" }, fields: { title: { "en-US": "Second" } } },
  ],
  total: 2,
  skip: 0,
  limit: 100,
};

const MOCK_LOCALES_RESPONSE = {
  items: [
    { code: "en-US", name: "English (United States)", default: true, fallbackCode: null },
    { code: "de-DE", name: "German (Germany)", default: false, fallbackCode: "en-US" },
  ],
};

const MOCK_SPACE_RESPONSE = {
  sys: { type: "Space", id: "my-space" },
  name: "My Contentful Space",
};

const MOCK_RAW_RESPONSE = {
  items: [{ sys: { id: "raw1" }, fields: { title: { "en-US": "Raw" } } }],
  total: 1,
  skip: 0,
  limit: 5,
  includes: { Entry: [] },
};

describe("batch-queue contentful — n8n-nodes-base.contentful", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("throws when credential is missing", async () => {
    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({ type: TYPE, parameters: { resource: "entry", operation: "get", entryId: "test-id" } });
    const ctx = makeCtx([{}], node);
    await expect(executor(ctx, node)).rejects.toThrow(/credential/i);
  });

  it("gets a single entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, MOCK_ENTRY_RESPONSE));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "entry",
        operation: "get",
        environmentId: "master",
        entryId: "my-entry-id",
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      spaceId: "my-space",
      contentDeliveryApiAccessToken: "cda-token",
      contentPreviewApiAccessToken: "cpa-token",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("sys");
    expect((output[0].json as Record<string, unknown>).sys as Record<string, unknown>).toHaveProperty("id", "abc123");

    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toContain("cdn.contentful.com");
    expect(callUrl).toContain("/spaces/my-space/environments/master/entries/my-entry-id");
  });

  it("gets many entries with filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, MOCK_ENTRIES_RESPONSE));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "entry",
        operation: "getAll",
        environmentId: "master",
        returnAll: false,
        limit: 10,
        additionalFields: {
          query: "n8n",
          order: "sys.createdAt",
        },
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      spaceId: "my-space",
      contentDeliveryApiAccessToken: "cda-token",
      contentPreviewApiAccessToken: "cpa-token",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(2);
    expect(output[0].json).toHaveProperty("sys");
    expect((output[0].json as Record<string, unknown>).sys as Record<string, unknown>).toHaveProperty("id", "1");
    expect(output[1].json).toHaveProperty("sys");
    expect((output[1].json as Record<string, unknown>).sys as Record<string, unknown>).toHaveProperty("id", "2");

    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toContain("query=n8n");
    expect(callUrl).toContain("order=sys.createdAt");
    expect(callUrl).toContain("limit=10");
  });

  it("gets all locales", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, MOCK_LOCALES_RESPONSE));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "locale",
        operation: "getAll",
        environmentId: "master",
        returnAll: true,
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      spaceId: "my-space",
      contentDeliveryApiAccessToken: "cda-token",
      contentPreviewApiAccessToken: "cpa-token",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(2);
    expect(output[0].json).toHaveProperty("code", "en-US");
    expect(output[1].json).toHaveProperty("code", "de-DE");
  });

  it("gets space info", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, MOCK_SPACE_RESPONSE));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "space",
        operation: "get",
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      spaceId: "my-space",
      contentDeliveryApiAccessToken: "cda-token",
      contentPreviewApiAccessToken: "cpa-token",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("name", "My Contentful Space");
  });

  it("paginates getAll when returnAll is true", async () => {
    const page1 = {
      items: [
        { sys: { id: "a" }, fields: { title: { "en-US": "A" } } },
        { sys: { id: "b" }, fields: { title: { "en-US": "B" } } },
      ],
      total: 4,
      skip: 0,
      limit: 2,
    };
    const page2 = {
      items: [
        { sys: { id: "c" }, fields: { title: { "en-US": "C" } } },
        { sys: { id: "d" }, fields: { title: { "en-US": "D" } } },
      ],
      total: 4,
      skip: 2,
      limit: 2,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFetch(200, page1))
      .mockResolvedValueOnce(mockFetch(200, page2));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "entry",
        operation: "getAll",
        environmentId: "master",
        returnAll: true,
        additionalFields: {},
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      spaceId: "my-space",
      contentDeliveryApiAccessToken: "cda-token",
      contentPreviewApiAccessToken: "cpa-token",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(4);
    expect(output[0].json).toHaveProperty("sys");
    expect((output[0].json as Record<string, unknown>).sys as Record<string, unknown>).toHaveProperty("id", "a");
    expect(output[3].json).toHaveProperty("sys");
    expect((output[3].json as Record<string, unknown>).sys as Record<string, unknown>).toHaveProperty("id", "d");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls[0]).toContain("skip=0");
    expect(urls[1]).toContain("skip=2");
  });

  it("paginates getAll with returnAll+rawData", async () => {
    const page1 = {
      items: [{ sys: { id: "p1" }, fields: { title: { "en-US": "P1" } } }],
      total: 3,
      skip: 0,
      limit: 1,
      includes: { Entry: [] },
    };
    const page2 = {
      items: [{ sys: { id: "p2" }, fields: { title: { "en-US": "P2" } } }],
      total: 3,
      skip: 1,
      limit: 1,
      includes: { Entry: [] },
    };
    const page3 = {
      items: [{ sys: { id: "p3" }, fields: { title: { "en-US": "P3" } } }],
      total: 3,
      skip: 2,
      limit: 1,
      includes: { Entry: [] },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockFetch(200, page1))
      .mockResolvedValueOnce(mockFetch(200, page2))
      .mockResolvedValueOnce(mockFetch(200, page3));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "entry",
        operation: "getAll",
        environmentId: "master",
        returnAll: true,
        additionalFields: { rawData: true },
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      spaceId: "my-space",
      contentDeliveryApiAccessToken: "cda-token",
      contentPreviewApiAccessToken: "cpa-token",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("raw");
    const raw = (output[0].json as Record<string, unknown>).raw as Record<string, unknown>;
    expect(raw.items).toHaveLength(3);
    expect((raw.items as Array<Record<string, unknown>>)[0].sys).toHaveProperty("id", "p1");
    expect((raw.items as Array<Record<string, unknown>>)[2].sys).toHaveProperty("id", "p3");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns raw data when rawData is enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetch(200, MOCK_RAW_RESPONSE));
    vi.stubGlobal("fetch", fetchMock);

    const executor = (await import("@/lib/engine/node-runtime")).getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "entry",
        operation: "getAll",
        environmentId: "master",
        returnAll: false,
        limit: 5,
        additionalFields: {
          rawData: true,
        },
      },
    });
    const ctx = makeCtx([{}], node);
    vi.spyOn(ctx, "getCredential").mockResolvedValue({
      spaceId: "my-space",
      contentDeliveryApiAccessToken: "cda-token",
      contentPreviewApiAccessToken: "cpa-token",
    });

    const [output] = await executor(ctx, node);
    expect(output).toHaveLength(1);
    expect(output[0].json).toHaveProperty("raw");
    expect((output[0].json as Record<string, unknown>).raw).toHaveProperty("items");
    expect((output[0].json as Record<string, unknown>).raw).toHaveProperty("total", 1);
    expect((output[0].json as Record<string, unknown>).raw).toHaveProperty("includes");
  });
});
