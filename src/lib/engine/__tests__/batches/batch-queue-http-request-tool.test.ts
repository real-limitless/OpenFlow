import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.httpRequestTool";

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
    statusText: status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  redirect?: string;
}

let fetchCalls: FetchCall[] = [];

beforeEach(() => {
  fetchCalls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (url: string | URL | Request, init?: RequestInit) => {
      let bodyStr: string | undefined;
      if (init?.body && typeof init.body === "string") bodyStr = init.body;

      fetchCalls.push({
        url: typeof url === "string" ? url : url.toString(),
        method: init?.method ?? "GET",
        headers: init?.headers as Record<string, string> | undefined,
        body: bodyStr,
        signal: init?.signal,
        redirect: init?.redirect,
      });
      return mockResponse({
        userId: 1,
        id: 1,
        title: "delectus aut autem",
        completed: false,
      }) as Response;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function runHttpRequestTool(
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown>> = [{}],
) {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`Executor ${TYPE} not registered`);
  const node = makeNode({ name: "N", type: TYPE, parameters });

  const normalized = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );

  const ctx: ExecutionContext = {
    getInputItems: () => normalized,
    getParam: (name: string, defaultVal?: unknown) => node.parameters[name] ?? defaultVal,
    getParams: () => node.parameters,
    getNode: () => node,
    node,
    getWorkflow: () => ({
      id: "wf-test",
      name: "Test Workflow",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    }),
    continueOnFail: () => false,
    getCredential: async () => null,
    evaluate: (_expr: string, _json?: Record<string, unknown>) => _expr,
    setCustomData: async () => {},
    getCustomData: () => undefined,
    getAllCustomData: () => ({}),
  };

  return executor(ctx, node);
}

describe("httpRequestTool", () => {
  it("registers executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("performs basic GET request", async () => {
    const params = {
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/todos/1",
      authentication: "none",
    };

    const [out] = await runHttpRequestTool(params);
    expect(out).toHaveLength(1);
    expect(out[0].json).toMatchObject({
      userId: 1,
      id: 1,
      title: "delectus aut autem",
    });
    expect(fetchCalls[0].method).toBe("GET");
    expect(fetchCalls[0].url).toBe("https://jsonplaceholder.typicode.com/todos/1");
  });

  it("sends POST with JSON body", async () => {
    const params = {
      method: "POST",
      url: "https://jsonplaceholder.typicode.com/posts",
      sendBody: true,
      bodyContentType: "json",
      jsonBody: { title: "foo", body: "bar", userId: 1 },
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Content-Type", value: "application/json" }],
      },
    };

    const [out] = await runHttpRequestTool(params);
    expect(out).toHaveLength(1);
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].body).toBe(JSON.stringify({ title: "foo", body: "bar", userId: 1 }));
    expect(fetchCalls[0].headers?.["Content-Type"]).toBe("application/json");
  });

  it("returns full response with headers and status", async () => {
    const params = {
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/todos/1",
      options: {
        response: {
          includeResponseHeadersAndStatus: true,
        },
      },
    };

    const [out] = await runHttpRequestTool(params);
    expect(out).toHaveLength(1);
    expect(out[0].json).toMatchObject({
      statusCode: 200,
      body: { userId: 1, id: 1, title: "delectus aut autem" },
    });
    expect((out[0].json as Record<string, unknown>).headers).toBeDefined();
  });

  it("sends query parameters", async () => {
    const params = {
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/posts",
      sendQuery: true,
      queryParameters: { parameters: [{ name: "userId", value: "1" }] },
    };

    await runHttpRequestTool(params);
    expect(fetchCalls[0].url).toContain("userId=1");
  });

  it("processes all input items (one output per input)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return mockResponse({ result: "ok" }) as Response;
    });

    const params = {
      method: "GET",
      url: "https://api.example.com/items",
    };

    const [out] = await runHttpRequestTool(params, [{}, {}]);
    // TODO: current impl processes all items but only returns one output per fetch
    // The spec says one output per input item
    expect(out).toHaveLength(2);
  });

  it("tool-mode optimizeResponse with fieldContainingData returns string", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return mockResponse({
        userId: 1,
        id: 1,
        title: "delectus aut autem",
        completed: false,
      }) as Response;
    });

    const params = {
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/todos/1",
      options: {
        response: {
          optimizeResponse: true,
          expectedResponseType: "json",
          fieldContainingData: "title",
        },
      },
    };

    const [out] = await runHttpRequestTool(params);
    expect(out[0].json).toEqual("delectus aut autem");
  });

  it("includes nested options.response.* with flat options.* fallback", async () => {
    const params = {
      method: "GET",
      url: "https://api.example.com/data",
      options: {
        response: {
          includeResponseHeadersAndStatus: true,
        },
      },
    };

    const [out] = await runHttpRequestTool(params);
    expect(out[0].json).toHaveProperty("statusCode");
    expect(out[0].json).toHaveProperty("headers");
    expect(out[0].json).toHaveProperty("body");
  });

  it("follow redirect fallback works", async () => {
    const params = {
      method: "GET",
      url: "https://api.example.com/redirect",
      options: {
        followRedirect: false,
      },
    };

    await runHttpRequestTool(params);
    expect(fetchCalls[0].redirect).toBe("manual");
  });

  it("neverError suppresses non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return mockResponse({ error: "not found" }, { status: 404 }) as Response;
    });

    const params = {
      method: "GET",
      url: "https://api.example.com/missing",
      options: {
        response: {
          neverError: true,
        },
      },
    };

    const [out] = await runHttpRequestTool(params);
    expect(out).toHaveLength(1);
  });

  it("optimizeResponse html strips tags and truncates", async () => {
    const longHtml = "<html><body><h1>Title</h1><p>" + "A".repeat(600) + "</p></body></html>";

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return mockResponse(longHtml, { contentType: "text/html" }) as Response;
    });

    const params = {
      method: "GET",
      url: "https://example.com",
      options: {
        response: {
          optimizeResponse: true,
          expectedResponseType: "html",
          returnOnlyContent: true,
          truncateResponse: true,
          maxResponseCharacters: 500,
        },
      },
    };

    const [out] = await runHttpRequestTool(params);
    const text = out[0].json as string;
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).not.toContain("<html>");
    expect(text).not.toContain("<h1>");
  });

  it("emits an http_request handle when there are no main items", async () => {
    const [out] = await runHttpRequestTool({ method: "GET" }, []);
    const handle = out[0].json as {
      name: string;
      invoke: (args: Record<string, unknown>) => Promise<string>;
    };
    expect(handle.name).toBe("http_request");
    const body = await handle.invoke({ url: "https://example.com/ping" });
    expect(fetchCalls[0].url).toBe("https://example.com/ping");
    expect(body).toContain("delectus");
  });
});
