import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.mailcheckTool";

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

describe("batch-queue mailcheckTool — n8n-nodes-base.mailcheckTool", () => {
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

  it("validates email via expression and returns emailCheck result", async () => {
    const apiResponse = {
      email: "user@example.com",
      result: "deliverable",
      score: 0.99,
      syntax_valid: true,
      domain: "example.com",
      did_you_mean: null,
      disposable: false,
      role_account: false,
      reason: [],
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        resource: "email",
        operation: "check",
        email: "={{ $json.email }}",
      },
    });
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "test", name: "test", active: false,
        nodes: [node], connections: {}, settings: {},
      },
      getNodeInputItems: () => [{ json: { email: "user@example.com" } }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.emailCheck).toBeDefined();
    const result = json.emailCheck as Record<string, unknown>;
    expect(result.result).toBe("deliverable");
    expect(result.score).toBe(0.99);
    expect(result.syntax_valid).toBe(true);
    expect(result.email).toBe("user@example.com");
  });

  it("detects disposable email", async () => {
    const apiResponse = {
      email: "test@mailinator.com",
      result: "risky",
      score: 0.3,
      syntax_valid: true,
      domain: "mailinator.com",
      disposable: true,
      role_account: false,
      reason: ["disposable"],
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "email",
        operation: "check",
        email: "test@mailinator.com",
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
      getCredential: async () => ({ apiKey: "key" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0][0].json).toBeDefined();
    const result = (out[0][0].json as Record<string, unknown>).emailCheck as Record<string, unknown>;
    expect(result.disposable).toBe(true);
    expect(result.email).toBe("test@mailinator.com");
  });

  it("marks syntax-invalid email", async () => {
    const apiResponse = {
      email: "not-an-email",
      result: "undeliverable",
      score: 0.0,
      syntax_valid: false,
      domain: "",
      disposable: false,
      role_account: false,
      reason: ["invalid_syntax"],
    };
    responseQueue = [mockResponse(apiResponse)];

    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "email",
        operation: "check",
        email: "not-an-email",
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
      getCredential: async () => ({ apiKey: "key" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    const result = (out[0][0].json as Record<string, unknown>).emailCheck as Record<string, unknown>;
    expect(result.syntax_valid).toBe(false);
    expect(result.result).not.toBe("deliverable");
  });

  it("throws error when email is empty", async () => {
    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "email",
        operation: "check",
        email: "",
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
      getCredential: async () => ({ apiKey: "key" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    await expect(executor(ctx, node)).rejects.toThrow("email parameter is required");
  });

  it("throws when credential is missing", async () => {
    const node = makeNode({
      name: "N", type: TYPE,
      parameters: {
        resource: "email",
        operation: "check",
        email: "test@example.com",
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
});
