import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";
import { getExecutorMap } from "../../node-runtime";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.uplead";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get() { return ct; },
    },
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

let calls: FetchCall[];

function installFetch(response = mockResponse({ data: {} })) {
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
      });
      return response;
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

const CREDS = { upleadApi: { apiKey: "test-api-key" } };

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
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
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

describe("batch-queue uplead — n8n-nodes-base.uplead", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).toBeDefined();
  });

  it("resolves the executor under the canonical type string", () => {
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("company enrich by domain", async () => {
    installFetch(
      mockResponse({
        data: {
          id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          company_name: "Amazon",
          domain: "amazon.com",
        },
        userInfo: { availableCredits: 42 },
      }),
    );
    const out = await run({
      resource: "Company",
      operation: "Enrich",
      by: "domain",
      domain: "amazon.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.uplead.com/v2/company-search");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers).toMatchObject({ Authorization: "test-api-key" });
    const j = out[0][0].json as Record<string, unknown>;
    const data = j.data as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(data.company_name).toBe("Amazon");
    expect(data.domain).toBe("amazon.com");
    expect(data.id).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect((j.userInfo as Record<string, unknown>).availableCredits).toBe(42);
  });

  it("company enrich by companyName", async () => {
    installFetch(
      mockResponse({
        data: {
          id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          company_name: "Amazon",
          domain: "amazon.com",
        },
        userInfo: { availableCredits: 10 },
      }),
    );
    const out = await run({
      resource: "Company",
      operation: "Enrich",
      by: "companyName",
      companyName: "Amazon",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("company-search");
    expect(out[0][0].json.data.company_name).toBe("Amazon");
    expect(out[0][0].json.data.domain).toBe("amazon.com");
    expect(out[0][0].json.data.id).toBeTruthy();
  });

  it("person enrich by email", async () => {
    installFetch(
      mockResponse({
        data: {
          id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
          first_name: "Marc",
          last_name: "Benioff",
          email: "marc@salesforce.com",
          email_status: "valid",
        },
        userInfo: { availableCredits: 5 },
      }),
    );
    const out = await run({
      resource: "Person",
      operation: "Enrich",
      by: "email",
      email: "marc@salesforce.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("person-search");
    const data = out[0][0].json.data as Record<string, unknown>;
    expect(data.first_name).toBe("Marc");
    expect(data.last_name).toBe("Benioff");
    expect(data.email).toBe("marc@salesforce.com");
    expect(data.email_status).toBe("valid");
  });

  it("person enrich by name+domain", async () => {
    installFetch(
      mockResponse({
        data: {
          id: "d4e5f6a7-b8c9-0123-defa-234567890123",
          first_name: "Marc",
          last_name: "Benioff",
          email: "marc@salesforce.com",
          domain: "salesforce.com",
          company_name: "Salesforce",
          email_status: "valid",
        },
        userInfo: { availableCredits: 3 },
      }),
    );
    const out = await run({
      resource: "Person",
      operation: "Enrich",
      by: "nameAndDomain",
      firstName: "Marc",
      lastName: "Benioff",
      domain: "salesforce.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("person-search");
    const data = out[0][0].json.data as Record<string, unknown>;
    expect(data.first_name).toBe("Marc");
    expect(data.last_name).toBe("Benioff");
    expect(data.email).toBe("marc@salesforce.com");
    expect(data.domain).toBe("salesforce.com");
    expect(data.company_name).toBe("Salesforce");
    expect(data.email_status).toBe("valid");
  });

  it("error on missing lookup key", async () => {
    await expect(
      run({
        resource: "Company",
        operation: "Enrich",
        by: "domain",
        domain: "",
      }),
    ).rejects.toThrow("UpLead: Domain is required for company enrich by domain");
  });

  it("throws when credentials are missing", async () => {
    await expect(
      run(
        { resource: "Company", operation: "Enrich", by: "domain", domain: "amazon.com" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow("upleadApi credential is not configured");
  });

  it("continue on fail yields error item on API failure", async () => {
    installFetch(mockResponse({ error: { type: "auth_error", message: "Invalid API key" } }, { status: 403 }));

    const out = await run(
      {
        resource: "Company",
        operation: "Enrich",
        by: "domain",
        domain: "amazon.com",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });

  it("runs end-to-end in a workflow", async () => {
    installFetch(
      mockResponse({
        data: { id: "e5f6a7b8-c9d0-1234-efab-345678901234", company_name: "TestCorp", domain: "test.com" },
        userInfo: { availableCredits: 99 },
      }),
    );

    const node: INode = {
      id: "u1",
      name: "UpLead",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        resource: "Company",
        operation: "Enrich",
        by: "domain",
        domain: "test.com",
      },
      credentials: { upleadApi: { name: "upleadApi" } },
    };

    const wf = makeWorkflow([node], {});
    const wfCtx = createExecutionContext({
      node,
      workflow: wf,
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key" }),
    });

    const executor = getExecutor(TYPE)!;
    const result = await executor(wfCtx, node);
    expect(result[0][0].json.data.company_name).toBe("TestCorp");
    expect(result[0][0].json.data.domain).toBe("test.com");
    expect(result[0][0].json.userInfo.availableCredits).toBe(99);
  });
});
