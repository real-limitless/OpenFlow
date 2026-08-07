import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.helpScout";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

let calls: FetchCall[];
let responseQueue: Response[];

function mockResponse(body: unknown, status = 200, headersInit?: Record<string, string>) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(headersInit ?? {})) map.set(k.toLowerCase(), v);
  map.set("content-type", "application/json");
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  } as Response;
}

function installFetch(...responses: Response[]) {
  responseQueue = responses.length > 0 ? responses : [mockResponse({ ok: true })];
  calls = [];
  let idx = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
    });
    const resp = responseQueue[Math.min(idx++, responseQueue.length - 1)];
    return resp;
  }));
}

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

function makeCtx(items: INodeExecutionData[], node: INode, continueOnFail = false): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async () => ({ accessToken: "hs-token-123" }),
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { helpScoutOAuth2Api: { name: "helpScoutOAuth2Api" } },
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(mockResponse({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue helpScout — n8n-nodes-base.helpScout", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Help Scout");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.helpScout")).toBe(canonical);
  });

  // --- Conversation: Create (acceptance) ---

  it("creates a conversation with minimum fields", async () => {
    const createdId = 999;
    const conversationObj = { id: createdId, subject: "Test conversation", status: "active" };
    installFetch(
      mockResponse(conversationObj, 201, { "Resource-ID": String(createdId) }),
      mockResponse(conversationObj),
    );

    const out = await run({
      resource: "conversation",
      operation: "create",
      mailboxId: 85,
      status: "active",
      type: "email",
      subject: "Test conversation",
      customer: JSON.stringify({ email: "test@example.com", firstName: "Test", lastName: "User" }),
      threads: JSON.stringify([{ type: "customer", text: "Hello" }]),
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.helpscout.net/v2/conversations");
    expect(out[0][0].json).toMatchObject({
      id: createdId,
      subject: "Test conversation",
      status: "active",
    });
  });

  // --- Conversation: Delete (acceptance) ---

  it("deletes a conversation", async () => {
    installFetch(mockResponse({}, 204));
    const out = await run({
      resource: "conversation",
      operation: "delete",
      conversationId: 123,
    }, [{ json: { conversationId: 123 } }]);

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.helpscout.net/v2/conversations/123");
    expect(out[0][0].json).toEqual({});
  });

  // --- Customer: Get All (acceptance) ---

  it("gets all customers with query filter", async () => {
    installFetch(mockResponse({
      _embedded: {
        customers: [
          { id: 1, firstName: "John", lastName: "Doe", email: "john@example.com" },
          { id: 2, firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
        ],
      },
    }));

    const out = await run({
      resource: "customer",
      operation: "getAll",
      query: "example.com",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/customers");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: 1, firstName: "John" });
    expect(out[0][1].json).toMatchObject({ id: 2, firstName: "Jane" });
  });

  // --- Customer: Update (acceptance) ---

  it("updates a customer", async () => {
    installFetch(
      mockResponse({}, 204),
      mockResponse({ id: 456, firstName: "Updated", lastName: "User", email: "test@example.com" }),
    );

    const out = await run({
      resource: "customer",
      operation: "update",
      customerId: 456,
      updateFields: JSON.stringify({ firstName: "Updated" }),
    }, [{ json: { customerId: 456, firstName: "Updated" } }]);

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.helpscout.net/v2/customers/456");
    expect(out[0][0].json).toMatchObject({ firstName: "Updated" });
  });

  // --- Mailbox: Get All (acceptance) ---

  it("gets all mailboxes", async () => {
    installFetch(mockResponse({
      _embedded: {
        mailboxes: [
          { id: 1, name: "Support" },
          { id: 2, name: "Sales" },
        ],
      },
    }));

    const out = await run({
      resource: "mailbox",
      operation: "getAll",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.helpscout.net/v2/mailboxes");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: 1, name: "Support" });
  });

  // --- Conversation: Get ---

  it("gets a single conversation", async () => {
    installFetch(mockResponse({ id: 42, subject: "Help request", status: "active" }));
    const out = await run({
      resource: "conversation",
      operation: "get",
      conversationId: 42,
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.helpscout.net/v2/conversations/42");
    expect(out[0][0].json).toMatchObject({ id: 42, subject: "Help request" });
  });

  // --- Thread: Create (chat thread) ---

  it("creates a chat thread", async () => {
    installFetch(mockResponse({}, 201));

    const out = await run({
      resource: "thread",
      operation: "create",
      conversationId: 100,
      customer: JSON.stringify({ email: "test@example.com" }),
      text: "Hello support!",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.helpscout.net/v2/conversations/100/chat");
    expect(out[0][0].json).toEqual({});
  });

  // --- Error handling ---

  it("throws on 401 unauthorized", async () => {
    installFetch(mockResponse({ error: "Unauthorized" }, 401));
    await expect(run({
      resource: "conversation",
      operation: "get",
      conversationId: 1,
    })).rejects.toThrow(/Help Scout/);
  });

  it("returns error item when continueOnFail is true", async () => {
    installFetch(mockResponse({ error: "Not Found" }, 404));
    const out = await run({
      resource: "conversation",
      operation: "get",
      conversationId: 9999,
    }, [{}], { continueOnFail: true });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
