import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.egoi";

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

describe("batch-queue egoi — n8n-nodes-base.egoi", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("creates a contact and returns the API response", async () => {
    const apiResponse = {
      subscriber_hash: "abc123def456",
      email: "test@example.com",
      first_name: "Test",
      last_name: "User",
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
        email: "test@example.com",
        options: { status: "active", firstName: "Test", lastName: "User" },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { email: "test@example.com" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      subscriber_hash: "abc123def456",
      email: "test@example.com",
      status: "active",
    });
    const call = lastCall();
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/lists/1/contacts");
    expect(call.headers["Api-Key"]).toBe("test-api-key");
    const body = jsonBody(call) as Record<string, unknown>;
    expect(body.email).toBe("test@example.com");
    expect(body.first_name).toBe("Test");
    expect(body.last_name).toBe("User");
    expect(body.status).toBe("active");
  });

  it("gets a contact by email", async () => {
    const apiResponse = {
      subscriber_hash: "abc123",
      email: "test@example.com",
      status: "active",
    };
    responseQueue = [mockResponse(apiResponse)];

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
      email: "test@example.com",
      status: "active",
    });
    const call = lastCall();
    expect(call.method).toBe("GET");
    expect(call.url).toContain("/lists/1/contacts/test%40example.com");
  });

  it("updates a contact", async () => {
    const apiResponse = {
      subscriber_hash: "abc123",
      email: "updated@example.com",
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
        updateAction: "replace",
        options: { status: "inactive" },
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: { newEmail: "updated@example.com" } }],
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
    expect(body.update_action).toBe("replace");
    expect(body.status).toBe("inactive");
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

  it("gets all contacts with pagination (returnAll=false)", async () => {
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
        returnAll: false,
        limit: 50,
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

  it("gets all contacts with returnAll=true paginating across pages", async () => {
    const page1 = {
      contacts: Array.from({ length: 100 }, (_, i) => ({
        subscriber_hash: String(i + 1),
        email: `user${i + 1}@example.com`,
        status: "active",
      })),
    };
    const page2 = {
      contacts: [
        { subscriber_hash: "101", email: "extra@example.com", status: "active" },
      ],
    };

    responseQueue = [mockResponse(page1), mockResponse(page2)];

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
    expect(out[0]).toHaveLength(101);
    expect(out[0][0].json).toMatchObject({ email: "user1@example.com" });
    expect(out[0][100].json).toMatchObject({ email: "extra@example.com" });
    expect(calls.length).toBe(2);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("offset=0");
    expect(calls[0].url).toContain("limit=100");
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toContain("offset=100");
    expect(calls[1].url).toContain("limit=100");
  });

  it("stops pagination when page returns fewer items than pageSize", async () => {
    const fullPage = {
      contacts: Array.from({ length: 100 }, (_, i) => ({
        subscriber_hash: String(i + 1),
        email: `user${i + 1}@example.com`,
        status: "active",
      })),
    };
    const shortPage = {
      contacts: [
        { subscriber_hash: "101", email: "late@example.com", status: "active" },
      ],
    };

    responseQueue = [mockResponse(fullPage), mockResponse(shortPage)];

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
    expect(out[0]).toHaveLength(101);
    expect(calls.length).toBe(2);
  });
});
