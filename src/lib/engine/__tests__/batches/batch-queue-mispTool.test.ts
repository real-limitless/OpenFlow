import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.mispTool";

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

describe("batch-queue mispTool — n8n-nodes-base.mispTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
  });

  it("creates a MISP event", async () => {
    const apiResponse = {
      Event: {
        id: "42",
        info: "Test event created by n8n",
        date: "2026-01-15",
        analysis: "2",
        threat_level_id: "1",
        distribution: "0",
      },
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "event",
        operation: "create",
        info: "Test event created by n8n",
        date: "2026-01-15",
        analysis: "2",
        threatLevelId: "1",
        distribution: "0",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key", baseUrl: "https://misp.example.com" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.event).toBeDefined();
    const event = json.event as Record<string, unknown>;
    expect(event.id).toBe("42");
    expect(event.info).toBe("Test event created by n8n");
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toBe("https://misp.example.com/events");
    const body = jsonBody(lastCall()) as Record<string, unknown>;
    expect(body.Event).toBeDefined();
    expect((body.Event as Record<string, unknown>).info).toBe("Test event created by n8n");
  });

  it("creates an attribute on an event", async () => {
    const apiResponse = {
      Attribute: {
        id: "99",
        event_id: "42",
        type: "ip-dst",
        value: "8.8.8.8",
        category: "Network activity",
      },
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "attribute",
        operation: "create",
        eventId: "42",
        type: "ip-dst",
        value: "8.8.8.8",
        category: "Network activity",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "key", baseUrl: "https://misp.example.com" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.attribute).toBeDefined();
    const attr = json.attribute as Record<string, unknown>;
    expect(attr.type).toBe("ip-dst");
    expect(attr.value).toBe("8.8.8.8");
    expect(attr.event_id).toBe("42");
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toBe("https://misp.example.com/attributes");
    const body = jsonBody(lastCall()) as Record<string, unknown>;
    expect(body.Attribute).toBeDefined();
    expect((body.Attribute as Record<string, unknown>).type).toBe("ip-dst");
    expect((body.Attribute as Record<string, unknown>).value).toBe("8.8.8.8");
  });

  it("adds a tag to an event", async () => {
    const apiResponse = {
      Event: { id: "42" },
      Tag: { id: "tlp:amber" },
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "eventTag",
        operation: "add",
        eventId: "42",
        tagId: "tlp:amber",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "key", baseUrl: "https://misp.example.com" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.eventtag).toBeDefined();
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toBe("https://misp.example.com/events/addTag/42/tlp%3Aamber");
    const body = jsonBody(lastCall());
    expect(body).toBeDefined();
  });

  it("searches events by tag", async () => {
    const apiResponse = {
      response: {
        Event: [
          { id: "1", info: "Event with tlp:green", date: "2026-01-10" },
        ],
      },
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "event",
        operation: "search",
        tags: "tlp:green",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "key", baseUrl: "https://misp.example.com" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.event).toBeDefined();
    expect(Array.isArray(json.event)).toBe(true);
    expect((json.event as Array<unknown>)[0]).toMatchObject({ id: "1", info: "Event with tlp:green" });
    expect(lastCall().method).toBe("POST");
    expect(lastCall().url).toBe("https://misp.example.com/events/restSearch");
    const body = jsonBody(lastCall()) as Record<string, unknown>;
    expect(body.tags).toBeDefined();
    expect(Array.isArray(body.tags)).toBe(true);
    expect(body.tags).toContain("tlp:green");
  });

  it("gets all organisations", async () => {
    const apiResponse = {
      Organisation: [
        { id: "1", name: "Org One" },
        { id: "2", name: "Org Two" },
      ],
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "organisation",
        operation: "getAll",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "key", baseUrl: "https://misp.example.com" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0][0].json).toBeDefined();
    const orgs = (out[0][0].json as Record<string, unknown>).organisation as Array<Record<string, unknown>>;
    expect(orgs).toHaveLength(2);
    expect(orgs[0].name).toBe("Org One");
    expect(lastCall().method).toBe("GET");
    expect(lastCall().url).toBe("https://misp.example.com/organisations");
  });

  it("throws when credential is missing", async () => {
    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "event",
        operation: "getAll",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    await expect(executor(ctx, node)).rejects.toThrow("credential is not configured");
  });

  it("returns error item on continueOnFail", async () => {
    responseQueue = [mockResponse({}, { status: 500 })];

    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "event",
        operation: "getAll",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => ({ apiKey: "key", baseUrl: "https://misp.example.com" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.error).toBeDefined();
    expect(String(json.error)).toContain("MISP");
  });
});
