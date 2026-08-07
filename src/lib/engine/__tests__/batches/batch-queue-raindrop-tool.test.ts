import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.raindropTool";
const CREDENTIALS = {
  raindropOAuth2Api: { accessToken: "test-token" },
};

function mockRaindropResponse(body: unknown, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Map(),
    async text() {
      return JSON.stringify(body);
    },
  } as unknown as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("n8n-nodes-base.raindropTool", () => {
  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("bookmark get via AI agent pattern", async () => {
    const mockResponse = {
      result: true,
      item: {
        _id: 12345,
        link: "https://example.com",
        title: "Example",
        collection: { $id: 1, title: "Test" },
        tags: ["dev"],
        created: "2024-01-01T00:00:00.000Z",
      },
    };
    mockRaindropResponse(mockResponse);

    const [out] = await runNode(
      TYPE,
      {
        resource: "bookmark",
        operation: "get",
        bookmarkId: "12345",
      },
      [{}],
      { credentials: CREDENTIALS },
    );

    expect(out).toHaveLength(1);
    const item = out[0] as INodeExecutionData;
    expect(item.json).toHaveProperty("_id", 12345);
    expect(item.json).toHaveProperty("link", "https://example.com");
    expect(item.json).toHaveProperty("title", "Example");
    expect(item.json).toHaveProperty("tags");
    expect(item.json).toHaveProperty("created");
  });

  it("collection create with static params", async () => {
    const mockResponse = {
      result: true,
      item: {
        _id: 999,
        title: "AI Agent Collection",
        public: false,
        count: 0,
        created: "2024-06-01T12:00:00.000Z",
      },
    };
    mockRaindropResponse(mockResponse);

    const [out] = await runNode(
      TYPE,
      {
        resource: "collection",
        operation: "create",
        title: "AI Agent Collection",
      },
      [{}],
      { credentials: CREDENTIALS },
    );

    expect(out).toHaveLength(1);
    const item = out[0] as INodeExecutionData;
    expect(item.json).toHaveProperty("_id", 999);
    expect(item.json).toHaveProperty("title", "AI Agent Collection");
    expect(item.json).toHaveProperty("created");
  });

  it("tags get all", async () => {
    const mockResponse = {
      result: true,
      items: [
        { _id: 1, tags: ["dev", "web"] },
        { _id: 2, tags: ["design", "ui"] },
      ],
    };
    mockRaindropResponse(mockResponse);

    const [out] = await runNode(
      TYPE,
      { resource: "tag", operation: "getAll" },
      [{}],
      { credentials: CREDENTIALS },
    );

    expect(out).toHaveLength(2);
    const items = out as INodeExecutionData[];
    expect(items[0].json).toHaveProperty("_id");
    expect(items[0].json).toHaveProperty("tags");
  });

  it("user get", async () => {
    const mockResponse = {
      result: true,
      user: {
        _id: 42,
        email: "user@example.com",
        fullName: "Test User",
        avatar: "https://example.com/avatar.png",
      },
    };
    mockRaindropResponse(mockResponse);

    const [out] = await runNode(
      TYPE,
      { resource: "user", operation: "get" },
      [{}],
      { credentials: CREDENTIALS },
    );

    expect(out).toHaveLength(1);
    const item = out[0] as INodeExecutionData;
    expect(item.json).toHaveProperty("_id", 42);
    expect(item.json).toHaveProperty("email", "user@example.com");
    expect(item.json).toHaveProperty("fullName", "Test User");
    expect(item.json).toHaveProperty("avatar");
  });

  it("throws when credential is missing", async () => {
    await expect(
      runNode(TYPE, { resource: "user", operation: "get" }, [{}]),
    ).rejects.toThrow(/credential/i);
  });

  it("throws on API error", async () => {
    mockRaindropResponse({ message: "Not Found" }, 404);

    await expect(
      runNode(
        TYPE,
        { resource: "bookmark", operation: "get", bookmarkId: "99999" },
        [{}],
        { credentials: CREDENTIALS },
      ),
    ).rejects.toThrow(/Raindrop/);
  });

  it("bookmark get all with search", async () => {
    const mockResponse = {
      result: true,
      items: [
        { _id: 1, link: "https://ml.example.com", title: "ML Guide", tags: ["ml"], created: "2024-01-01T00:00:00.000Z" },
      ],
    };
    mockRaindropResponse(mockResponse);

    const [out] = await runNode(
      TYPE,
      {
        resource: "bookmark",
        operation: "getAll",
        search: "machine learning",
      },
      [{ json: { query: "machine learning" } }],
      { credentials: CREDENTIALS },
    );

    expect(out).toHaveLength(1);
    const item = out[0] as INodeExecutionData;
    expect(item.json).toHaveProperty("_id");
    expect(item.json).toHaveProperty("title");
  });

  it("continueOnFail passes errored items to output", async () => {
    mockRaindropResponse({ message: "Forbidden" }, 403);

    const [out] = await runNode(
      TYPE,
      { resource: "bookmark", operation: "get", bookmarkId: "bad" },
      [{}],
      { credentials: CREDENTIALS, continueOnFail: true },
    );

    expect(out).toHaveLength(1);
    const item = out[0] as INodeExecutionData;
    expect(item.json).toHaveProperty("error");
  });
});