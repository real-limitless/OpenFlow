import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleBooks";
const CREDS = { googleBooksOAuth2Api: { accessToken: "tok_books" } };

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body ?? "");
    },
  };
}

let calls: Array<{ url: string; method: string; body?: unknown }> = [];

function installFetch(routes: Record<string, unknown>, postRoutes?: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const fullUrl = String(url);
      const method = init?.method ?? "GET";
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      calls.push({ url: fullUrl, method, body });

      const auth = (init?.headers as Record<string, string>)?.["Authorization"];
      if (auth !== "Bearer tok_books") {
        return mockJsonResponse({ error: { message: "Unauthorized" } }, 401);
      }

      if (method === "POST" && postRoutes) {
        for (const [pattern, response] of Object.entries(postRoutes)) {
          if (fullUrl.includes(pattern)) {
            return mockJsonResponse(response);
          }
        }
      }

      const key = fullUrl.split("?")[0];
      if (key in routes) {
        return mockJsonResponse(routes[key]);
      }
      if (fullUrl in routes) {
        return mockJsonResponse(routes[fullUrl]);
      }

      return mockJsonResponse(null, 404);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = {
    id: "1",
    name: "N",
    type: TYPE,
    typeVersion: 1,
    position: [0, 0] as [number, number],
    parameters,
    credentials: { googleBooksOAuth2Api: { id: "1", name: "googleBooksOAuth2Api" } },
  };
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue googleBooks — n8n-nodes-base.googleBooks", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Books");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.googleBooks")).toBe(canonical);
  });

  it("Volume — getAll search returns items with kind books#volumes", async () => {
    const fakeResponse = {
      kind: "books#volumes",
      items: [
        { kind: "books#volume", id: "1", volumeInfo: { title: "JS" } },
        { kind: "books#volume", id: "2", volumeInfo: { title: "TS" } },
      ],
      totalItems: 2,
    };
    installFetch({
      "https://www.googleapis.com/books/v1/volumes": fakeResponse,
    });
    const out = await run({
      resource: "volume",
      operation: "getAll",
      searchQuery: "JavaScript programming",
      returnAll: false,
      limit: 5,
    });
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.items).toBeDefined();
    expect((json.items as Array<Record<string, unknown>>)[0].kind).toBe("books#volume");
    expect(json.totalItems).toBe(2);
    expect(calls[0]?.url).toContain("maxResults=5");
    expect(calls[0]?.method).toBe("GET");
  });

  it("Volume — get by ID returns volume", async () => {
    const fakeVolume = {
      kind: "books#volume",
      id: "zyTCAlFPjgYC",
      volumeInfo: { title: "Test Book", authors: ["Test Author"], description: "A test book" },
    };
    installFetch({
      "https://www.googleapis.com/books/v1/volumes/zyTCAlFPjgYC": fakeVolume,
    });
    const out = await run({
      resource: "volume",
      operation: "get",
      volumeId: "zyTCAlFPjgYC",
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "zyTCAlFPjgYC",
      volumeInfo: { title: "Test Book" },
    });
  });

  it("Bookshelf — get by user returns shelf", async () => {
    const fakeShelf = {
      kind: "books#bookshelf",
      id: "1001",
      title: "Test Shelf",
      volumeCount: 5,
    };
    installFetch({
      "https://www.googleapis.com/books/v1/users/117726895198069853348/bookshelves/1001": fakeShelf,
    });
    const out = await run({
      resource: "bookshelf",
      operation: "get",
      userId: "117726895198069853348",
      shelfId: "1001",
      myLibrary: false,
    });
    expect(out[0][0].json).toMatchObject({
      id: "1001",
      title: "Test Shelf",
    });
    expect(calls[0]?.url).toContain("/users/117726895198069853348/bookshelves/1001");
  });

  it("Bookshelf — getAll with myLibrary uses /mylibrary/bookshelves", async () => {
    const fakeResponse = {
      kind: "books#bookshelves",
      items: [
        { kind: "books#bookshelf", id: 1, title: "Favorites", volumeCount: 10 },
        { kind: "books#bookshelf", id: 2, title: "Reading now", volumeCount: 3 },
      ],
    };
    installFetch({
      "https://www.googleapis.com/books/v1/mylibrary/bookshelves": fakeResponse,
    });
    const out = await run({
      resource: "bookshelf",
      operation: "getAll",
      myLibrary: true,
    });
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.items as Array<Record<string, unknown>>)[0].kind).toBe("books#bookshelf");
    expect(calls[0]?.url).toContain("/mylibrary/bookshelves");
  });

  it("Bookshelf Volume — add volume returns success", async () => {
    installFetch(
      {},
      {
        addVolume: { success: true },
      },
    );
    const out = await run({
      resource: "bookshelfVolume",
      operation: "add",
      shelfId: "1001",
      volumeId: "abc123",
    });
    expect(out[0][0].json).toBeDefined();
    expect(out[0][0].json).not.toHaveProperty("error");
    expect(calls[0]?.url).toContain("/mylibrary/bookshelves/1001/addVolume");
  });

  it("Bookshelf Volume — remove volume returns empty object", async () => {
    installFetch(
      {},
      {
        removeVolume: {},
      },
    );
    const out = await run({
      resource: "bookshelfVolume",
      operation: "remove",
      shelfId: "1001",
      volumeId: "abc123",
    });
    expect(out[0][0].json).toBeDefined();
    expect(calls[0]?.url).toContain("/mylibrary/bookshelves/1001/removeVolume");
  });

  it("Bookshelf Volume — move volume", async () => {
    installFetch(
      {},
      {
        moveVolume: { result: "moved" },
      },
    );
    const out = await run({
      resource: "bookshelfVolume",
      operation: "move",
      shelfId: "1001",
      volumeId: "abc123",
      volumePosition: 0,
    });
    expect(out[0][0].json).toBeDefined();
    expect(calls[0]?.url).toContain("/mylibrary/bookshelves/1001/moveVolume");
    expect(calls[0]?.body).toMatchObject({ volumeId: "abc123", volumePosition: "0" });
  });

  it("Bookshelf Volume — clear returns empty object", async () => {
    installFetch(
      {},
      {
        clearVolumes: {},
      },
    );
    const out = await run({
      resource: "bookshelfVolume",
      operation: "clear",
      shelfId: "1001",
    });
    expect(out[0][0].json).toBeDefined();
    expect(calls[0]?.url).toContain("/mylibrary/bookshelves/1001/clearVolumes");
  });

  it("Bookshelf Volume — getAll with myLibrary uses /mylibrary/bookshelves route", async () => {
    const fakeResponse = {
      kind: "books#volumes",
      items: [
        { id: "v1", volumeInfo: { title: "Book 1" } },
        { id: "v2", volumeInfo: { title: "Book 2" } },
      ],
    };
    installFetch({
      "https://www.googleapis.com/books/v1/mylibrary/bookshelves/1001/volumes": fakeResponse,
    });
    const out = await run({
      resource: "bookshelfVolume",
      operation: "getAll",
      myLibrary: true,
      shelfId: "1001",
      returnAll: false,
      limit: 10,
    });
    expect(out[0][0].json).toMatchObject({
      items: [
        { id: "v1", volumeInfo: { title: "Book 1" } },
        { id: "v2", volumeInfo: { title: "Book 2" } },
      ],
    });
    expect(calls[0]?.url).toContain("/mylibrary/bookshelves/1001/volumes");
    expect(calls[0]?.url).toContain("maxResults=10");
  });

  it("Volume — search with filters applies query params", async () => {
    const fakeResponse = { kind: "books#volumes", items: [], totalItems: 0 };
    installFetch({
      "https://www.googleapis.com/books/v1/volumes": fakeResponse,
    });
    const out = await run({
      resource: "volume",
      operation: "getAll",
      searchQuery: "test",
      filters: { orderBy: "newest", printType: "books" },
      returnAll: true,
    });
    const url = calls[0]?.url ?? "";
    expect(url).toContain("q=test");
    expect(url).toContain("orderBy=newest");
    expect(url).toContain("printType=books");
    expect(calls[0]?.method).toBe("GET");
    expect(out[0][0].json).toBeDefined();
  });

  it("continueOnFail with missing required param yields error item", async () => {
    const out = await run(
      {
        resource: "volume",
        operation: "get",
        volumeId: "",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).error).toContain("volumeId");
  });

  it("throws error when no credential configured", async () => {
    const node = {
      id: "1",
      name: "N",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0] as [number, number],
      parameters: { resource: "volume", operation: "get", volumeId: "abc" },
    };
    const items: INodeExecutionData[] = [{ json: {} }];
    const ctx: ExecutionContext = createExecutionContext({
      node,
      workflow: {
        id: "wf",
        name: "T",
        active: false,
        nodes: [node],
        connections: {},
        settings: {},
      },
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
    });
    await expect(getExecutor(TYPE)!(ctx, node)).rejects.toThrow("credential is not configured");
  });

  it("Bookshelf Volume — missing userId throws when myLibrary is false", async () => {
    const out = await run(
      {
        resource: "bookshelfVolume",
        operation: "getAll",
        myLibrary: false,
        userId: "",
        shelfId: "1001",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).error).toContain("userId");
  });
});
