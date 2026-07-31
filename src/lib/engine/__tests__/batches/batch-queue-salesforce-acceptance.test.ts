import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.salesforce";

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
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
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

const CREDS = { salesforceOAuth2Api: { accessToken: "00D_test_token", instanceUrl: "https://test.salesforce.com" } };
const BASE_URL = "https://test.salesforce.com/services/data/v58.0";

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue salesforce — n8n-nodes-base.salesforce", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Salesforce");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.salesforce")).toBe(canonical);
  });

  it("account.create — create an account with mapped fields", async () => {
    installFetch(
      mockResponse({ id: "001000000000001", success: true }),
    );

    const out = await run(
      {
        resource: "account",
        operation: "create",
        fields: { field: [{ fieldName: "Name", fieldValue: "={{ $json.name }}" }] },
      },
      [{ json: { name: "Acme Example" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/sobjects/Account`);
    expect(calls[0].headers.Authorization).toBe("Bearer 00D_test_token");
    const body = JSON.parse(calls[0].body!);
    expect(body.Name).toBe("Acme Example");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "001000000000001",
      success: true,
      Name: "Acme Example",
    });
  });

  it("contact.getAll — get all contacts (empty result)", async () => {
    installFetch(
      mockResponse({ totalSize: 0, done: true, records: [] }),
    );

    const out = await run(
      {
        resource: "contact",
        operation: "getAll",
        returnAll: true,
        options: { fields: "Id,Name" },
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/query?q=");
    expect(calls[0].url).toContain("FROM%20Contact");
    expect(out[0]).toHaveLength(0);
  });

  it("search.query — execute a SOQL search with expression", async () => {
    installFetch(
      mockResponse({
        totalSize: 1,
        done: true,
        records: [
          { Id: "001000000000001", Name: "Acme Example", attributes: { type: "Account" } },
        ],
      }),
    );

    const out = await run(
      {
        resource: "search",
        operation: "query",
        query: "SELECT Id, Name FROM Account WHERE Name = '{{ $json.accountName }}'",
      },
      [{ json: { accountName: "Acme Example" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/query?q=");
    expect(calls[0].url).toContain(encodeURIComponent("SELECT Id, Name FROM Account WHERE Name = 'Acme Example'"));
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      Id: "001000000000001",
      Name: "Acme Example",
    });
  });

  it("account.delete — delete a record returns confirmation", async () => {
    installFetch(
      mockResponse(null, { status: 204 }),
    );

    const out = await run(
      {
        resource: "account",
        operation: "delete",
        recordId: "={{ $json.recordId }}",
      },
      [{ json: { recordId: "001000000000001" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE_URL}/sobjects/Account/001000000000001`);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "001000000000001", success: true });
  });

  it("invalid credentials throws actionable error", async () => {
    const badCreds = { salesforceOAuth2Api: { accessToken: "", instanceUrl: "" } };

    await expect(
      run(
        {
          resource: "account",
          operation: "get",
          recordId: "001000000000001",
        },
        [{}],
        { continueOnFail: true, credentials: badCreds },
      ),
    ).rejects.toThrow(/credential is not configured/);
  });
});