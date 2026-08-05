import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.wordpressTool";
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

function installFetch(h: Handler) {
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

describe("wordpressTool executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create a post via AI agent", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/wp-json/wp/v2/posts")) {
        return mockResponse({
          id: 123,
          title: { raw: "AI-generated post" },
          content: { raw: "Body text written by the model" },
          status: "draft",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "post",
      operation: "create",
      title: "AI-generated post",
      content: "Body text written by the model",
      additionalFields: JSON.stringify({ status: "draft" }),
    }, [{ json: { title: "AI-generated post", content: "Body text written by the model" } }]);

    expect(out[0][0].json).toMatchObject({
      id: 123,
      status: "draft",
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/wp-json/wp/v2/posts");
    expect(lastBody).toMatchObject({
      title: "AI-generated post",
      content: "Body text written by the model",
      status: "draft",
    });
  });

  it("get a page by ID", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/wp-json/wp/v2/pages/42")) {
        return mockResponse({
          id: 42,
          slug: "about",
          title: { raw: "About Us" },
          content: { raw: "<p>About page</p>" },
          status: "publish",
          date: "2024-01-15T00:00:00",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "page",
      operation: "get",
      pageId: 42,
    });

    expect(out[0][0].json).toMatchObject({
      id: 42,
      slug: "about",
      title: { raw: "About Us" },
      status: "publish",
    });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("/wp-json/wp/v2/pages/42");
  });

  it("getAll users with limit", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/wp-json/wp/v2/users")) {
        return mockResponse([
          { id: 1, name: "Alice", slug: "alice", email: "alice@example.com" },
          { id: 2, name: "Bob", slug: "bob", email: "bob@example.com" },
          { id: 3, name: "Charlie", slug: "charlie", email: "charlie@example.com" },
        ]);
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "user",
      operation: "getAll",
      returnAll: false,
      limit: 3,
    });

    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toMatchObject({ id: 1, name: "Alice" });
    expect(out[0][2].json).toMatchObject({ id: 3, name: "Charlie" });
    expect(lastMethod).toBe("GET");
    expect(lastUrl).toContain("/wp-json/wp/v2/users");
  });

  it("delete a post with force", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/wp-json/wp/v2/posts/99") && url.includes("force=true")) {
        return mockResponse({
          id: 99,
          title: { raw: "Deleted post" },
          status: "trash",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "post",
      operation: "delete",
      postId: 99,
      options: JSON.stringify({ force: true }),
    });

    expect(out[0][0].json).toMatchObject({
      id: 99,
      status: "trash",
    });
    expect(lastMethod).toBe("DELETE");
    expect(lastUrl).toContain("/wp-json/wp/v2/posts/99");
    expect(lastUrl).toContain("force=true");
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
});