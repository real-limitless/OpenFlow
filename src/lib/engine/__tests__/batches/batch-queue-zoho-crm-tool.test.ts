import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.zohoCrmTool";

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

describe("batch-queue zohoCrmTool — n8n-nodes-base.zohoCrmTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Zoho CRM (AI Tool)");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor(TYPE)).toBe(canonical);
  });

  it("AI agent creates a lead with additionalFields", async () => {
    installFetch(
      mockResponse({ data: [{ id: "LEAD_123", Created_Time: "2026-01-15T10:00:00Z", status: "success" }] }),
    );

    const out = await run(
      {
        resource: "lead",
        operation: "create",
        additionalFields: { Company: "Acme Inc", Last_Name: "Smith" },
      },
      [{ json: { company: "Acme Inc", lastName: "Smith" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/Leads`);
    expect(calls[0].headers.Authorization).toBe("Zoho-oauthtoken test_token");
    const body = JSON.parse(calls[0].body!);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].Company).toBe("Acme Inc");
    expect(body.data[0].Last_Name).toBe("Smith");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "LEAD_123", Created_Time: "2026-01-15T10:00:00Z" });
  });

  it("AI agent gets a contact by ID", async () => {
    installFetch(
      mockResponse({ data: [{ id: "CONTACT_456", First_Name: "Ada", Last_Name: "Lovelace" }] }),
    );

    const out = await run(
      { resource: "contact", operation: "get", contactId: "CONTACT_456" },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE_URL}/Contacts/CONTACT_456`);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "CONTACT_456", First_Name: "Ada" });
  });

  it("AI agent lists deals with pagination", async () => {
    installFetch(
      mockResponse({
        data: [
          { id: "1", Deal_Name: "Deal 1", Amount: 1000, Stage: "Closed Won" },
          { id: "2", Deal_Name: "Deal 2", Amount: 2000, Stage: "Negotiation" },
        ],
      }),
    );

    const out = await run(
      { resource: "deal", operation: "getAll", returnAll: false, limit: 5 },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("Deals");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "1", Deal_Name: "Deal 1" });
    expect(out[0][1].json).toMatchObject({ id: "2", Deal_Name: "Deal 2" });
  });

  it("AI agent updates an account", async () => {
    installFetch(
      mockResponse({ data: [{ id: "ACCT_789", status: "success" }] }),
    );

    const out = await run(
      {
        resource: "account",
        operation: "update",
        accountId: "ACCT_789",
        additionalFields: { Account_Name: "Updated Corp" },
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE_URL}/Accounts/ACCT_789`);
    const body = JSON.parse(calls[0].body!);
    expect(body.data[0].Account_Name).toBe("Updated Corp");
    expect(out[0][0].json).toMatchObject({ id: "ACCT_789", status: "updated" });
  });

  it("delete a record", async () => {
    installFetch(
      mockResponse({ data: [{ id: "LEAD_999", status: "success" }] }),
    );

    const out = await run(
      { resource: "lead", operation: "delete", leadId: "LEAD_999" },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("Leads?ids=LEAD_999");
    expect(out[0][0].json).toMatchObject({ id: "LEAD_999", status: "deleted" });
  });

  it("invalid credentials throws actionable error", async () => {
    const badCreds = { zohoOAuth2Api: { accessToken: "", apiDomain: "" } };
    await expect(
      run(
        { resource: "lead", operation: "get", leadId: "LEAD_ID" },
        [{}],
        { continueOnFail: true, credentials: badCreds },
      ),
    ).rejects.toThrow(/credential is not configured/);
  });

  it("unsupported resource throws error", async () => {
    await expect(
      run({ resource: "widget", operation: "get", widgetId: "1" }, [{}]),
    ).rejects.toThrow(/unsupported resource/);
  });

  it("continueOnFail catches API errors", async () => {
    installFetch(
      mockResponse({ code: "INVALID_DATA", message: "Bad request" }, { status: 400 }),
    );

    const out = await run(
      { resource: "lead", operation: "create", additionalFields: {} },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Zoho CRM") });
  });

  it("getFields for lead returns field descriptors", async () => {
    installFetch(
      mockResponse({
        fields: [
          { field_label: "Company", api_name: "Company", custom_field: false },
          { field_label: "Last Name", api_name: "Last_Name", custom_field: false },
        ],
      }),
    );

    const out = await run(
      { resource: "lead", operation: "getFields" },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("settings/fields");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ api_name: "Company" }),
      ]),
    });
  });
});
