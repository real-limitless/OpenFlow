import { describe, it, expect, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.tapfiliate";

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
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: String(init?.method ?? "GET"),
      headers,
      body: init?.body ? String(init.body) : undefined,
    });
    const resp = responseQueue.shift() ?? mockResponse({});
    return resp;
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function runNode(parameters: Record<string, unknown>, inputItems: Array<Record<string, unknown>> = [{}]) {
  const executor = getExecutor(TYPE)!;
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const { createExecutionContext } = await import("@/sdk");
  const { makeWorkflow } = await import("../helpers");
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => inputItems.map((j) => ({ json: j })),
    continueOnFail: false,
    getCredential: async (name: string) => {
      if (name === "tapfiliateApi") return { apiKey: "test-api-key" } as any;
      return null;
    },
  });
  return executor(ctx, node);
}

describe("Tapfiliate executor", () => {
  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has a node description", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
    expect(desc?.displayName).toBe("Tapfiliate");
  });

  describe("Affiliate", () => {
    it("creates an affiliate", async () => {
      const created = { id: "janejameson", firstname: "Jane", lastname: "Doe", email: "test@example.com", referral_code: "ABC123" };
      installFetch(mockResponse(created));

      const [out] = await runNode({
        resource: "affiliate",
        operation: "create",
        email: "test@example.com",
        firstname: "Jane",
        lastname: "Doe",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/affiliates/");
      const body = JSON.parse(calls[0].body!);
      expect(body.email).toBe("test@example.com");
      expect(body.firstname).toBe("Jane");
      expect(body.lastname).toBe("Doe");
      expect(out).toHaveLength(1);
      expect(out[0].json).toMatchObject(created);
    });

    it("gets an affiliate by ID", async () => {
      const affiliate = { id: "janejameson", firstname: "Jane", email: "test@example.com" };
      installFetch(mockResponse(affiliate));

      const [out] = await runNode({
        resource: "affiliate",
        operation: "get",
        affiliateId: "janejameson",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/affiliates/janejameson/");
      expect(out[0].json).toMatchObject(affiliate);
    });

    it("lists affiliates with filters", async () => {
      const list = { data: [{ id: "1", email: "test@example.com" }] };
      installFetch(mockResponse(list));

      const [out] = await runNode({
        resource: "affiliate",
        operation: "getAll",
        returnAll: false,
        limit: 10,
        filters: { email: "test@example.com" },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/affiliates/");
      expect(calls[0].url).toContain("email=test%40example.com");
      expect(out).toHaveLength(1);
    });

    it("deletes an affiliate", async () => {
      installFetch(mockResponse(null, { status: 204 }));

      const [out] = await runNode({
        resource: "affiliate",
        operation: "delete",
        affiliateId: "janejameson",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/affiliates/janejameson/");
    });
  });

  describe("Affiliate Metadata", () => {
    it("adds metadata", async () => {
      installFetch(mockResponse({ region: "EMEA" }));

      const [out] = await runNode({
        resource: "affiliateMetadata",
        operation: "add",
        affiliateId: "janejameson",
        metadataUi: { metadataValues: [{ key: "region", value: "EMEA" }] },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/affiliates/janejameson/meta-data/");
      const body = JSON.parse(calls[0].body!);
      expect(body.region).toBe("EMEA");
    });

    it("removes metadata by key", async () => {
      installFetch(mockResponse(null, { status: 204 }));

      const [out] = await runNode({
        resource: "affiliateMetadata",
        operation: "remove",
        affiliateId: "janejameson",
        key: "region",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/affiliates/janejameson/meta-data/region/");
    });
  });

  describe("Program Affiliate", () => {
    it("adds affiliate to program", async () => {
      const result = { id: "rel-1", affiliate: "janejameson", program: "my-program" };
      installFetch(mockResponse(result));

      const [out] = await runNode({
        resource: "programAffiliate",
        operation: "add",
        programId: "my-program",
        affiliateId: "janejameson",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/programs/my-program/affiliates/");
      const body = JSON.parse(calls[0].body!);
      expect(body.affiliate).toBe("janejameson");
    });

    it("approves an affiliate in a program", async () => {
      installFetch(mockResponse({ status: "approved" }));

      const [out] = await runNode({
        resource: "programAffiliate",
        operation: "approve",
        programId: "my-program",
        affiliateId: "janejameson",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/programs/my-program/affiliates/janejameson/approve/");
    });
  });

  describe("Errors", () => {
    it("fails on invalid credentials", async () => {
      const executor = getExecutor(TYPE)!;
      const node = makeNode({ name: "N", type: TYPE, parameters: { resource: "affiliate", operation: "create" } });
      const { createExecutionContext } = await import("@/sdk");
      const { makeWorkflow } = await import("../helpers");
      const ctx = createExecutionContext({
        node,
        workflow: makeWorkflow([node]),
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => null,
      });

      await expect(executor(ctx, node)).rejects.toThrow(/credential/i);
    });

    it("fails on API error", async () => {
      installFetch(mockResponse({ message: "Not found" }, { status: 404 }));

      await expect(
        runNode({
          resource: "affiliate",
          operation: "get",
          affiliateId: "nonexistent",
        }),
      ).rejects.toThrow(/Not found/i);
    });
  });
});
