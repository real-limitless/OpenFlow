import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.salesforceTool";

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

describe("batch-queue salesforceTool — n8n-nodes-base.salesforceTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Salesforce Tool");
  });

  it("contact.upsert — upsert via fields json (AI agent pattern)", async () => {
    installFetch(
      mockResponse({ id: "003000000000001", success: true }),
    );

    const out = await run(
      {
        resource: "contact",
        operation: "upsert",
        fields: JSON.stringify({
          FirstName: "Jane",
          LastName: "Doe",
          Email: "jane@example.com",
          Phone: "+12025551234",
        }),
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/sobjects/Contact`);
    const body = JSON.parse(calls[0].body!);
    expect(body.FirstName).toBe("Jane");
    expect(body.LastName).toBe("Doe");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "003000000000001",
      success: true,
    });
  });

  it("search.query — execute SOQL query with expression", async () => {
    installFetch(
      mockResponse({
        totalSize: 1,
        done: true,
        records: [
          { Id: "001000000000001", Name: "Acme Example", Type: "Partner", attributes: { type: "Account" } },
        ],
      }),
    );

    const out = await run(
      {
        resource: "search",
        operation: "query",
        query: "SELECT Id, Name, Type FROM Account WHERE Name = '{{ $json.accountName }}'",
        returnAll: true,
      },
      [{ json: { accountName: "Acme Example" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/query?q=");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      Id: "001000000000001",
      Name: "Acme Example",
    });
  });

  it("account.delete — record deletion returns confirmation", async () => {
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

  it("case.create — create case from input fields", async () => {
    installFetch(
      mockResponse({ id: "500000000000001", success: true, CaseNumber: "00001000" }),
    );

    const out = await run(
      {
        resource: "case",
        operation: "create",
        fields: JSON.stringify({
          Subject: "API issue",
          Description: "Timeout on GET request",
          Status: "New",
          Priority: "High",
        }),
      },
      [{ json: { subject: "API issue", description: "Timeout on GET request" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/sobjects/Case`);
    const body = JSON.parse(calls[0].body!);
    expect(body.Subject).toBe("API issue");
    expect(body.Status).toBe("New");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "500000000000001",
      CaseNumber: "00001000",
    });
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
