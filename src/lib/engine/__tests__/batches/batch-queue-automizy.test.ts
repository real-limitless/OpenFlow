import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.automizy";

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
    statusText: status === 200 ? "OK" : status === 400 ? "Bad Request" : "Error",
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

describe("batch-queue automizy — n8n-nodes-base.automizy", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Automizy");
  });

  describe("contact create", () => {
    it("sends POST to create a contact and returns the API response", async () => {
      const apiResponse = {
        id: "contact-uuid",
        email: "test@example.com",
        firstName: "John",
        status: "active",
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "contact",
          operation: "create",
          email: "test@example.com",
          firstName: "John",
          listId: "abc123",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-api-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "contact-uuid", email: "test@example.com", status: "active" });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/contacts");
      expect(call.headers.Authorization).toBe("Bearer test-api-key");
      const body = jsonBody(call) as Record<string, unknown>;
      expect(body.email).toBe("test@example.com");
      expect(body.firstName).toBe("John");
      expect(body.listId).toBe("abc123");
    });

    it("throws when email is missing for contact create", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "contact",
          operation: "create",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-api-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow("required parameter 'email' is missing");
    });
  });

  describe("contact getAll", () => {
    it("sends GET and returns contacts array", async () => {
      const apiResponse = {
        contacts: [
          { id: "1", email: "alice@example.com", status: "active" },
          { id: "2", email: "bob@example.com", status: "inactive" },
        ],
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "contact",
          operation: "getAll",
          listId: "abc123",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-api-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        contacts: [
          { email: "alice@example.com" },
          { email: "bob@example.com" },
        ],
      });
      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url).toContain("/contacts");
      expect(call.url).toContain("listId=abc123");
    });

    it("returns empty contacts array when API returns no contacts", async () => {
      responseQueue = [mockResponse({ contacts: [] })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "contact",
          operation: "getAll",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-api-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0][0].json).toEqual({ contacts: [] });
    });
  });

  describe("continueOnFail", () => {
    it("returns error items on missing required parameters", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "contact",
          operation: "create",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => ({ apiKey: "test-api-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("missing") });
    });
  });

  describe("empty input with fallback", () => {
    it("returns one fallback item for no input", async () => {
      responseQueue = [mockResponse({ id: "1", email: "test@example.com", status: "active" })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "contact",
          operation: "create",
          email: "test@example.com",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-api-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
    });
  });
});
