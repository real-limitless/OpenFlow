import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.wordpress";
const CREDS = { wordpressApi: { url: "https://example.com", username: "admin", password: "app_pass" } };

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
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;
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
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      calls.push({ url: lastUrl, method: lastMethod, body });
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
    credentials: { wordpressApi: { name: "wordpressApi" } },
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

describe("wordpress executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create a post", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/wp-json/wp/v2/posts")) {
        return mockResponse({
          id: 123,
          title: { raw: "My test post" },
          content: { raw: "<p>Hello world</p>" },
          status: "draft",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "post",
      operation: "create",
      title: "My test post",
      content: "<p>Hello world</p>",
      status: "draft",
    });

    expect(out[0][0].json).toMatchObject({
      id: 123,
      status: "draft",
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/wp-json/wp/v2/posts");
    expect(lastBody).toMatchObject({
      title: "My test post",
      content: "<p>Hello world</p>",
      status: "draft",
    });
  });

  it("get a post by ID", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/wp-json/wp/v2/posts/1")) {
        return mockResponse({
          id: 1,
          title: { raw: "Test Post" },
          content: { raw: "<p>Content</p>" },
          status: "publish",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "post",
      operation: "get",
      postId: 1,
    });

    expect(out[0][0].json).toMatchObject({
      id: 1,
      title: { raw: "Test Post" },
      status: "publish",
    });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("/wp-json/wp/v2/posts/1");
  });

  it("list posts with filters", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/wp-json/wp/v2/posts")) {
        return mockResponse([
          { id: 1, title: { raw: "Hello" }, status: "publish" },
          { id: 2, title: { raw: "World" }, status: "publish" },
        ]);
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "post",
      operation: "getAll",
      search: "hello",
      perPage: 5,
      order: "desc",
      orderBy: "date",
    });

    expect(out[0][0].json).toMatchObject({ id: 1 });
    expect(out[0][1].json).toMatchObject({ id: 2 });
    expect(lastUrl).toContain("search=hello");
    expect(lastUrl).toContain("per_page=5");
    expect(lastUrl).toContain("order=desc");
    expect(lastUrl).toContain("orderby=date");
  });

  it("update a post", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/wp-json/wp/v2/posts/1")) {
        return mockResponse({
          id: 1,
          title: { raw: "Updated title" },
          status: "publish",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "post",
      operation: "update",
      postId: 1,
      title: "Updated title",
    });

    expect(out[0][0].json).toMatchObject({
      id: 1,
      title: { raw: "Updated title" },
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/wp-json/wp/v2/posts/1");
    expect(lastBody).toMatchObject({
      title: "Updated title",
    });
  });

  it("create a user", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/wp-json/wp/v2/users")) {
        return mockResponse({
          id: 42,
          username: "newuser",
          email: "new@example.com",
          name: "New User",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "user",
      operation: "create",
      username: "newuser",
      password: "secure123",
      email: "new@example.com",
      name: "New User",
    });

    expect(out[0][0].json).toMatchObject({
      id: 42,
      username: "newuser",
      email: "new@example.com",
      name: "New User",
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/wp-json/wp/v2/users");
    expect(lastBody).toMatchObject({
      username: "newuser",
      password: "secure123",
      email: "new@example.com",
      name: "New User",
    });
  });

  it("continueOnFail returns error json", async () => {
    installFetch(() => mockResponse({ code: "rest_forbidden", message: "Sorry, you are not allowed to do that." }, 403));
    const out = await run(
      {
        resource: "post",
        operation: "get",
        postId: 999,
      },
      [{ json: {} }],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.objectContaining({ message: expect.stringContaining("not allowed") }) });
  });

  it("page create with page-specific fields", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/wp-json/wp/v2/pages")) {
        return mockResponse({
          id: 7,
          title: { raw: "About" },
          status: "publish",
          parent: 0,
          menu_order: 1,
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "page",
      operation: "create",
      title: "About",
      status: "publish",
      menuOrder: 1,
    });

    expect(out[0][0].json).toMatchObject({ id: 7, title: { raw: "About" } });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/wp-json/wp/v2/pages");
    expect(lastBody).toMatchObject({ title: "About", status: "publish", menu_order: 1 });
  });

  it("getAll returns empty array for no results", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/wp-json/wp/v2/posts")) {
        return mockResponse([]);
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "post",
      operation: "getAll",
      search: "nonexistent",
    });

    expect(out[0]).toHaveLength(0);
  });
});