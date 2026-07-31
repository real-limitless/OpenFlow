import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailchimp";

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

describe("batch-queue mailchimp — n8n-nodes-base.mailchimp", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mailchimp");
  });

  describe("member create", () => {
    it("sends POST to create a member and returns the API response", async () => {
      const apiResponse = {
        id: "abc123",
        email_address: "test@example.com",
        status: "subscribed",
        merge_fields: {},
        _links: [],
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "member",
          operation: "create",
          list: "abc123",
          email: "test@example.com",
          status: "subscribed",
          options: { vip: true, language: "en" },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ email_address: "test@example.com", status: "subscribed" });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/lists/abc123/members");
      expect(new URL(call.url).host).toBe("us1.api.mailchimp.com");
      const body = jsonBody(call) as Record<string, unknown>;
      expect(body.email_address).toBe("test@example.com");
      expect(body.status).toBe("subscribed");
      expect(body.vip).toBe(true);
      expect(body.language).toBe("en");
    });

    it("derives API base from API key datacenter suffix", async () => {
      responseQueue = [mockResponse({ id: "1", email_address: "a@b.com", status: "subscribed" })];
      const node = makeNode({
        name: "N", type: TYPE,
        parameters: { resource: "member", operation: "create", list: "l1", email: "a@b.com", status: "subscribed" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "key-us5" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await executor(ctx, node);
      expect(new URL(lastCall().url).host).toBe("us5.api.mailchimp.com");
    });
  });

  describe("member get all with pagination", () => {
    it("sends GET with limit and returns members array", async () => {
      const apiResponse = {
        members: [
          { id: "1", email_address: "alice@example.com", status: "subscribed" },
          { id: "2", email_address: "bob@example.com", status: "cleaned" },
        ],
        total_items: 2,
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "member",
          operation: "getAll",
          list: "abc123",
          returnAll: false,
          limit: 50,
          options: { status: "subscribed" },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ email_address: "alice@example.com", status: "subscribed" });
      expect(out[0][1].json).toMatchObject({ email_address: "bob@example.com", status: "cleaned" });
      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url).toContain("/lists/abc123/members");
    });
  });

  describe("campaign send", () => {
    it("sends POST to send a campaign", async () => {
      responseQueue = [mockResponse({})];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "campaign",
          operation: "send",
          campaignId: "camp_123",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ campaignId: "camp_123", status: "sent" });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/campaigns/camp_123/actions/send");
    });
  });

  describe("member tag create", () => {
    it("sends POST to add tags to a member", async () => {
      responseQueue = [mockResponse({})];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "memberTag",
          operation: "create",
          list: "abc123",
          email: "test@example.com",
          tags: "vip,newsletter",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ success: true });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/lists/abc123/members");
      expect(call.url).toContain("/tags");
      const body = jsonBody(call) as Record<string, unknown>;
      expect(body.tags).toEqual([
        { name: "vip", status: "active" },
        { name: "newsletter", status: "active" },
      ]);
    });
  });

  describe("member update with UI fields", () => {
    it("reads mergeFieldsUi from updateFields when jsonParameters=false", async () => {
      responseQueue = [mockResponse({ id: "1", email_address: "test@example.com", status: "unsubscribed", merge_fields: { FNAME: "Updated" } })];

      const node = makeNode({
        name: "N", type: TYPE,
        parameters: {
          resource: "member",
          operation: "update",
          list: "abc123",
          email: "test@example.com",
          jsonParameters: false,
          updateFields: {
            status: "unsubscribed",
            mergeFieldsUi: { values: [{ name: "FNAME", value: "Updated" }] },
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0][0].json).toMatchObject({ email_address: "test@example.com", status: "unsubscribed" });
      const body = jsonBody(lastCall()) as Record<string, unknown>;
      expect(body.status).toBe("unsubscribed");
      expect(body.merge_fields).toEqual({ FNAME: "Updated" });
    });
  });

  describe("member getAll returnAll pagination", () => {
    it("loops with offset/count when returnAll=true", async () => {
      responseQueue = [
        mockResponse({ members: [{ id: "1", email_address: "a@b.com", status: "subscribed" }], total_items: 3 }),
        mockResponse({ members: [{ id: "2", email_address: "c@d.com", status: "cleaned" }], total_items: 3 }),
        mockResponse({ members: [{ id: "3", email_address: "e@f.com", status: "pending" }], total_items: 3 }),
        mockResponse({ members: [], total_items: 3 }),
      ];

      const node = makeNode({
        name: "N", type: TYPE,
        parameters: { resource: "member", operation: "getAll", list: "abc123", returnAll: true },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(3);
      expect(calls.length).toBeGreaterThanOrEqual(3);
      expect(calls[0].url).toContain("offset=0");
      expect(calls[1].url).toContain("offset=1000");
    });
  });

  describe("member delete", () => {
    it("sends DELETE and returns empty error on success", async () => {
      responseQueue = [mockResponse({}, { status: 204 })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "member",
          operation: "delete",
          list: "abc123",
          email: "test@example.com",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: "" });
      const call = lastCall();
      expect(call.method).toBe("DELETE");
      expect(call.url).toContain("/lists/abc123/members");
    });

    it("handles 404 on delete gracefully", async () => {
      responseQueue = [mockResponse({ detail: "Resource Not Found" }, { status: 404 })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "member",
          operation: "delete",
          list: "abc123",
          email: "nonexistent@example.com",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: "" });
    });
  });

  describe("continueOnFail", () => {
    it("returns error items on missing required parameters", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "member",
          operation: "create",
          list: "",
          email: "",
          status: "",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
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
      responseQueue = [mockResponse({ id: "1", email_address: "test@example.com", status: "subscribed" })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "member",
          operation: "create",
          list: "abc123",
          email: "test@example.com",
          status: "subscribed",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key-us1" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
    });
  });
});