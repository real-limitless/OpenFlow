import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.strapi";
const CREDS = { strapiApi: { url: "https://cms.example.com", apiVersion: "v4", apiToken: "tok_abc" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: {
      get: (name: string) => {
        const h: Record<string, string> = { "content-type": "application/json" };
        return h[name.toLowerCase()] ?? null;
      },
    },
    async json() { return text ? JSON.parse(text) : {}; },
    async text() { return text; },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      return h(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: INodeExecutionData[] = [{ json: {} }],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { strapiApi: { name: "strapiApi" } },
  });
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
    getNodeInputItems: () => inputItems,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("strapi executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create an entry", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/api/articles")) {
        return mockResponse({
          data: {
            id: 1,
            documentId: "abc123def456",
            title: "Hello World",
            body: "First article body",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            publishedAt: "2024-01-01T00:00:00.000Z",
          },
          meta: {},
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "entry",
      operation: "create",
      contentType: "articles",
      dataToSend: {
        fields: [
          { fieldName: "title", fieldValue: "Hello World" },
          { fieldName: "body", fieldValue: "First article body" },
        ],
      },
    });

    expect(out[0][0].json).toMatchObject({
      data: {
        id: 1,
        documentId: "abc123def456",
        title: "Hello World",
        body: "First article body",
      },
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/api/articles");
  });

  it("get many with filtering", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/api/articles")) {
        return mockResponse({
          data: [
            { id: 1, documentId: "a1", title: "Hello World", createdAt: "2024-01-01T00:00:00.000Z" },
            { id: 2, documentId: "a2", title: "Another post", createdAt: "2024-01-02T00:00:00.000Z" },
          ],
          meta: { pagination: { page: 1, pageSize: 25, pageCount: 1, total: 2 } },
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "entry",
      operation: "getMany",
      contentType: "articles",
      returnAll: false,
      limit: 10,
      options: {
        sort: "createdAt:desc",
        filters: { title: { $contains: "Hello" } },
      },
    });

    expect(out[0][0].json).toMatchObject({
      data: [{ id: 1 }, { id: 2 }],
    });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("/api/articles");
    expect(lastUrl).toContain("sort=createdAt%3Adesc");
  });

  it("update an entry", async () => {
    installFetch((url, method, body) => {
      if (method === "PUT" && url.includes("/api/articles/abc123def456")) {
        return mockResponse({
          data: {
            id: 1,
            documentId: "abc123def456",
            title: "Updated Title",
            body: "First article body",
          },
          meta: {},
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "entry",
      operation: "update",
      contentType: "articles",
      documentId: "abc123def456",
      dataToSend: {
        fields: [
          { fieldName: "title", fieldValue: "Updated Title" },
        ],
      },
    });

    expect(out[0][0].json).toMatchObject({
      data: { documentId: "abc123def456", title: "Updated Title" },
    });
    expect(lastMethod).toBe("PUT");
    expect(lastUrl).toContain("/api/articles/abc123def456");
  });

  it("delete an entry", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/api/articles/abc123def456")) {
        return mockResponse({
          data: {
            id: 1,
            documentId: "abc123def456",
            title: "Deleted Article",
          },
          meta: {},
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "entry",
      operation: "delete",
      contentType: "articles",
      documentId: "abc123def456",
    });

    expect(out[0][0].json).toMatchObject({
      data: { documentId: "abc123def456" },
    });
    expect(lastMethod).toBe("DELETE");
    expect(lastUrl).toContain("/api/articles/abc123def456");
  });

  it("get single entry with populate", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/api/articles/abc123def456")) {
        return mockResponse({
          data: {
            id: 1,
            documentId: "abc123def456",
            title: "Hello World",
            author: { id: 1, name: "John" },
            category: { id: 3, name: "Tech" },
          },
          meta: {},
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "entry",
      operation: "get",
      contentType: "articles",
      documentId: "abc123def456",
      options: { populate: "author,category" },
    });

    expect(out[0][0].json).toMatchObject({
      data: {
        author: { name: "John" },
        category: { name: "Tech" },
      },
    });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("populate=author%2Ccategory");
  });

  it("continueOnFail returns error json", async () => {
    installFetch(() => mockResponse({ error: { message: "Forbidden" } }, 403));
    const out = await run(
      {
        resource: "entry",
        operation: "get",
        contentType: "articles",
        documentId: "nonexistent",
      },
      [{ json: {} }],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.objectContaining({ message: expect.any(String) }) });
  });
});