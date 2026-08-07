import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.quickbaseTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get() { return "application/json"; },
      entries() { return new Map([["content-type", "application/json"]]).entries(); },
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
      return responseQueue.shift() ?? mockResponse({});
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
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { quickbaseApi: { hostname: "myrealm", userToken: "abc123token" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("quickbaseTool", () => {
  it("is registered as an executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has a description", () => {
    const desc = getNodeType(TYPE);
    expect(desc.name).toBe(TYPE);
    expect(desc.displayName).toBe("Quick Base (AI Tool)");
  });

  it("throws when credentials are missing", async () => {
    await expect(run({ resource: "record", operation: "create", tableId: "abc" }, [{}], { credentials: {} }))
      .rejects.toThrow("Quick Base API credentials are required");
  });

  it("create a record via AI tool (acceptance test)", async () => {
    const mockData = { data: [{ "3": { value: 1 }, "6": { value: "New Customer" }, "7": { value: "contact@example.com" } }] };
    installFetch(mockResponse(mockData));

    const [output] = await run(
      { resource: "record", operation: "create", tableId: "abcdefg", fields: { "6": "New Customer", "7": "contact@example.com" } },
      [{}],
    );

    expect(output.length).toBeGreaterThan(0);
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/records");
  });

  it("get all records with filter (acceptance test)", async () => {
    const mockData = { data: [{ "3": { value: "Company A" }, "6": { value: "Customer" } }] };
    installFetch(mockResponse(mockData));

    const [output] = await run(
      { resource: "record", operation: "getAll", tableId: "abcdefg", filter: "{6.CT.'Customer'}", limit: 50, sortBy: "3", sortDirection: "DESC" },
      [{}],
    );

    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/records/query");
  });

  it("download a file (acceptance test)", async () => {
    const mockData = { data: [{ versionNumber: 1 }] };
    installFetch(mockResponse(mockData));

    const [output] = await run(
      { resource: "file", operation: "download", tableId: "abcdefg", recordId: "12345", fieldId: "67890" },
      [{}],
    );

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/files");
  });

  it("continueOnFail emits error item", async () => {
    installFetch(mockResponse("", 401));

    const [output] = await run(
      { resource: "record", operation: "create", tableId: "abc" },
      [{}],
      { continueOnFail: true },
    );

    expect(output.length).toBe(1);
    expect(output[0].json).toHaveProperty("error");
  });
});
