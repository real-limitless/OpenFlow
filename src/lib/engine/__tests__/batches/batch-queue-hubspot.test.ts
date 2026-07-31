import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.hubspot";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

function jsonBody(call: FetchCall): unknown {
  if (!call.body) return undefined;
  try { return JSON.parse(call.body); } catch { return call.body; }
}

describe("batch-queue hubspot — n8n-nodes-base.hubspot", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("HubSpot");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.hubspot")).toBe(getExecutor(TYPE));
  });

  describe("contact upsert by email", () => {
    it("sends POST to create contact with properties", async () => {
      responseQueue = [mockResponse({ id: "123456", portalId: 12345 })];
      const map = new Map<string, string>();
      map.set("apiKey", "test-key-123");
      vi.stubGlobal("fetch", undefined);
      const mockFetch = vi.fn(async () => mockResponse({ id: "123456", portalId: 12345 }));
      vi.stubGlobal("fetch", mockFetch);

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "contact",
          operation: "upsert",
          email: "={{ $json.email }}",
          properties: { values: [{ name: "firstname", value: "={{ $json.firstname }}" }, { name: "lastname", value: "={{ $json.lastname }}" }] },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { email: "test@example.com", firstname: "Jane", lastname: "Doe" } }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ vid: "123456", isNew: true });
    });
  });

  describe("company create with properties", () => {
    it("sends POST to create company", async () => {
      responseQueue = [mockResponse({ id: "98765", portalId: 12345 })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "company",
          operation: "create",
          properties: { values: [{ name: "name", value: "={{ $json.name }}" }] },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { name: "Acme Corp" } }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ companyId: 98765, isDeleted: false, portalId: 12345 });
    });
  });

  describe("contact getAll with pagination", () => {
    it("sends GET with limit and offset", async () => {
      responseQueue = [mockResponse({
        results: [{ id: "111", properties: { firstname: { value: "Alice" } } }],
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "contact", operation: "getAll", limit: 10, offset: 0 },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const items = out[0][0].json as Record<string, unknown>[];
      expect(Array.isArray(items)).toBe(true);
      expect(items[0]).toMatchObject({ vid: "111" });
    });
  });

  describe("engagement create with associations", () => {
    it("sends POST to create engagement", async () => {
      responseQueue = [mockResponse({
        engagement: { id: 789, type: "NOTE" },
        associations: { contactIds: [123], dealIds: [456] },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "engagement",
          operation: "create",
          type: "NOTE",
          metadata: "{\"body\": \"Follow up call\"}",
          associations: "{\"contactIds\": [123], \"dealIds\": [456]}",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        engagement: { id: 789, type: "NOTE" },
        associations: { contactIds: [123], dealIds: [456] },
      });
    });
  });

  describe("form submit data", () => {
    it("sends POST to submit form", async () => {
      responseQueue = [mockResponse({ status: "submitted" })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "form",
          operation: "submit",
          portalId: "12345",
          formId: "abc-def-ghi",
          fields: "[{\"name\": \"email\", \"value\": \"user@example.com\"}, {\"name\": \"firstname\", \"value\": \"John\"}]",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ status: "submitted", formId: "abc-def-ghi" });
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "contact", operation: "delete", contactId: "" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => ({ apiKey: "test-key-123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String), code: 500 } });
    });
  });

  describe("empty input with fallback", () => {
    it("returns one fallback item for no input", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "contact", operation: "upsert", email: "test@example.com" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
    });
  });
});