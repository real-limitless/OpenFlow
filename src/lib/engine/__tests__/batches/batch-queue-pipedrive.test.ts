import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pipedrive";

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
    statusText: status === 204 ? "No Content" : status === 403 ? "Forbidden" : "OK",
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
  const creds = opts?.credentials ?? { pipedriveApi: { apiToken: "test-token" } };
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

describe("batch-queue pipedrive — n8n-nodes-base.pipedrive", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Pipedrive");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.pipedrive")).toBe(canonical);
  });

  describe("Deal create", () => {
    it("creates a deal with request fields and returns the result", async () => {
      installFetch(mockResponse({ data: { id: 42, title: "Renewal", value: 1200, currency: "USD" } }));

      const out = await run(
        {
          resource: "Deal",
          operation: "create",
          requestFields: { title: "Renewal", value: 1200, currency: "USD" },
        },
        [{ json: { title: "Renewal", value: 1200, currency: "USD" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/v2/deals");
      const body = JSON.parse(calls[0].body!);
      expect(body.title).toBe("Renewal");
      expect(body.value).toBe(1200);
      expect(body.currency).toBe("USD");
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        id: 42,
        title: "Renewal",
        value: 1200,
        currency: "USD",
      });
    });

    it("creates a deal using expression from input item", async () => {
      installFetch(mockResponse({ data: { id: 99, title: "Renewal", value: 1200, currency: "USD" } }));

      const out = await run(
        {
          resource: "Deal",
          operation: "create",
          requestFields: "={{ $json }}",
        },
        [{ json: { title: "Renewal", value: 1200, currency: "USD" } }],
      );

      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].body!);
      expect(body.title).toBe("Renewal");
      expect(out[0][0].json).toMatchObject({ id: 99, title: "Renewal" });
    });
  });

  describe("Activity getAll", () => {
    it("lists activities without losing collection metadata", async () => {
      const activities = [
        { id: 1, subject: "Call with John" },
        { id: 2, subject: "Meeting with Jane" },
      ];
      const pagination = { next_start: 10, limit: 2 };
      installFetch(mockResponse({ data: activities, pagination }));

      const out = await run(
        {
          resource: "Activity",
          operation: "getAll",
          query: { limit: 2 },
        },
        [{}],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/v2/activities");
      expect(out[0]).toHaveLength(1);
      const result = out[0][0].json as Record<string, unknown>;
      expect(result.data).toEqual(activities);
      expect(result.pagination).toEqual(pagination);
    });
  });

  describe("Organization update", () => {
    it("updates an organization using an expression", async () => {
      installFetch(mockResponse({ data: { id: 42, name: "Acme Europe" } }));

      const out = await run(
        {
          resource: "Organization",
          operation: "update",
          resourceIdentifier: "={{ $json.organizationId }}",
          requestFields: { name: "={{ $json.name }}" },
        },
        [{ json: { organizationId: 42, name: "Acme Europe" } }],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PATCH");
      expect(calls[0].url).toContain("/v2/organizations/42");
      const body = JSON.parse(calls[0].body!);
      expect(body.name).toBe("Acme Europe");
      expect(out[0][0].json).toMatchObject({ id: 42, name: "Acme Europe" });
    });
  });

  describe("File download as binary", () => {
    it("downloads a file and returns binary data", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 fake pdf content");
      const pdfResponse: ReturnType<typeof mockResponse> = {
        status: 200,
        statusText: "OK",
        ok: true,
        headers: {
          get(name: string) { return "application/pdf"; },
          entries() { return new Map([["content-type", "application/pdf"]]).entries(); },
        },
        async json() { return null; },
        async text() { return pdfBuffer.toString("binary"); },
        async arrayBuffer() { return Buffer.from(pdfBuffer); },
      };
      installFetch(pdfResponse);

      const out = await run(
        {
          resource: "File",
          operation: "download",
          resourceIdentifier: 7,
        },
        [{}],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/v2/files/7/download");
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        id: "7",
        downloaded: true,
      });
      expect(out[0][0].binary).toBeDefined();
      expect(out[0][0].binary!.data).toBeDefined();
      expect(out[0][0].binary!.data.mimeType).toBe("application/pdf");
      expect(out[0][0].binary!.data.data).toEqual(expect.any(String));
      expect(out[0][0].binary!.data.data.length).toBeGreaterThan(0);
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true on authorization failure", async () => {
      installFetch([
        mockResponse({ error: "Unauthorized" }, { status: 403 }),
        mockResponse({ error: "Unauthorized" }, { status: 403 }),
      ]);

      const out = await run(
        {
          resource: "Deal",
          operation: "get",
          resourceIdentifier: 9,
        },
        [{ json: {} }, { json: {} }],
        { continueOnFail: true },
      );

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String), code: 403 } });
      expect(out[0][1].json).toMatchObject({ error: { message: expect.any(String), code: 403 } });
    });

    it("throws on error when continueOnFail is false", async () => {
      installFetch(mockResponse({ error: "Unauthorized" }, { status: 403 }));

      await expect(
        run(
          {
            resource: "Deal",
            operation: "get",
            resourceIdentifier: 9,
          },
          [{ json: {} }],
          { continueOnFail: false },
        ),
      ).rejects.toThrow();
    });
  });

  describe("Person create", () => {
    it("creates a person", async () => {
      installFetch(mockResponse({ data: { id: 55, name: "John Doe" } }));

      const out = await run(
        {
          resource: "Person",
          operation: "create",
          requestFields: { name: "John Doe" },
        },
        [{}],
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/v2/persons");
      const body = JSON.parse(calls[0].body!);
      expect(body.name).toBe("John Doe");
      expect(out[0][0].json).toMatchObject({ id: 55, name: "John Doe" });
    });
  });

  describe("empty input with fallback", () => {
    it("returns one fallback item for no input", async () => {
      installFetch(mockResponse({ data: { id: 1 } }));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "Deal", operation: "create", requestFields: { title: "Test" } },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [],
        continueOnFail: false,
        getCredential: async () => ({ apiToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
    });
  });
});