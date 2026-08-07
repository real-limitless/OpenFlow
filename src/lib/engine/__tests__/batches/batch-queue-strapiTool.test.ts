import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.strapiTool";

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

let responseQueue: ReturnType<typeof mockResponse>[];

function installFetch() {
  responseQueue = [];
  vi.stubGlobal("fetch", vi.fn(async () => {
    return responseQueue.shift() ?? mockResponse({});
  }));
}

describe("batch-queue strapiTool — n8n-nodes-base.strapiTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Strapi Tool");
  });

  it("resolves the same executor under the shorthand type", () => {
    expect(getExecutor("nodes-base.strapiTool")).toBe(getExecutor(TYPE));
  });

  describe("create an entry", () => {
    it("sends POST to /api/:contentType and returns the created document", async () => {
      responseQueue = [mockResponse({
        data: { id: 1, documentId: "abc123def456", title: "Hello World", body: "First article" },
        meta: {},
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "entry",
          operation: "create",
          contentType: "articles",
          columns: "title,body",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { title: "Hello World", body: "First article" } }],
        continueOnFail: false,
        getCredential: async () => ({ url: "https://cms.example.com", apiVersion: "v4", apiToken: "tok_abc" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        data: { documentId: "abc123def456", title: "Hello World" },
      });
    });
  });

  describe("get many with sort and where filter", () => {
    it("returns data array with pagination meta", async () => {
      responseQueue = [mockResponse({
        data: [
          { id: 1, documentId: "a1", title: "Hello World" },
          { id: 2, documentId: "a2", title: "Another post" },
        ],
        meta: { pagination: { page: 1, pageSize: 25, pageCount: 1, total: 2 } },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "entry",
          operation: "getAll",
          contentType: "articles",
          returnAll: false,
          limit: 10,
          options: { sort: "createdAt:desc", where: '{"title":{"$contains":"Hello"}}' },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ url: "https://cms.example.com", apiVersion: "v4", apiToken: "tok_abc" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        data: [{ id: 1 }, { id: 2 }],
      });
    });
  });

  describe("update an entry", () => {
    it("sends PUT to /api/:contentType/:entryId", async () => {
      responseQueue = [mockResponse({
        data: { id: 1, documentId: "abc123def456", title: "Updated Title" },
        meta: {},
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "entry",
          operation: "update",
          contentType: "articles",
          entryId: "abc123def456",
          updateKey: "id",
          columns: "title",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { title: "Updated Title" } }],
        continueOnFail: false,
        getCredential: async () => ({ url: "https://cms.example.com", apiVersion: "v4", apiToken: "tok_abc" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        data: { documentId: "abc123def456", title: "Updated Title" },
      });
    });
  });

  describe("get single entry", () => {
    it("returns the document with matching documentId", async () => {
      responseQueue = [mockResponse({
        data: { id: 1, documentId: "abc123def456", title: "Hello World" },
        meta: {},
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "entry",
          operation: "get",
          contentType: "articles",
          entryId: "abc123def456",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ url: "https://cms.example.com", apiVersion: "v4", apiToken: "tok_abc" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        data: { documentId: "abc123def456" },
      });
    });
  });

  describe("delete an entry", () => {
    it("sends DELETE to /api/:contentType/:entryId", async () => {
      responseQueue = [mockResponse({
        data: { id: 1, documentId: "abc123def456", title: "Deleted Article" },
        meta: {},
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "entry",
          operation: "delete",
          contentType: "articles",
          entryId: "abc123def456",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ url: "https://cms.example.com", apiVersion: "v4", apiToken: "tok_abc" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        data: { documentId: "abc123def456" },
      });
    });
  });

  describe("continueOnFail", () => {
    it("returns error json when credential is missing and continueOnFail is true", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "entry",
          operation: "get",
          contentType: "articles",
          entryId: "abc123def456",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: expect.objectContaining({ message: expect.any(String) }) });
    });
  });
});
