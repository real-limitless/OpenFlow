import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.ghost";
const CONTENT_CREDS = {
  ghostContentApi: { url: "https://demo.ghost.io", apiKey: "content_key_abc" },
};
const ADMIN_CREDS = {
  ghostAdminApi: { url: "https://demo.ghost.io", apiKey: "abc123:aabbccddeeff00112233445566778899" },
};

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
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
let lastHeaders: Record<string, string>;
let calls: Array<{ url: string; method: string; body?: unknown }>;

function installFetch(h: Handler) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      lastHeaders = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: lastUrl, method: lastMethod, body });
      return h(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: INodeExecutionData[] = [{ json: {} }],
  creds?: Record<string, unknown>,
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { ghostAdminApi: { name: "ghostAdminApi" } },
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
    getCredential: async (name) => (creds ?? CONTENT_CREDS)[name as keyof typeof creds] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ghost executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("contentApi – get a single post", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/content/posts/abc123/")) {
        return mockResponse({
          posts: [{ id: "abc123", title: "Test Post", slug: "test-post", updated_at: "2025-01-01T00:00:00Z" }],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      { source: "contentApi", resource: "post", operation: "get", postId: "abc123" },
      [{ json: {} }],
      CONTENT_CREDS,
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      posts: [{ id: "abc123", title: "Test Post" }],
    });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("/content/posts/abc123/");
    expect(lastUrl).toMatch(/[?&]key=/);
    expect(lastHeaders["Authorization"]).toBeUndefined();
  });

  it("contentApi – get with expression postId", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/content/posts/expr-id/")) {
        return mockResponse({
          posts: [{ id: "expr-id", title: "From Expression", slug: "from-expr", updated_at: "2025-01-01T00:00:00Z" }],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      { source: "contentApi", resource: "post", operation: "get", postId: "={{ $json.postId }}" },
      [{ json: { postId: "expr-id" } }],
      CONTENT_CREDS,
    );

    expect(out[0][0].json).toMatchObject({
      posts: [{ id: "expr-id", title: "From Expression" }],
    });
  });

  it("contentApi – getAll with pagination", async () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({
      id: `p00${i}`,
      title: `Post ${i}`,
      slug: `post-${i}`,
      updated_at: "2025-01-01T00:00:00Z",
    }));

    installFetch((url) => {
      if (url.includes("/content/posts/")) {
        return mockResponse({ posts, meta: { pagination: { page: 1, limit: 5, pages: 1, total: 5 } } });
      }
      return mockResponse({});
    });

    const out = await run(
      { source: "contentApi", resource: "post", operation: "getAll", limit: 5 },
      [{ json: {} }],
      CONTENT_CREDS,
    );

    expect(out[0]).toHaveLength(5);
    expect(out[0][0].json.id).toBe("p000");
    expect(out[0][4].json.id).toBe("p004");
    expect(lastUrl).toContain("limit=5");
    expect(lastUrl).toMatch(/[?&]key=/);
  });

  it("adminApi – create a post with top-level status", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/admin/posts/")) {
        const b = body as { posts: Array<Record<string, unknown>> };
        return mockResponse({
          posts: [{ id: "new123", title: b?.posts?.[0]?.title, status: b?.posts?.[0]?.status, updated_at: "2025-01-01T00:00:00Z" }],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        source: "adminApi", resource: "post", operation: "create",
        title: "Test from n8n", html: "<p>Hello world</p>", contentFormat: "html",
        status: "draft",
      },
      [{ json: { title: "Test from n8n", html: "<p>Hello world</p>" } }],
      ADMIN_CREDS,
    );

    expect(out[0][0].json).toMatchObject({
      posts: [{ id: "new123", title: "Test from n8n", status: "draft" }],
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/admin/posts/");
    expect(lastUrl).not.toMatch(/[?&]key=/);
    expect(lastHeaders["Authorization"]).toMatch(/^Ghost /);
    expect(lastHeaders["Accept-Version"]).toBe("v5.0");
  });

  it("adminApi – create a post with additionalFields.status", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/admin/posts/")) {
        const b = body as { posts: Array<Record<string, unknown>> };
        return mockResponse({
          posts: [{ id: "new456", title: b?.posts?.[0]?.title, status: b?.posts?.[0]?.status, updated_at: "2025-01-01T00:00:00Z" }],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        source: "adminApi", resource: "post", operation: "create",
        title: "Test from n8n", html: "<p>Hello world</p>", contentFormat: "html",
        additionalFields: { status: "published" },
      },
      [{ json: { title: "Test from n8n", html: "<p>Hello world</p>" } }],
      ADMIN_CREDS,
    );

    expect(out[0][0].json).toMatchObject({
      posts: [{ id: "new456", title: "Test from n8n", status: "published" }],
    });
    expect(lastHeaders["Authorization"]).toMatch(/^Ghost /);
    expect(lastUrl).not.toMatch(/[?&]key=/);
  });

  it("adminApi – update a post", async () => {
    installFetch((url, method, body) => {
      if (method === "PUT" && url.includes("/admin/posts/abc123/")) {
        const b = body as { posts: Array<Record<string, unknown>> };
        return mockResponse({
          posts: [{ id: "abc123", title: b?.posts?.[0]?.title ?? "Updated title", updated_at: "2025-01-01T00:00:00Z" }],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        source: "adminApi", resource: "post", operation: "update",
        postId: "abc123", title: "Updated title",
      },
      [{ json: { postId: "abc123", title: "Updated title" } }],
      ADMIN_CREDS,
    );

    expect(out[0][0].json).toMatchObject({
      posts: [{ id: "abc123", title: "Updated title" }],
    });
    expect(lastMethod).toBe("PUT");
    expect(lastUrl).toContain("/admin/posts/abc123/");
    expect(lastUrl).not.toMatch(/[?&]key=/);
    expect(lastHeaders["Authorization"]).toMatch(/^Ghost /);
  });

  it("adminApi – delete a post", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/admin/posts/abc123/")) {
        return mockResponse(null, 204);
      }
      return mockResponse({});
    });

    const out = await run(
      { source: "adminApi", resource: "post", operation: "delete", postId: "abc123" },
      [{ json: { postId: "abc123" } }],
      ADMIN_CREDS,
    );

    expect(out[0][0].json).toEqual({});
    expect(lastMethod).toBe("DELETE");
    expect(lastUrl).toContain("/admin/posts/abc123/");
    expect(lastUrl).not.toMatch(/[?&]key=/);
    expect(lastHeaders["Authorization"]).toMatch(/^Ghost /);
  });

  it("continueOnFail – still produces output on error", async () => {
    installFetch(() => mockResponse({ errors: [{ message: "Not found" }] }, 404));

    const out = await run(
      { source: "contentApi", resource: "post", operation: "get", postId: "nonexistent" },
      [{ json: {} }],
      CONTENT_CREDS,
      { continueOnFail: true },
    );

    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toHaveProperty("message");
  });
});
