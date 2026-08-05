import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.agileCrm";

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
    async arrayBuffer() { return Buffer.from(text); },
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
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
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
  }));
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
  const creds = opts?.credentials ?? { agileCrmApi: { email: "test@example.com", apiKey: "test-key", subdomain: "test" } };
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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue agileCrm — n8n-nodes-base.agileCrm", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Agile CRM");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.agileCrm")).toBe(canonical);
  });

  describe("Contact create", () => {
    it("creates a contact with JSON parameters and returns result", async () => {
      installFetch(mockResponse({ id: "12345" }));

      const out = await run(
        {
          resource: "contact",
          operation: "create",
          contactJsonParameters: {
            values: [
              { fieldName: "first_name", fieldValue: "Alice", type: "SYSTEM" },
              { fieldName: "last_name", fieldValue: "Smith", type: "SYSTEM" },
              { fieldName: "email", fieldValue: "alice@example.com", type: "SYSTEM" },
            ],
          },
        },
        [{ json: { firstName: "Alice", lastName: "Smith", email: "alice@example.com" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/crm/contact");
      const body = JSON.parse(calls[0].body!);
      expect(body.properties).toHaveLength(3);
      expect(body.properties[0]).toMatchObject({ name: "first_name", value: "Alice" });
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "12345" });
    });
  });

  describe("Deal create", () => {
    it("creates a deal with name, expected value, probability, and milestone", async () => {
      installFetch(mockResponse({ id: "42", name: "Big Deal", expected_value: 50000 }));

      const out = await run(
        {
          resource: "deal",
          operation: "create",
          name: "Big Deal",
          expectedValue: 50000,
          probability: 80,
          milestone: "Proposal",
        },
        [{ json: { dealName: "Big Deal", value: 50000 } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/crm/deal");
      const body = JSON.parse(calls[0].body!);
      expect(body.name).toBe("Big Deal");
      expect(body.expected_value).toBe(50000);
      expect(body.probability).toBe(80);
      expect(body.milestone).toBe("Proposal");
      expect(out[0][0].json).toMatchObject({ id: "42", name: "Big Deal", expected_value: 50000 });
    });

    it("creates a deal using expression from input item", async () => {
      installFetch(mockResponse({ id: "99", name: "Renewal", expected_value: 1200 }));

      const out = await run(
        {
          resource: "deal",
          operation: "create",
          name: "={{ $json.dealName }}",
          expectedValue: "={{ $json.value }}",
          probability: 80,
          milestone: "Proposal",
        },
        [{ json: { dealName: "Renewal", value: 1200 } }],
      );

      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.name).toBe("Renewal");
      expect(body.expected_value).toBe(1200);
      expect(out[0][0].json).toMatchObject({ id: "99", name: "Renewal" });
    });
  });

  describe("Get All companies (paged)", () => {
    it("returns companies list with limit", async () => {
      const companies = [{ id: "1", name: "Acme" }, { id: "2", name: "Globex" }];
      installFetch(mockResponse({ data: companies }));

      const out = await run(
        {
          resource: "company",
          operation: "getAll",
          returnAll: false,
          limit: 10,
        },
        [{}],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/crm/company/paginate");
      const body = JSON.parse(calls[0].body!);
      expect(body.filterType).toBe("all");
      expect(body.limit).toBe(10);
      expect(out[0]).toHaveLength(2);
    });
  });

  describe("Contact create with bare-array parameters", () => {
    it("creates a contact from a bare array of properties", async () => {
      installFetch(mockResponse({ id: "999" }));

      const out = await run(
        {
          resource: "contact",
          operation: "create",
          contactJsonParameters: [
            { fieldName: "first_name", fieldValue: "Bob", type: "SYSTEM" },
            { fieldName: "email", fieldValue: "bob@example.com", type: "SYSTEM" },
          ],
        },
        [{}],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/crm/contact");
      const body = JSON.parse(calls[0].body!);
      expect(body.properties).toHaveLength(2);
      expect(body.properties[0]).toMatchObject({ name: "first_name", value: "Bob" });
      expect(out[0][0].json).toMatchObject({ id: "999" });
    });
  });

  describe("Delete contact", () => {
    it("emits input item unchanged on successful delete", async () => {
      installFetch(mockResponse({}, { status: 204 }));

      const out = await run(
        {
          resource: "contact",
          operation: "delete",
          contactId: "12345",
        },
        [{ json: { contactId: 12345 } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/crm/contact/12345");
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({ contactId: 12345 });
    });
  });

  describe("Not found returns error", () => {
    it("throws NodeApiError-like error on 404", async () => {
      installFetch(mockResponse({ message: "Not found" }, { status: 404 }));

      await expect(
        run(
          {
            resource: "company",
            operation: "get",
            companyId: "99999999",
          },
          [{}],
          { continueOnFail: false },
        ),
      ).rejects.toThrow(/Not found/);
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true", async () => {
      installFetch([
        mockResponse({ message: "Not found" }, { status: 404 }),
        mockResponse({ message: "Not found" }, { status: 404 }),
      ]);

      const out = await run(
        {
          resource: "company",
          operation: "get",
          companyId: "99999999",
        },
        [{ json: {} }, { json: {} }],
        { continueOnFail: true },
      );

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String), code: 404 } });
      expect(out[0][1].json).toMatchObject({ error: { message: expect.any(String), code: 404 } });
    });

    it("throws on error when continueOnFail is false", async () => {
      installFetch(mockResponse({ message: "Not found" }, { status: 404 }));

      await expect(
        run(
          {
            resource: "company",
            operation: "get",
            companyId: "99999999",
          },
          [{ json: {} }],
          { continueOnFail: false },
        ),
      ).rejects.toThrow();
    });
  });

  describe("empty input with fallback", () => {
    it("returns one fallback item for no input", async () => {
      installFetch(mockResponse({ id: "1" }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "deal", operation: "create", name: "Test" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [],
        continueOnFail: false,
        getCredential: async () => ({ email: "test@example.com", apiKey: "test-key", subdomain: "test" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
    });
  });
});
