import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.cockpit";
const CREDS = {
  cockpitApi: {
    url: "https://demo.getcockpit.com",
    accessToken: "test-token-123",
  },
};

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
let lastBody: unknown;

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
    credentials: { cockpitApi: { name: "cockpitApi" } },
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

describe("cockpit executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create a collection entry", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/api/collections/save/news")) {
        return mockResponse({
          _id: "abc123",
          _created: 1700000000,
          title: "Hello",
          body: "World",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "collection",
      operation: "create",
      collection: "news",
      data: '{"title":"Hello","body":"World"}',
    });

    expect(out[0][0].json).toMatchObject({
      _id: "abc123",
      title: "Hello",
      body: "World",
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/api/collections/save/news");
    expect(lastBody).toMatchObject({
      data: { title: "Hello", body: "World" },
    });
  });

  it("get all collection entries", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/api/collections/get/news")) {
        return mockResponse({
          entries: [
            { _id: "1", title: "First" },
            { _id: "2", title: "Second" },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "collection",
      operation: "getAll",
      collection: "news",
      limit: 10,
    });

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ _id: "1", title: "First" });
    expect(out[0][1].json).toMatchObject({ _id: "2", title: "Second" });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/api/collections/get/news");
  });

  it("getAll with filter, limit, skip, sort, populate", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/api/collections/get/news")) {
        const b = body as Record<string, unknown>;
        expect(b.filter).toEqual({ published: true });
        expect(b.limit).toBe(5);
        expect(b.skip).toBe(2);
        expect(b.sort).toEqual({ _created: -1 });
        expect(b.populate).toBe(true);
        return mockResponse({ entries: [{ _id: "1", title: "Filtered" }] });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "collection",
      operation: "getAll",
      collection: "news",
      filter: '{"published":true}',
      limit: 5,
      skip: 2,
      sort: '{"_created":-1}',
      populate: true,
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ _id: "1" });
  });

  it("getAll returns empty array for no results", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/api/collections/get/news")) {
        return mockResponse({ entries: [] });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "collection",
      operation: "getAll",
      collection: "news",
    });

    expect(out[0]).toHaveLength(0);
  });

  it("store form submission", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/api/forms/submit/contact")) {
        return mockResponse({ success: true });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "form",
        operation: "store",
        form: "contact",
        data: '{"email":"test@example.com","message":"Hi"}',
      },
      [{ json: { email: "test@example.com", message: "Hi" } }],
    );

    expect(out[0][0].json).toMatchObject({ success: true });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/api/forms/submit/contact");
  });

  it("get singleton", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/api/singletons/get/site_settings")) {
        return mockResponse({
          site_name: "My Site",
          tagline: "Welcome",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "singleton",
      operation: "get",
      singleton: "site_settings",
    });

    expect(out[0][0].json).toMatchObject({
      site_name: "My Site",
      tagline: "Welcome",
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/api/singletons/get/site_settings");
  });

  it("update a collection entry", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/api/collections/save/news")) {
        return mockResponse({
          _id: "abc123",
          title: "Updated",
          body: "New content",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "collection",
      operation: "update",
      collection: "news",
      data: '{"_id":"abc123","title":"Updated","body":"New content"}',
    });

    expect(out[0][0].json).toMatchObject({
      _id: "abc123",
      title: "Updated",
    });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/api/collections/save/news");
  });

  it("continueOnFail returns error json", async () => {
    installFetch(() => mockResponse({ message: "Not authorized" }, 401));
    const out = await run(
      {
        resource: "collection",
        operation: "create",
        collection: "news",
        data: '{"title":"Test"}',
      },
      [{ json: {} }],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining("401"),
      }),
    });
  });

  it("throws on missing credential", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "collection",
        operation: "create",
        collection: "news",
      },
      credentials: {},
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
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    await expect(getExecutor(TYPE)!(ctx, node)).rejects.toThrow(
      /Cockpit API credentials are required/,
    );
  });
});
