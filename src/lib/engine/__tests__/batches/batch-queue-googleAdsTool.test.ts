import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleAdsTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

function mockFetch(responseBody: unknown, status = 200) {
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
      const text = JSON.stringify(responseBody);
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Map(),
        async json() {
          return JSON.parse(text);
        },
        async text() {
          return text;
        },
      };
    }),
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
      staticData: null,
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name: string) => {
      if (name === "googleAdsOAuth2Api") {
        return (
          credentials?.googleAdsOAuth2Api ?? {
            accessToken: "test-access-token",
          }
        );
      }
      return null;
    },
  });
}

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

function makeGoogleAdsNode(overrides: Partial<INode["parameters"]> = {}): INode {
  return makeNode({
    type: TYPE,
    parameters: {
      resource: "campaign",
      operation: "getAll",
      managerCustomerId: "1234567890",
      clientCustomerId: "",
      returnAll: false,
      limit: 10,
      ...overrides,
    },
  });
}

describe("googleAdsTool registration", () => {
  it("registers executor in runtime", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("registers description in registry", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
  });
});

describe("googleAdsTool campaign getAll", () => {
  beforeEach(() => {
    mockFetch({
      results: [
        {
          campaign: {
            id: "1111111111",
            name: "Campaign One",
            status: "ENABLED",
            startDate: "2024-01-01",
            endDate: "2024-12-31",
            servingStatus: "SERVING",
            advertisingChannelType: "SEARCH",
            advertisingChannelSubType: "SEARCH_STANDARD",
          },
        },
        {
          campaign: {
            id: "2222222222",
            name: "Campaign Two",
            status: "PAUSED",
            startDate: "2024-03-01",
            endDate: "2024-06-30",
            servingStatus: "SERVING",
            advertisingChannelType: "DISPLAY",
            advertisingChannelSubType: "DISPLAY_STANDARD",
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns campaigns array", async () => {
    const node = makeGoogleAdsNode();
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = getExecutor(TYPE)!;
    const result = await executor(ctx, node);
    expect(result).toHaveLength(1);
    const output = result[0];
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(1);
    const campaigns = (output[0].json as Record<string, unknown>).campaigns as Array<Record<string, unknown>>;
    expect(campaigns).toHaveLength(2);
    expect(campaigns[0].id).toBe("1111111111");
    expect(campaigns[0].name).toBe("Campaign One");
    expect(campaigns[0].status).toBe("ENABLED");
    expect(campaigns[1].id).toBe("2222222222");
  });

  it("respects limit when returnAll is false", async () => {
    const node = makeGoogleAdsNode({ limit: 1, returnAll: false });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = getExecutor(TYPE)!;
    const result = await executor(ctx, node);
    const output = result[0];
    const campaigns = (output[0].json as Record<string, unknown>).campaigns as Array<Record<string, unknown>>;
    expect(campaigns).toHaveLength(1);
  });

  it("returns empty campaigns array when API returns no results", async () => {
    mockFetch({ results: [] });
    const node = makeGoogleAdsNode();
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = getExecutor(TYPE)!;
    const result = await executor(ctx, node);
    const output = result[0];
    const campaigns = (output[0].json as Record<string, unknown>).campaigns as Array<Record<string, unknown>>;
    expect(campaigns).toHaveLength(0);
  });
});

describe("googleAdsTool campaign get", () => {
  beforeEach(() => {
    mockFetch({
      results: [
        {
          campaign: {
            id: "1234567890",
            name: "My Campaign",
            status: "ENABLED",
            startDate: "2024-01-01",
            endDate: "2024-12-31",
            servingStatus: "SERVING",
            advertisingChannelType: "SEARCH",
            advertisingChannelSubType: "SEARCH_STANDARD",
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a campaign object", async () => {
    const node = makeGoogleAdsNode({
      operation: "get",
      campaignId: "1234567890",
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = getExecutor(TYPE)!;
    const result = await executor(ctx, node);
    expect(result).toHaveLength(1);
    const output = result[0];
    expect(output.length).toBe(1);
    const row = output[0].json as Record<string, unknown>;
    expect(row.campaign).toBeDefined();
    expect((row.campaign as Record<string, unknown>).id).toBe("1234567890");
    expect((row.campaign as Record<string, unknown>).name).toBe("My Campaign");
  });

  it("fails when campaignId is empty", async () => {
    const node = makeGoogleAdsNode({
      operation: "get",
      campaignId: "",
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node);
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow("campaign ID is required");
  });
});

describe("googleAdsTool error handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws on missing credential", async () => {
    const node = makeGoogleAdsNode();
    const items = toItems([{}]);
    const ctx = createExecutionContext({
      node,
      workflow: {
        id: "wf",
        name: "Test",
        active: false,
        nodes: [node],
        connections: {},
        settings: {},
        staticData: null,
      },
      getNodeInputItems: () => items,
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(
      "Google Ads: googleAdsOAuth2Api credential is not configured",
    );
  });

  it("handles API error with continueOnFail", async () => {
    mockFetch({ error: { message: "Invalid customer ID" } }, 400);
    const node = makeGoogleAdsNode({
      managerCustomerId: "invalid",
      clientCustomerId: "invalid",
    });
    const items = toItems([{}]);
    const ctx = makeCtx(items, node, true);
    const executor = getExecutor(TYPE)!;
    const result = await executor(ctx, node);
    const output = result[0];
    expect(output.length).toBe(1);
    expect((output[0].json as Record<string, unknown>).error).toBeDefined();
  });
});
