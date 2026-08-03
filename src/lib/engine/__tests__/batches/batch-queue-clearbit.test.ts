import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.clearbit";

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
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse(
    {},
  ),
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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function runNode(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Clearbit", type: TYPE, parameters: params });
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf-clearbit",
      name: "Clearbit Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () =>
        inputItems.map((item): INodeExecutionData =>
        item && typeof item === "object" && "json" in item
          ? (item as unknown as INodeExecutionData)
          : { json: item as Record<string, unknown> },
      ),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ apiKey: "test-key-123" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("n8n-nodes-base.clearbit", () => {
  it("registers executor and node type", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE)).toBeTruthy();
  });

  it("company → enrich makes correct API call and returns combined data", async () => {
    const mockCombined = {
      person: {
        name: { fullName: "Alex Stripe" },
        email: "alex@stripe.com",
        employment: { domain: "stripe.com", name: "Stripe" },
      },
      company: {
        name: "Stripe",
        domain: "stripe.com",
        description: "Payment platform",
      },
    };
    installFetch(mockResponse(mockCombined));

    const [out] = await runNode({
      resource: "company",
      operation: "enrich",
      domain: "stripe.com",
    });

    expect(out).toHaveLength(1);
    const item = out[0].json as Record<string, unknown>;
    expect(item.person).toBeTruthy();
    expect((item.person as Record<string, unknown>).name).toBeTruthy();
    expect((item.person as Record<string, unknown>).email).toBe("alex@stripe.com");
    expect(item.company).toBeTruthy();
    expect((item.company as Record<string, unknown>).domain).toBe("stripe.com");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.clearbit.com/v2/combined");
    expect(calls[0].url).toContain("domain=stripe.com");
    expect(calls[0].headers["authorization"] || calls[0].headers["Authorization"]).toBeTruthy();
  });

  it("company → enrich with additional fields", async () => {
    const mockCombined = {
      person: { name: { fullName: "Alex Stripe" }, email: "alex@stripe.com" },
      company: { name: "Stripe", domain: "stripe.com", twitter: { handle: "stripe" } },
    };
    installFetch(mockResponse(mockCombined));

    const [out] = await runNode({
      resource: "company",
      operation: "enrich",
      domain: "stripe.com",
      additionalFields: { twitter: "stripe" },
    });

    expect(out).toHaveLength(1);
    expect(calls[0].url).toContain("twitter=stripe");
  });

  it("company → autocomplete returns suggestions", async () => {
    const mockResults = [
      { name: "Stripe", domain: "stripe.com", logo: "https://logo.clearbit.com/stripe.com" },
    ];
    installFetch(mockResponse(mockResults));

    const [out] = await runNode({
      resource: "company",
      operation: "autocomplete",
      name: "Strip",
    });

    expect(out).toHaveLength(1);
    const results = out[0].json as unknown as unknown[];
    expect(results).toHaveLength(1);
    expect(results[0] as Record<string, unknown>).toMatchObject({
      name: "Stripe",
      domain: "stripe.com",
    });
    expect(calls[0].url).toContain("api.clearbit.com/v2/companies/autocomplete");
    expect(calls[0].url).toContain("query=Strip");
  });

  it("person → enrich returns person data", async () => {
    const mockPerson = {
      name: { fullName: "Alex Stripe" },
      email: "alex@stripe.com",
      employment: { domain: "stripe.com", name: "Stripe", title: "CEO" },
      twitter: { handle: "alex" },
      linkedin: { handle: "alex" },
      github: { handle: "alex" },
    };
    installFetch(mockResponse(mockPerson));

    const [out] = await runNode({
      resource: "person",
      operation: "enrich",
      email: "alex@stripe.com",
    });

    expect(out).toHaveLength(1);
    const item = out[0].json as Record<string, unknown>;
    expect(item.name).toBeTruthy();
    expect(item.email).toBe("alex@stripe.com");
    expect(item.employment).toBeTruthy();
    expect(calls[0].url).toContain("api.clearbit.com/v2/person");
    expect(calls[0].url).toContain("email=alex%40stripe.com");
  });

  it("continueOnFail: first item errors, second succeeds", async () => {
    const mockPerson = {
      name: { fullName: "Alex Stripe" },
      email: "alex@stripe.com",
      employment: { domain: "stripe.com", name: "Stripe" },
    };
    installFetch([mockResponse({ error: "not found" }, { status: 404 }), mockResponse(mockPerson)]);

    const [out] = await runNode(
      {
        resource: "person",
        operation: "enrich",
        email: "={{ $json.email }}",
      },
      [{ email: "nonexistent@invalid.nonexistent" }, { email: "alex@stripe.com" }],
      { continueOnFail: true },
    );

    expect(out).toHaveLength(2);
    expect((out[0].json as Record<string, unknown>).error).toBeTruthy();
    expect((out[1].json as Record<string, unknown>).email).toBe("alex@stripe.com");
  });
});
