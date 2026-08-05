import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.raindrop";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 204 ? "No Content" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
}

let calls: FetchCall[];

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({})) {
  const responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

describe("batch-queue raindrop — n8n-nodes-base.raindrop", () => {
  beforeEach(() => {
    installFetch(mockResponse({ result: true, _id: 123, link: "https://example.com", title: "Test", collection: {}, tags: [], created: "2024-01-01T00:00:00.000Z" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Raindrop");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.raindrop")).toBe(getExecutor(TYPE));
  });

  describe("bookmark get", () => {
    it("retrieves a bookmark via GET /raindrop/:id", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "bookmark",
          operation: "get",
          bookmarkId: "12345",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("_id", 123);
      expect(out[0][0].json).toHaveProperty("link");
      expect(out[0][0].json).toHaveProperty("title");
      expect(lastCall().url).toContain("/raindrop/12345");
    });
  });

  describe("collection create", () => {
    it("creates a collection via POST /collection with evaluated expression", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "collection",
          operation: "create",
          title: "={{ $json.name }}",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { name: "Test Collection" } }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("_id", 123);
      expect(out[0][0].json).toHaveProperty("title", "Test");
      expect(lastCall().method).toBe("POST");
      expect(lastCall().url).toContain("/collection");
    });
  });

  describe("tags get all", () => {
    it("lists tags via GET /tags", async () => {
      installFetch(mockResponse({ result: [{ _id: 1, tags: ["tag1", "tag2"] }] }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "tag",
          operation: "getAll",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("result");
      expect(Array.isArray(out[0][0].json.result)).toBe(true);
      expect(lastCall().url).toContain("/tags");
    });
  });

  describe("user get", () => {
    it("retrieves user profile via GET /user", async () => {
      installFetch(mockResponse({ _id: 1, email: "user@example.com", fullName: "Test User", avatar: "https://example.com/avatar.jpg" }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "user",
          operation: "get",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("email", "user@example.com");
      expect(out[0][0].json).toHaveProperty("fullName", "Test User");
      expect(lastCall().url).toContain("/user");
    });
  });

  describe("error path", () => {
    it("throws on API error when continueOnFail is false", async () => {
      installFetch(mockResponse({ message: "Invalid URL", error: "invalid_url" }, { status: 400 }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "bookmark",
          operation: "create",
          url: "not-a-valid-url",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { url: "not-a-valid-url" } }],
        continueOnFail: false,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow();
    });

    it("passes errored item to output when continueOnFail is true", async () => {
      installFetch(mockResponse({ message: "Invalid URL", error: "invalid_url" }, { status: 400 }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "bookmark",
          operation: "create",
          url: "not-a-valid-url",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { url: "not-a-valid-url" } }],
        continueOnFail: true,
        getCredential: async () => ({ accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
    });
  });
});