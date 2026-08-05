import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.airtopTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; }, entries() { return new Map().entries(); } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

let calls: Array<{ url: string; method: string; body?: string }>;
let responseQueue: ReturnType<typeof mockResponse>[];

function makeCtx(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    resource: "extraction",
    operation: "query",
    sessionId: "sess_123",
    windowId: "win_456",
    sessionMode: "existing",
    prompt: "What is the page title?",
  };
  const params = { ...defaults, ...overrides };
  return {
    getInputItems: () => [{ json: params }],
    getParam: (name: string) => params[name],
    getCredential: async () => ({ apiKey: "test-key" }),
    continueOnFail: () => false,
  } as any;
}

function installFetch(responses?: ReturnType<typeof mockResponse> | ReturnType<typeof mockResponse>[]) {
  responseQueue = Array.isArray(responses) ? [...responses] : responses ? [responses] : [];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
    return responseQueue.shift() ?? mockResponse({});
  }));
}

function uninstallFetch() {
  vi.unstubAllGlobals();
}

describe("airtopTool node", () => {
  beforeEach(() => {
    installFetch();
  });
  afterEach(() => {
    uninstallFetch();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has description registered", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
    expect(desc?.displayName).toBe("Airtop Tool");
  });

  it("accepts ai_tool input and runs extraction query", async () => {
    responseQueue = [mockResponse({ modelResponse: "Example Page Title", sessionId: "sess_123", windowId: "win_456" })];
    const exec = getExecutor(TYPE);
    const result = await exec!(makeCtx(), { name: "AirtopTool1", type: TYPE, typeVersion: 1, id: "n1", parameters: {} } as any);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/extraction/query");
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.prompt).toBe("What is the page title?");
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("handles session create operation from agent tool call", async () => {
    responseQueue = [mockResponse({ data: { id: "sess_new_001", status: "active", configuration: { timeoutMinutes: 5 } } })];
    const exec = getExecutor(TYPE);
    const ctx = makeCtx({ resource: "session", operation: "create", sessionId: undefined, windowId: undefined, profileName: "agent-scrape", proxy: "none", timeoutMinutes: 5 });
    const result = await exec!(ctx, { name: "AirtopTool2", type: TYPE, typeVersion: 1, id: "n2", parameters: {} } as any);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/sessions");
    expect(calls[0].method).toBe("POST");
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.timeoutMinutes).toBe(5);
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("handles interaction type operation from agent tool call", async () => {
    responseQueue = [mockResponse({ modelResponse: "Typed successfully", sessionId: "sess_123", windowId: "win_456" })];
    const exec = getExecutor(TYPE);
    const ctx = makeCtx({ resource: "interaction", operation: "type", elementDescription: "the search box", text: "hello world", pressEnterKey: true });
    const result = await exec!(ctx, { name: "AirtopTool3", type: TYPE, typeVersion: 1, id: "n3", parameters: {} } as any);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/interaction/type");
    const reqBody = JSON.parse(calls[0].body ?? "{}");
    expect(reqBody.elementDescription).toBe("the search box");
    expect(reqBody.text).toBe("hello world");
    expect(reqBody.pressEnterKey).toBe(true);
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("continues on fail when continueOnFail is true", async () => {
    responseQueue = [mockResponse({ message: "Not found" }, 404)];
    const exec = getExecutor(TYPE);
    const ctx = makeCtx();
    ctx.continueOnFail = () => true;
    const result = await exec!(ctx, { name: "AirtopTool4", type: TYPE, typeVersion: 1, id: "n4", parameters: {} } as any);
    expect(result[0]?.[0]?.json?.error).toBeTruthy();
  });

  it("handles extraction with new session mode", async () => {
    responseQueue = [
      mockResponse({ data: { sessionId: "sess_auto_001" } }),
      mockResponse({ data: { windowId: "win_auto_001" } }),
      mockResponse({ modelResponse: "Scraped content", sessionId: "sess_auto_001", windowId: "win_auto_001" }),
    ];
    const exec = getExecutor(TYPE);
    const ctx = makeCtx({ sessionMode: "new", sessionId: undefined, windowId: undefined });
    const result = await exec!(ctx, { name: "AirtopTool5", type: TYPE, typeVersion: 1, id: "n5", parameters: {} } as any);
    expect(calls.length).toBe(3);
    expect(result[0]?.[0]?.json).toBeTruthy();
  });

  it("has credentials defined", () => {
    const desc = getNodeType(TYPE);
    expect(desc?.credentials?.length).toBeGreaterThanOrEqual(1);
    expect(desc?.credentials?.[0]?.name).toBe("airtopApi");
  });

  it("has ai_tool input defined", () => {
    const desc = getNodeType(TYPE);
    expect(desc?.inputs).toContain("ai_tool");
  });
});
