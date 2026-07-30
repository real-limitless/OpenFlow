import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../executors";
import { getExecutor, hasExecutor } from "../node-runtime";
import { makeNode } from "./helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.httpRequest";

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
  headers: Record<string, string>;
  body: string | undefined;
  redirect: string;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ ok: true })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
        redirect: (init?.redirect as string) ?? "follow",
      });
      return nextResponse;
    }),
  );
}

function makeCtx(
  items: Array<Record<string, unknown> | INodeExecutionData>,
  node: INode,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  const normalized: INodeExecutionData[] = items.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => normalized,
    continueOnFail: false,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials?: {
    refs: Record<string, { name: string }>;
    data: Record<string, Record<string, unknown>>;
  },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: credentials?.refs,
  });
  const ctx = makeCtx(inputItems, node, credentials?.data);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("http-request executor — n8n-nodes-base.httpRequest", () => {
  it("is registered as executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("GET parses JSON body into item json", async () => {
    installFetch(mockResponse({ hello: "world" }));
    const out = await run({ method: "GET", url: "https://example.com/get" });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://example.com/get");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ hello: "world" });
  });

  it("sends query parameters when sendQuery is true", async () => {
    await run({
      method: "GET",
      url: "https://example.com/get",
      sendQuery: true,
      queryParameters: { parameters: [{ name: "foo", value: "bar" }] },
    });

    expect(calls[0].url).toContain("foo=bar");
  });

  it("sends headers when sendHeaders is true", async () => {
    await run({
      method: "GET",
      url: "https://example.com/get",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Test", value: "yes" }] },
    });

    expect(calls[0].headers["X-Test"]).toBe("yes");
  });

  it("POSTs a JSON body and sets Content-Type", async () => {
    await run({
      method: "POST",
      url: "https://example.com/post",
      sendBody: true,
      contentType: "json",
      jsonBody: { a: 1 },
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toBe(JSON.stringify({ a: 1 }));
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
  });

  it("POSTs form-urlencoded body from bodyParameters", async () => {
    await run({
      method: "POST",
      url: "https://example.com/post",
      sendBody: true,
      contentType: "form-urlencoded",
      bodyParameters: {
        parameters: [
          { name: "a", value: "1" },
          { name: "b", value: "2" },
        ],
      },
    });

    expect(calls[0].body).toBe("a=1&b=2");
    expect(calls[0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("does not send a body for GET even when sendBody is true", async () => {
    await run({
      method: "GET",
      url: "https://example.com/get",
      sendBody: true,
      contentType: "json",
      jsonBody: { a: 1 },
    });

    expect(calls[0].body).toBeUndefined();
  });

  it("applies basic auth credential as Authorization header", async () => {
    await run({ method: "GET", url: "https://example.com/get" }, [{}], {
      refs: { httpBasicAuth: { name: "cred" } },
      data: { httpBasicAuth: { user: "al", password: "secret" } },
    });

    const expected = `Basic ${Buffer.from("al:secret").toString("base64")}`;
    expect(calls[0].headers["Authorization"]).toBe(expected);
  });

  it("applies header auth credential as a custom header", async () => {
    await run({ method: "GET", url: "https://example.com/get" }, [{}], {
      refs: { httpHeaderAuth: { name: "cred" } },
      data: { httpHeaderAuth: { name: "X-API-Key", value: "token123" } },
    });

    expect(calls[0].headers["X-API-Key"]).toBe("token123");
  });

  it("applies query auth credential onto the URL", async () => {
    await run({ method: "GET", url: "https://example.com/get" }, [{}], {
      refs: { httpQueryAuth: { name: "cred" } },
      data: { httpQueryAuth: { name: "api_key", value: "q1" } },
    });

    expect(calls[0].url).toContain("api_key=q1");
  });

  it("returns full response (status/headers/body) when options.fullResponse is true", async () => {
    installFetch(mockResponse({ ok: true }, { status: 200, headers: { "x-trace": "abc" } }));
    const out = await run({
      method: "GET",
      url: "https://example.com/get",
      options: { fullResponse: true },
    });

    expect(out[0][0].json.statusCode).toBe(200);
    expect(out[0][0].json.headers["x-trace"]).toBe("abc");
    expect(out[0][0].json.body).toMatchObject({ ok: true });
  });

  it("rejects on 404 when neverError is not set", async () => {
    installFetch(mockResponse({ error: "nope" }, { status: 404 }));
    await expect(run({ method: "GET", url: "https://example.com/missing" })).rejects.toThrow(
      /HTTP Request failed/,
    );
  });

  it("succeeds on 404 when options.response.neverError is true", async () => {
    installFetch(mockResponse({ error: "nope" }, { status: 404 }));
    const out = await run({
      method: "GET",
      url: "https://example.com/missing",
      options: { response: { neverError: true } },
    });

    expect(out[0][0].json).toMatchObject({ error: "nope" });
  });

  it("exposes status when fullResponse + neverError on 404", async () => {
    installFetch(mockResponse({ error: "nope" }, { status: 404 }));
    const out = await run({
      method: "GET",
      url: "https://example.com/missing",
      options: { response: { neverError: true, fullResponse: true } },
    });

    expect(out[0][0].json.statusCode).toBe(404);
    expect(out[0][0].json.body).toMatchObject({ error: "nope" });
  });

  it("wraps text (non-JSON) response body under data", async () => {
    installFetch(mockResponse("plain text", { contentType: "text/plain" }));
    const out = await run({ method: "GET", url: "https://example.com/get" });

    expect(out[0][0].json).toMatchObject({ data: "plain text" });
  });

  it("throws a wrapped error when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(run({ method: "GET", url: "https://example.com/get" })).rejects.toThrow(
      /HTTP Request failed: network down/,
    );
  });
});
