import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.graphqlTool";

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
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(
  response: ReturnType<typeof mockResponse> = mockResponse({ data: { hello: "world" } }),
) {
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
      });
      return nextResponse;
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
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
    getNodeInputItems: () => items,
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
  const ctx = makeCtx(toItems(inputItems), node, credentials?.data);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue graphqlTool — n8n-nodes-base.graphqlTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("GraphQL (AI Tool)");
  });

  it("POSTs a JSON request body with query and parses JSON response", async () => {
    const out = await run({
      authentication: "none",
      requestMethod: "POST",
      endpoint: "https://example.com/graphql",
      requestFormat: "json",
      query: "{ hello }",
      variables: "",
      operationName: "",
      responseFormat: "json",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].body!)).toEqual({ query: "{ hello }" });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ data: { hello: "world" } });
  });

  it("posts raw GraphQL body with application/graphql content type", async () => {
    await run({
      authentication: "none",
      requestMethod: "POST",
      endpoint: "https://example.com/graphql",
      requestFormat: "graphql",
      query: "query { hello }",
      responseFormat: "json",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toBe("query { hello }");
    expect(calls[0].headers["Content-Type"]).toBe("application/graphql");
  });

  it("sends custom headers from headerParametersUi", async () => {
    await run({
      requestMethod: "POST",
      endpoint: "https://example.com/graphql",
      requestFormat: "json",
      query: "{ hello }",
      responseFormat: "json",
      headerParametersUi: {
        parameter: [{ name: "X-Custom", value: "val" }],
      },
    });

    expect(calls[0].headers["X-Custom"]).toBe("val");
  });

  it("writes raw response to dataPropertyName when responseFormat is string", async () => {
    installFetch(mockResponse('{"data":{"hello":"world"}}'));
    const out = await run({
      requestMethod: "POST",
      endpoint: "https://example.com/graphql",
      requestFormat: "json",
      query: "{ hello }",
      responseFormat: "string",
      dataPropertyName: "myData",
    });

    expect(out[0][0].json.myData).toBe('{"data":{"hello":"world"}}');
  });

  it("throws when endpoint is missing", async () => {
    await expect(
      run({
        requestMethod: "POST",
        requestFormat: "json",
        query: "{ hello }",
        responseFormat: "json",
      }),
    ).rejects.toThrow(/endpoint is required/);
  });

  it("throws when query is missing", async () => {
    await expect(
      run({
        requestMethod: "POST",
        endpoint: "https://example.com/graphql",
        requestFormat: "json",
        responseFormat: "json",
      }),
    ).rejects.toThrow(/query is required/);
  });

  it("applies basic auth credential as Authorization header", async () => {
    await run(
      {
        authentication: "basicAuth",
        requestMethod: "POST",
        endpoint: "https://example.com/graphql",
        requestFormat: "json",
        query: "{ hello }",
        responseFormat: "json",
      },
      [{}],
      {
        refs: { httpBasicAuth: { name: "cred" } },
        data: { httpBasicAuth: { user: "al", password: "secret" } },
      },
    );

    const expected = `Basic ${Buffer.from("al:secret").toString("base64")}`;
    expect(calls[0].headers["Authorization"]).toBe(expected);
  });

  it("making one request per input item", async () => {
    await run(
      {
        requestMethod: "POST",
        endpoint: "https://example.com/graphql",
        requestFormat: "json",
        query: "query($id: ID!) { user(id: $id) { name } }",
        variables: '={{ ({ "id": $json.id }) }}',
        operationName: "",
        responseFormat: "json",
      },
      [{ id: 1 }, { id: 2 }],
    );

    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0].body!).variables.id).toBe(1);
    expect(JSON.parse(calls[1].body!).variables.id).toBe(2);
  });
});
