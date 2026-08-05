import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions, getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.egoiTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; }, entries() { return [][Symbol.iterator](); } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(
  responses: ReturnType<typeof mockResponse> | ReturnType<typeof mockResponse>[] = mockResponse({}),
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
    return responseQueue.shift() ?? mockResponse({});
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

function jsonBody(call: FetchCall): unknown {
  if (!call.body) return undefined;
  try { return JSON.parse(call.body); } catch { return call.body; }
}

describe("batch-queue egoiTool — n8n-nodes-base.egoiTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves to egoi executor and description via alias", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe("n8n-nodes-base.egoi");
    expect(desc.displayName).toBe("E-goi");
    expect(desc.category).toBe("Communication");
  });

  it("creates a contact and returns the API response", async () => {
    const apiResponse = {
      subscriber_hash: "abc123def456",
      email: "ai-contact@example.com",
      first_name: "Alice",
      status: "active",
      uid: "12345",
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "contact",
        operation: "create",
        listId: 1,
        email: "ai-contact@example.com",
        options: { status: "active", firstName: "Alice" },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { email: "ai-contact@example.com", firstName: "Alice" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      subscriber_hash: "abc123def456",
      email: "ai-contact@example.com",
      first_name: "Alice",
      status: "active",
    });
    const call = lastCall();
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/lists/1/contacts");
    expect(call.headers["Api-Key"]).toBe("test-api-key");
    const body = jsonBody(call) as Record<string, unknown>;
    expect(body.email).toBe("ai-contact@example.com");
    expect(body.first_name).toBe("Alice");
    expect(body.status).toBe("active");
  });

  it("gets a contact by email", async () => {
    const apiResponse = {
      subscriber_hash: "abc123",
      email: "ai-contact@example.com",
      status: "active",
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "contact",
        operation: "get",
        listId: 1,
        email: "ai-contact@example.com",
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
      subscriber_hash: "abc123",
      email: "ai-contact@example.com",
      status: "active",
    });
    const call = lastCall();
    expect(call.method).toBe("GET");
    expect(call.url).toContain("/lists/1/contacts/ai-contact%40example.com");
  });

  it("gets all contacts with returnAll=true", async () => {
    const apiResponse = {
      contacts: [
        { subscriber_hash: "1", email: "alice@example.com", status: "active" },
        { subscriber_hash: "2", email: "bob@example.com", status: "inactive" },
      ],
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "contact",
        operation: "getAll",
        listId: 1,
        returnAll: true,
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
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ email: "alice@example.com" });
    expect(out[0][1].json).toMatchObject({ email: "bob@example.com" });
    const call = lastCall();
    expect(call.method).toBe("GET");
    expect(call.url).toContain("/lists/1/contacts");
  });

  it("updates a contact", async () => {
    const apiResponse = {
      subscriber_hash: "abc123",
      email: "test@example.com",
      status: "inactive",
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "contact",
        operation: "update",
        listId: 1,
        email: "test@example.com",
        updateAction: "append",
        options: { status: "inactive" },
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
    expect(out[0][0].json).toMatchObject({ status: "inactive" });
    const call = lastCall();
    expect(call.method).toBe("PUT");
    expect(call.url).toContain("/lists/1/contacts/test%40example.com");
    const body = jsonBody(call) as Record<string, unknown>;
    expect(body.update_action).toBe("append");
    expect(body.status).toBe("inactive");
  });

  it("throws when credential is missing", async () => {
    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "contact",
        operation: "create",
        listId: 1,
        email: "test@example.com",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    await expect(executor(ctx, node)).rejects.toThrow(/API key credential/);
  });

  it("returns error item on missing email with continueOnFail", async () => {
    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "contact",
        operation: "create",
        listId: 1,
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
    expect(out[0][0].json).toMatchObject({ error: "E-goi: email is required for contact create" });
  });

  it("multi-item pass-through produces one output per input", async () => {
    const apiResponse = { subscriber_hash: "abc", email: "test@example.com", status: "active" };
    responseQueue = [mockResponse(apiResponse), mockResponse(apiResponse)];

    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "contact",
        operation: "get",
        listId: 1,
        email: "test@example.com",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }, { json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.email).toBe("test@example.com");
    expect(out[0][1].json.email).toBe("test@example.com");
    expect(calls.length).toBe(2);
  });
});
