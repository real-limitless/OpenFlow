import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mauticTool";

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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(
  response: ReturnType<typeof mockResponse> = mockResponse({}),
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
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { mauticApi: { url: "https://mautic.example.com", user: "admin", password: "pass123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mauticTool — n8n-nodes-base.mauticTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("creates a contact via the tool variant", async () => {
    installFetch(mockResponse({
      contact: { id: 42, fields: { all: [], core: { firstname: { value: "Jane" }, lastname: { value: "Doe" }, email: { value: "jane@example.com" } } }, points: 0 },
    }));
    const out = await run({
      resource: "contact",
      operation: "create",
      requestFields: JSON.stringify({ firstname: "Jane", lastname: "Doe", email: "jane@example.com" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/new");
    expect(JSON.parse(calls[0].body!)).toEqual({ firstname: "Jane", lastname: "Doe", email: "jane@example.com" });
    expect(out[0][0].json).toMatchObject({ id: 42 });
  });

  it("adds a contact to a campaign", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "campaignContact",
      operation: "add",
      campaignId: "456",
      contactId: "123",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/campaigns/456/contact/123/add");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("lists contacts with search filter", async () => {
    installFetch(mockResponse({
      total: 1,
      contacts: { 42: { id: 42, fields: { core: { email: { value: "jane@example.com" } } } } },
    }));
    const out = await run({
      resource: "contact",
      operation: "getAll",
      queryOptions: JSON.stringify({ search: "jane@example.com" }),
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("search=jane%40example.com");
    expect(out[0][0].json).toMatchObject({ total: 1 });
  });

  it("throws on missing contactId for get operation", async () => {
    await expect(
      run({
        resource: "contact",
        operation: "get",
        contactId: "",
      }),
    ).rejects.toThrow(/contactId is required/);
  });

  it("delegates to the same mautic executor for all resources", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "companyContact",
      operation: "add",
      companyId: "10",
      contactId: "42",
    });

    expect(calls[0].url).toBe("https://mautic.example.com/api/companies/10/contact/42/add");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("sends Basic auth header from credential", async () => {
    const expectedAuth = "Basic " + Buffer.from("admin:pass123").toString("base64");
    await run({
      resource: "contact",
      operation: "get",
      contactId: "42",
    });

    expect(calls[0].headers["Authorization"]).toBe(expectedAuth);
  });
});
