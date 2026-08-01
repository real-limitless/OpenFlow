import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.zohoCrm";

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
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
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
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

const CREDS = { zohoOAuth2Api: { accessToken: "test_token", apiDomain: "https://www.zohoapis.com" } };
const BASE_URL = "https://www.zohoapis.com/crm/v8";

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
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

beforeEach(() => { installFetch(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue zohoCrm — n8n-nodes-base.zohoCrm", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Zoho CRM");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.zohoCrm")).toBe(canonical);
  });

  it("create a contact with expression-based fields", async () => {
    installFetch(
      mockResponse({ data: [{ id: "123456789", status: "success" }] }),
    );

    const out = await run(
      {
        module: "Contact",
        operation: "create",
        recordData: { Last_Name: "Lovelace", Email: "={{ $json.email }}" },
      },
      [{ json: { email: "ada@example.test" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/Contacts`);
    expect(calls[0].headers.Authorization).toBe("Zoho-oauthtoken test_token");
    const body = JSON.parse(calls[0].body!);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].Last_Name).toBe("Lovelace");
    expect(body.data[0].Email).toBe("ada@example.test");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "123456789", status: "success" });
  });

  it("get one lead by ID", async () => {
    installFetch(
      mockResponse({ data: [{ id: "LEAD_ID", Company: "Acme", Last_Name: "Smith" }] }),
    );

    const out = await run(
      { module: "Lead", operation: "get", recordId: "LEAD_ID" },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE_URL}/Leads/LEAD_ID`);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "LEAD_ID" });
  });

  it("getAll accounts with pagination options", async () => {
    installFetch(
      mockResponse({
        data: [{ id: "1", Account_Name: "Acme" }],
        info: { page: 1, per_page: 2, more_records: false },
      }),
    );

    const out = await run(
      {
        module: "Account",
        operation: "getAll",
        retrievalOptions: { fields: "Account_Name", page: 1, perPage: 2 },
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("Accounts");
    expect(calls[0].url).toContain("per_page=2");
    expect(calls[0].url).toContain("page=1");
    expect(calls[0].url).toContain("fields=Account_Name");
    expect(out[0].length).toBeGreaterThanOrEqual(1);
    expect(out[0][0].json).toMatchObject({ id: "1", Account_Name: "Acme" });
  });

  it("update a product", async () => {
    installFetch(
      mockResponse({ data: [{ id: "PRODUCT_ID", status: "success" }] }),
    );

    const out = await run(
      {
        module: "Product",
        operation: "update",
        recordId: "PRODUCT_ID",
        recordData: { Product_Name: "Updated product" },
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE_URL}/Products/PRODUCT_ID`);
    const body = JSON.parse(calls[0].body!);
    expect(body.data[0].Product_Name).toBe("Updated product");
    expect(out[0][0].json).toMatchObject({ id: "PRODUCT_ID", status: "updated" });
  });

  it("delete a record", async () => {
    installFetch(
      mockResponse({ data: [{ id: "PRODUCT_ID", status: "success" }] }),
    );

    const out = await run(
      { module: "Product", operation: "delete", recordId: "PRODUCT_ID" },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("Products?ids=PRODUCT_ID");
    expect(out[0][0].json).toMatchObject({ id: "PRODUCT_ID", status: "deleted" });
  });

  it("invalid credentials throws actionable error", async () => {
    const badCreds = { zohoOAuth2Api: { accessToken: "", apiDomain: "" } };
    await expect(
      run(
        { module: "Lead", operation: "get", recordId: "LEAD_ID" },
        [{}],
        { continueOnFail: true, credentials: badCreds },
      ),
    ).rejects.toThrow(/credential is not configured/);
  });

  it("unsupported module throws error", async () => {
    await expect(
      run({ module: "InvalidModule", operation: "get", recordId: "1" }, [{}]),
    ).rejects.toThrow(/unsupported module/);
  });
});