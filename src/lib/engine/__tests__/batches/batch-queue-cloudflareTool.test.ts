import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.cloudflareTool";

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

const CREDS = { cloudflareApi: { apiToken: "test_cf_token_abc" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue cloudflareTool — n8n-nodes-base.cloudflareTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc.displayName).toBe("Cloudflare Tool");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.cloudflareTool")).toBe(canonical);
  });

  it("upload — uploads a zone certificate", async () => {
    installFetch(
      mockResponse({
        success: true,
        result: {
          id: "zone-cert-123",
          status: "pending",
        },
      }),
    );

    const out = await run({
      resource: "zoneCertificate",
      operation: "upload",
      zoneId: "example.com",
      certificate: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
      privateKey: "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/zones/example.com/origin_tls_client_auth");
    expect(calls[0].headers.Authorization).toBe("Bearer test_cf_token_abc");

    const body = JSON.parse(calls[0].body!);
    expect(body.certificate).toContain("BEGIN CERTIFICATE");
    expect(body.private_key).toContain("BEGIN PRIVATE KEY");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      success: true,
      result: { id: "zone-cert-123", status: "pending" },
    });
  });

  it("get — retrieves a single zone certificate", async () => {
    installFetch(
      mockResponse({
        success: true,
        result: {
          id: "zone-cert-123",
          status: "active",
          hostnames: ["example.com"],
          expires_on: "2027-08-05",
        },
      }),
    );

    const out = await run({
      resource: "zoneCertificate",
      operation: "get",
      zoneId: "example.com",
      certificateId: "zone-cert-123",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/zones/example.com/origin_tls_client_auth/zone-cert-123");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.success).toBe(true);
    expect(out[0][0].json.result.id).toBe("zone-cert-123");
    expect(out[0][0].json.result.status).toBe("active");
  });

  it("getMany — lists zone certificates with filters", async () => {
    installFetch(
      mockResponse({
        success: true,
        result: {
          certificates: [
            { id: "zone-cert-123", status: "active" },
          ],
        },
      }),
    );

    const out = await run({
      resource: "zoneCertificate",
      operation: "getMany",
      zoneId: "example.com",
      returnAll: false,
      limit: 10,
      filters: { status: "active" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/zones/example.com/origin_tls_client_auth");
    expect(calls[0].url).toContain("per_page=10");
    expect(calls[0].url).toContain("status=active");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.success).toBe(true);
    expect(out[0][0].json.result.certificates).toHaveLength(1);
  });

  it("delete — removes a zone certificate", async () => {
    installFetch(
      mockResponse({
        success: true,
        result: null,
      }),
    );

    const out = await run({
      resource: "zoneCertificate",
      operation: "delete",
      zoneId: "example.com",
      certificateId: "zone-cert-123",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("/zones/example.com/origin_tls_client_auth/zone-cert-123");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ success: true, result: null });
  });

  it("fails when credential is missing", async () => {
    await expect(
      run(
        { resource: "zoneCertificate", operation: "getMany", zoneId: "example.com" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/cloudflareApi credential is not configured/);
  });

  it("continueOnFail yields error item on API failure", async () => {
    installFetch(mockResponse({ success: false, errors: [{ message: "Zone not found" }] }, { status: 404 }));
    const out = await run(
      {
        resource: "zoneCertificate",
        operation: "get",
        zoneId: "nonexistent",
        certificateId: "nope",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Cloudflare/);
  });

  it("throws on unsupported operation", async () => {
    await expect(
      run(
        { resource: "zoneCertificate", operation: "nonexistent_op", zoneId: "example.com" },
        [{}],
      ),
    ).rejects.toThrow(/unsupported operation/);
  });
});
