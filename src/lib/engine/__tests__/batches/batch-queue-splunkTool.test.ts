import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.splunkTool";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
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
const CREDS = { splunkApi: { baseUrl: "https://splunk.example.com:8089", authToken: "splunk_test_token" } };

function installFetch(response: ReturnType<typeof mockResponse>) {
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
    return response;
  }));
}

function uninstallFetch() {
  vi.unstubAllGlobals();
}

const SEARCH_JOB_RESPONSE = {
  entry: [{
    name: "1718944376.178",
    content: { dispatchState: "DONE", eventCount: 42, resultCount: 10 },
  }],
};

const SEARCH_RESULTS_RESPONSE = {
  results: [
    { source: { value: "/var/log/syslog" }, count: { value: 100 } },
    { source: { value: "/var/log/auth.log" }, count: { value: 50 } },
  ],
};

const USER_CREATE_RESPONSE = { entry: [{ name: "testuser", content: { roles: ["user"] } }] };
const USER_GET_RESPONSE = { entry: [{ name: "testuser", content: { roles: ["user"], email: "test@example.com" } }] };

const FIRED_ALERTS_RESPONSE = {
  entry: [
    { name: "alert1", content: { severity: "high", status: "fired" } },
  ],
};

const REPORT_LIST_RESPONSE = {
  entry: [
    { name: "My Report", content: { id: "saved_search_1" } },
  ],
};

const EMPTY_RESPONSE = { entry: [] };

describe(`batch-queue: ${TYPE}`, () => {
  beforeEach(() => {
    installFetch(mockResponse(SEARCH_JOB_RESPONSE));
  });
  afterEach(() => {
    uninstallFetch();
  });

  it("is registered as a builtin executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has a node description registered", () => {
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("Splunk (AI Tool)");
    expect(desc.category).toBe("AI Tool");
    expect(desc.credentials).toBeDefined();
    expect(desc.credentials!.some((c: { name: string }) => c.name === "splunkApi")).toBe(true);
  });

  it("creates a search job and returns sid/dispatchState", async () => {
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "search",
        operation: "create",
        search: "search index=_internal | stats count by source",
        additionalFields: { exec_mode: "blocking", max_time: 60 },
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => (node.parameters as Record<string, unknown>)[name] ?? def,
      continueOnFail: () => false,
      getCredential: async () => CREDS.splunkApi,
    };
    const result = await executor(ctx as any, node);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.sid).toBe("1718944376.178");
    expect(result[0][0].json.dispatchState).toBe("DONE");
    expect(result[0][0].json.eventCount).toBe(42);
    expect(calls.some((c) => c.url.includes("/services/search/jobs"))).toBe(true);
  });

  it("gets search results", async () => {
    installFetch(mockResponse(SEARCH_RESULTS_RESPONSE));
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "search",
        operation: "getResult",
        searchJobId: { mode: "id", value: "1718944376.178" },
        returnAll: false,
        limit: 10,
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => (node.parameters as Record<string, unknown>)[name] ?? def,
      continueOnFail: () => false,
      getCredential: async () => CREDS.splunkApi,
    };
    const result = await executor(ctx as any, node);
    expect(result).toHaveLength(1);
    expect(Array.isArray(result[0])).toBe(true);
    expect(result[0].length).toBeGreaterThan(0);
    expect(result[0][0].json.source).toBe("/var/log/syslog");
    expect(result[0][0].json.count).toBe(100);
  });

  it("creates a user and returns name/roles", async () => {
    installFetch(mockResponse(USER_CREATE_RESPONSE));
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "user",
        operation: "create",
        name: "testuser",
        password: "changeme123",
        roles: ["user"],
        additionalFields: { email: "test@example.com" },
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => (node.parameters as Record<string, unknown>)[name] ?? def,
      continueOnFail: () => false,
      getCredential: async () => CREDS.splunkApi,
    };
    const result = await executor(ctx as any, node);
    expect(result[0][0].json.name).toBe("testuser");
    expect(result[0][0].json.roles).toContain("user");
  });

  it("gets a user", async () => {
    installFetch(mockResponse(USER_GET_RESPONSE));
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "user",
        operation: "get",
        userId: { mode: "id", value: "testuser" },
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => (node.parameters as Record<string, unknown>)[name] ?? def,
      continueOnFail: () => false,
      getCredential: async () => CREDS.splunkApi,
    };
    const result = await executor(ctx as any, node);
    expect(result[0][0].json.name).toBe("testuser");
    expect(result[0][0].json.email).toBe("test@example.com");
  });

  it("gets fired alerts", async () => {
    installFetch(mockResponse(FIRED_ALERTS_RESPONSE));
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "alert",
        operation: "getReport",
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => (node.parameters as Record<string, unknown>)[name] ?? def,
      continueOnFail: () => false,
      getCredential: async () => CREDS.splunkApi,
    };
    const result = await executor(ctx as any, node);
    expect(Array.isArray(result[0])).toBe(true);
    expect(result[0].length).toBeGreaterThan(0);
  });

  it("creates a report from search job", async () => {
    installFetch(mockResponse(REPORT_LIST_RESPONSE));
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "report",
        operation: "create",
        searchJobId: { mode: "id", value: "1718944376.178" },
        name: "Test Report",
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => (node.parameters as Record<string, unknown>)[name] ?? def,
      continueOnFail: () => false,
      getCredential: async () => CREDS.splunkApi,
    };
    const result = await executor(ctx as any, node);
    expect(result[0][0].json.name).toBe("Test Report");
  });

  it("handles continueOnFail on error", async () => {
    installFetch(mockResponse({ messages: [{ text: "Not Found" }] }, { status: 404 }));
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "search",
        operation: "get",
        searchJobId: { mode: "id", value: "does_not_exist" },
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => (node.parameters as Record<string, unknown>)[name] ?? def,
      continueOnFail: () => true,
      getCredential: async () => CREDS.splunkApi,
    };
    const result = await executor(ctx as any, node);
    expect(result[0].length).toBe(1);
    expect(result[0][0].json.error).toContain("Splunk Tool:");
  });

  it("throws when credential is missing", async () => {
    const executor = getExecutor(TYPE)!;
    const node = makeNode({
      type: TYPE,
      parameters: {
        resource: "search",
        operation: "create",
        search: "index=_internal",
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => (node.parameters as Record<string, unknown>)[name] ?? def,
      continueOnFail: () => false,
      getCredential: async () => null,
    };
    await expect(executor(ctx as any, node)).rejects.toThrow("credential");
  });
});