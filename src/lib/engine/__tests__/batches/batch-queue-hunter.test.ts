import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";
import { executeWorkflow } from "../../runner";
import { getExecutorMap } from "../../node-runtime";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.hunter";

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
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      forEach(cb: (v: string, k: string) => void) {
        map.forEach(cb);
      },
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response = mockResponse({ data: { emails: [] } })) {
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

const CREDS = { hunterApi: { apiKey: "test-api-key-123" } };

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

describe("batch-queue hunter — n8n-nodes-base.hunter", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).toBeDefined();
  });

  it("resolves the executor under the canonical type string", () => {
    expect(getExecutor(TYPE)).toBeDefined();
  });

  it("domain search — only emails", async () => {
    installFetch(
      mockResponse({
        data: {
          domain: "stripe.com",
          emails: [
            { value: "patrick@stripe.com", type: "personal", confidence: 99, first_name: "Patrick", last_name: "Collison", position: "CEO", seniority: "executive", department: "executive", sources: [{ domain: "stripe.com", uri: "https://stripe.com/about", extracted_on: "2025-01-01", last_seen_on: "2025-06-01", still_on_page: true }] },
            { value: "john@stripe.com", type: "personal", confidence: 95, first_name: "John", last_name: "Doe", position: "Engineer", seniority: "senior", department: "engineering", sources: [{ domain: "stripe.com", uri: "https://stripe.com/team", extracted_on: "2025-01-01", last_seen_on: "2025-06-01", still_on_page: true }] },
          ],
          meta: { total: 2, results: 2 },
        },
      }),
    );
    const out = await run({
      operation: "domainSearch",
      domain: "stripe.com",
      onlyEmails: true,
      returnAll: false,
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.hunter.io/v2/domain-search");
    expect(calls[0].url).toContain("domain=stripe.com");
    expect(calls[0].url).toContain("api_key=test-api-key-123");
    expect(calls[0].url).toContain("limit=10");
    const j = out[0][0].json as Record<string, unknown>;
    expect(j.emails).toBeDefined();
    expect(Array.isArray(j.emails)).toBe(true);
    expect(j.emails).toHaveLength(2);
    expect((j.emails as Record<string, unknown>[])[0]).toMatchObject({
      value: "patrick@stripe.com",
      type: "personal",
      confidence: 99,
    });
  });

  it("domain search — full metadata (onlyEmails=false)", async () => {
    installFetch(
      mockResponse({
        data: {
          domain: "stripe.com",
          organization: "Stripe, Inc",
          country: "US",
          industry: "FinTech",
          company_type: "private",
          linkedin_url: "https://linkedin.com/company/stripe",
          twitter_url: "https://twitter.com/stripe",
          phone_number: "+1-888-777-8888",
          technologies: ["react", "aws"],
          emails: [
            { value: "patrick@stripe.com", type: "personal", confidence: 99, first_name: "Patrick", last_name: "Collison", position: "CEO", seniority: "executive", department: "executive" },
          ],
          meta: { total: 1, results: 1 },
        },
      }),
    );
    const out = await run({
      operation: "domainSearch",
      domain: "stripe.com",
      onlyEmails: false,
      returnAll: false,
      limit: 5,
    });

    const j = out[0][0].json as Record<string, unknown>;
    expect(j).toMatchObject({
      domain: "stripe.com",
      organization: "Stripe, Inc",
      emails: expect.any(Array),
    });
    expect(j.emails).toHaveLength(1);
    expect((j.emails as Record<string, unknown>[])[0]).toMatchObject({
      value: "patrick@stripe.com",
      type: "personal",
      confidence: 99,
    });
  });

  it("domain search — with filters", async () => {
    installFetch(
      mockResponse({
        data: {
          domain: "stripe.com",
          emails: [
            { value: "patrick@stripe.com", type: "personal", confidence: 99, first_name: "Patrick", last_name: "Collison", seniority: "executive", department: "executive", sources: [] },
          ],
          meta: { total: 1, results: 1 },
        },
      }),
    );
    const out = await run({
      operation: "domainSearch",
      domain: "stripe.com",
      onlyEmails: true,
      returnAll: false,
      limit: 20,
      filters: {
        type: "personal",
        seniority: ["senior", "executive"],
        department: ["engineering", "sales"],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("type=personal");
    expect(calls[0].url).toContain("seniority=senior");
    expect(calls[0].url).toContain("seniority=executive");
    expect(calls[0].url).toContain("department=engineering");
    expect(calls[0].url).toContain("department=sales");
  });

  it("email finder — basic", async () => {
    installFetch(
      mockResponse({
        data: {
          email: "john.doe@stripe.com",
          score: 98,
          domain: "stripe.com",
          first_name: "John",
          last_name: "Doe",
          position: "Engineer",
          company: "Stripe",
          sources: [{ domain: "stripe.com", uri: "https://stripe.com/team", extracted_on: "2025-01-01", last_seen_on: "2025-06-01", still_on_page: true }],
        },
      }),
    );
    const out = await run({
      operation: "emailFinder",
      domain: "stripe.com",
      firstname: "John",
      lastname: "Doe",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("email-finder");
    expect(calls[0].url).toContain("domain=stripe.com");
    expect(calls[0].url).toContain("first_name=John");
    expect(calls[0].url).toContain("last_name=Doe");
    expect(out[0][0].json).toMatchObject({
      email: "john.doe@stripe.com",
      score: 98,
      domain: "stripe.com",
    });
  });

  it("email verifier — basic", async () => {
    installFetch(
      mockResponse({
        data: {
          email: "john.doe@stripe.com",
          result: "deliverable",
          score: 95,
          regexp: true,
          gibberish: false,
          disposable: false,
          webmail: false,
          mx_records: true,
          smtp_server: true,
          smtp_check: true,
          accept_all: false,
          block: false,
          sources: [{ domain: "gmail.com", uri: "https://gmail.com", extracted_on: "2025-01-01", last_seen_on: "2025-06-01", still_on_page: true }],
        },
      }),
    );
    const out = await run({
      operation: "emailVerifier",
      email: "john.doe@stripe.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("email-verifier");
    expect(calls[0].url).toContain("email=john.doe%40stripe.com");
    expect(out[0][0].json).toMatchObject({
      email: "john.doe@stripe.com",
      result: "deliverable",
      score: 95,
    });
  });

  it("continue on fail — domain search failure yields error item", async () => {
    const apiResp = mockResponse({
      data: {
        domain: "stripe.com",
        emails: [{ value: "patrick@stripe.com", type: "personal", confidence: 99 }],
        meta: { total: 1, results: 1 },
      },
    });

    let callCount = 0;
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        callCount++;
        if (callCount === 1) {
          return mockResponse({ data: { emails: [] } }, { status: 403, body: { errors: [{ detail: "Forbidden" }] } });
        }
        calls.push({ url: String(url), method: "GET", headers: {} });
        return apiResp;
      }),
    );

    const out = await run(
      {
        operation: "domainSearch",
        domain: "={{ $json.domain }}",
        onlyEmails: true,
        returnAll: false,
        limit: 5,
      },
      [{ json: { domain: "invalid" } }, { json: { domain: "stripe.com" } }],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
    expect((out[0][1].json as Record<string, unknown>).emails).toBeDefined();
    expect(Array.isArray((out[0][1].json as Record<string, unknown>).emails)).toBe(true);
  });

  it("domain search — returnAll=true fetches multiple pages and merges, ignoring user limit", async () => {
  const page1 = {
    data: {
      domain: "stripe.com",
      emails: [
        { value: "patrick@stripe.com", type: "personal", confidence: 99, first_name: "Patrick", last_name: "Collison" },
      ],
      meta: { results: 3, total: 3 },
    },
  };
  const page2 = {
    data: {
      domain: "stripe.com",
      emails: [
        { value: "john@stripe.com", type: "personal", confidence: 95, first_name: "John", last_name: "Doe" },
      ],
      meta: { results: 3, total: 3 },
    },
  };
  const page3 = {
    data: {
      domain: "stripe.com",
      emails: [
        { value: "jane@stripe.com", type: "personal", confidence: 90, first_name: "Jane", last_name: "Smith" },
      ],
      meta: { results: 3, total: 3 },
    },
  };
  const responses = [mockResponse(page1), mockResponse(page2), mockResponse(page3)];
  let idx = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => responses[idx++] ?? mockResponse({ data: { emails: [] } })),
  );

  const out = await run({
    operation: "domainSearch",
    domain: "stripe.com",
    onlyEmails: true,
    returnAll: true,
    limit: 1,
  });

  expect(idx).toBe(3);
  expect(out[0]).toHaveLength(1);
  const j = out[0][0].json as Record<string, unknown>;
  const emails = j.emails as unknown[];
  expect(emails).toHaveLength(3);
  expect((emails[0] as Record<string, unknown>).value).toBe("patrick@stripe.com");
  expect((emails[1] as Record<string, unknown>).value).toBe("john@stripe.com");
  expect((emails[2] as Record<string, unknown>).value).toBe("jane@stripe.com");
});

it("throws when credentials are missing", async () => {
    await expect(
      run(
        { operation: "domainSearch", domain: "stripe.com" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow("hunterApi credential is not configured");
  });

  it("runs end-to-end in a workflow", async () => {
    installFetch(
      mockResponse({
        data: {
          domain: "stripe.com",
          emails: [{ value: "patrick@stripe.com", type: "personal", confidence: 99 }],
          meta: { total: 1, results: 1 },
        },
      }),
    );

    const node: INode = {
      id: "h1",
      name: "Hunter",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        operation: "domainSearch",
        domain: "stripe.com",
        onlyEmails: true,
        returnAll: false,
        limit: 5,
      },
      credentials: { hunterApi: { name: "hunterApi" } },
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
    expect(result[0][0].json.emails).toBeDefined();
    expect(Array.isArray(result[0][0].json.emails)).toBe(true);
    expect(result[0][0].json.emails).toHaveLength(1);
  });
});
