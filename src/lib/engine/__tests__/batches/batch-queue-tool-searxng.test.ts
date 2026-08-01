import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolSearXng";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

function installFetch(response?: Response) {
  calls = [];
  const defaultResponse = {
    status: 200,
    statusText: "OK",
    ok: true,
    headers: new Map(Object.entries({ "content-type": "application/json" })),
    async json() {
      return { results: MOCK_RESULTS };
    },
    async text() {
      return JSON.stringify({ results: MOCK_RESULTS });
    },
  };

  const resp = response ?? defaultResponse;

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
      return resp;
    }),
  );
}

const MOCK_RESULTS = Array.from({ length: 15 }, (_, i) => ({
  title: `Result ${i + 1}`,
  url: `https://example.com/${i + 1}`,
  content: `Snippet for result ${i + 1}.`,
  engine: "google",
  publishedDate: i === 0 ? "2026-07-30T12:00:00Z" : undefined,
}));

const CREDS = {
  searxngApi: { apiUrl: "http://searxng.local:8080" },
};

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
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
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(
      Object.entries(creds).map(([k]) => [k, { name: k }]),
    ),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  const text =
    typeof body === "string" ? body : JSON.stringify(body ?? {});
  const h = new Map(
    Object.entries(headers ?? { "content-type": "application/json" }),
  );
  return {
    status,
    statusText: status === 403 ? "Forbidden" : status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return h.get(name) ?? null;
      },
      forEach(fn: (v: string, k: string) => void) {
        h.forEach((v, k) => fn(v, k));
      },
      entries() {
        return h.entries();
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

describe("batch-queue toolSearXng — @n8n/n8n-nodes-langchain.toolSearXng", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("SearXNG Tool");
  });

  it("default search — documented defaults", async () => {
    installFetch(mockResponse({ results: MOCK_RESULTS }));
    const out = await run({}, [{}]);

    expect(calls).toHaveLength(0);

    const handle = out[0][0].json as Record<string, unknown>;
    expect(handle.type).toBe(TYPE);
    expect(handle.name).toBe("searxng_search");

    const invoke = handle.invoke as (
      args: Record<string, unknown>,
    ) => Promise<{ content: string }>;
    const result = await invoke({ query: "OpenFlow engine" });

    expect(calls).toHaveLength(1);
    const reqUrl = new URL(calls[0].url);
    expect(reqUrl.pathname).toBe("/search");
    expect(reqUrl.searchParams.get("q")).toBe("OpenFlow engine");
    expect(reqUrl.searchParams.get("format")).toBe("json");
    expect(reqUrl.searchParams.get("language")).toBe("en");
    expect(reqUrl.searchParams.get("pageno")).toBe("1");
    expect(reqUrl.searchParams.get("safesearch")).toBe("0");

    expect(result.content).toContain("Result 1");
    expect(result.content).toContain("https://example.com/1");
    expect(result.content).toContain("Snippet for result 1");
    expect(result.content).toContain("Result 10");
    expect(result.content).not.toContain("Result 11");
    expect(result.isError).toBeFalsy();
  });

  it("custom options map onto query params", async () => {
    installFetch(mockResponse({ results: MOCK_RESULTS }));
    const out = await run(
      {
        numResults: 5,
        pageno: 2,
        language: "fr",
        safesearch: "strict",
      },
      [{}],
    );

    const handle = out[0][0].json as Record<string, unknown>;
    const invoke = handle.invoke as (
      args: Record<string, unknown>,
    ) => Promise<{ content: string }>;
    const result = await invoke({ query: "test query" });

    const reqUrl = new URL(calls[0].url);
    expect(reqUrl.searchParams.get("q")).toBe("test query");
    expect(reqUrl.searchParams.get("language")).toBe("fr");
    expect(reqUrl.searchParams.get("pageno")).toBe("2");
    expect(reqUrl.searchParams.get("safesearch")).toBe("2");

    const lines = result.content.split("\n\n");
    expect(lines.length).toBe(5);
  });

  it("JSON format disabled (HTTP 403)", async () => {
    installFetch(mockResponse({ error: "json format not enabled" }, 403));
    const out = await run({}, [{}]);

    const handle = out[0][0].json as Record<string, unknown>;
    const invoke = handle.invoke as (
      args: Record<string, unknown>,
    ) => Promise<{ content: string; isError?: boolean }>;
    const result = await invoke({ query: "test" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("JSON");
    expect(result.content).toContain("search.formats");
  });

  it("no results found", async () => {
    installFetch(mockResponse({ results: [] }));
    const out = await run({}, [{}]);

    const handle = out[0][0].json as Record<string, unknown>;
    const invoke = handle.invoke as (
      args: Record<string, unknown>,
    ) => Promise<{ content: string }>;
    const result = await invoke({ query: "nonexistent" });

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("No search results");
  });

  it("throws when credential is missing", async () => {
    await expect(run({}, [{}], { credentials: {} })).rejects.toThrow(
      /searxngApi.*credential/,
    );
  });

  it("throws when credential has empty apiUrl", async () => {
    await expect(
      run(
        {},
        [{}],
        { credentials: { searxngApi: { apiUrl: "" } } },
      ),
    ).rejects.toThrow(/API URL/);
  });
});
