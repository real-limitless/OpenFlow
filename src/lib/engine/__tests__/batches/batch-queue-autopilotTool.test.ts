import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.autopilotTool";

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

describe("batch-queue autopilotTool — n8n-nodes-base.autopilotTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Autopilot (AI Tool)");
  });

  describe("contact upsert", () => {
    it("sends POST to upsert a contact and returns contact_id + email", async () => {
      const apiResponse = { contact_id: "contact_123", email: "test@example.com" };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "contact",
          operation: "upsert",
          email: "test@example.com",
          additionalFields: { Company: "Acme" },
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
      expect(out[0][0].json).toMatchObject({ contact_id: "contact_123", email: "test@example.com" });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/contact");
      expect(new URL(call.url).host).toBe("api2.autopilothq.com");
      const body = jsonBody(call) as Record<string, unknown>;
      expect(body.email).toBe("test@example.com");
      expect(body.Company).toBe("Acme");
    });

    it("throws when email is missing for upsert", async () => {
      const node = makeNode({
        name: "N", type: TYPE,
        parameters: { resource: "contact", operation: "upsert", email: "" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow("email is required");
    });
  });

  describe("contact get", () => {
    it("sends GET and returns the contact object", async () => {
      const apiResponse = { contact_id: "person_123", email: "found@example.com" };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N", type: TYPE,
        parameters: { resource: "contact", operation: "get", contactId: "person_123" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0][0].json).toMatchObject({ contact_id: "person_123" });
      expect(lastCall().url).toContain("/contact/person_123");
    });
  });

  describe("contact getAll", () => {
    it("returns contacts from API response", async () => {
      const apiResponse = {
        contacts: [
          { contact_id: "c1", email: "a@b.com" },
          { contact_id: "c2", email: "c@d.com" },
        ],
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N", type: TYPE,
        parameters: { resource: "contact", operation: "getAll" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const contacts = out[0][0].json as Record<string, unknown>[];
      expect(contacts).toHaveLength(2);
      expect(contacts[0]).toMatchObject({ contact_id: "c1", email: "a@b.com" });
      expect(lastCall().url).toContain("/contacts");
    });
  });

  describe("list create", () => {
    it("sends POST to create a list and returns list_id", async () => {
      const apiResponse = { list_id: "list_42", name: "My Newsletter List" };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N", type: TYPE,
        parameters: { resource: "list", operation: "create", name: "My Newsletter List" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0][0].json).toMatchObject({ list_id: "list_42", name: "My Newsletter List" });
      expect(lastCall().method).toBe("POST");
      expect(lastCall().url).toContain("/list");
    });
  });

  describe("contact journey add", () => {
    it("sends POST to add contact to journey", async () => {
      responseQueue = [mockResponse({})];

      const node = makeNode({
        name: "N", type: TYPE,
        parameters: { resource: "contactJourney", operation: "add", contactId: "person_456", listId: "list_789" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0][0].json).toMatchObject({ contactId: "person_456", listId: "list_789", added: true });
      expect(lastCall().method).toBe("POST");
      expect(lastCall().url).toContain("/journey/list_789/contact");
    });
  });
});
