import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleAds";
const CREDS = { googleAdsOAuth2Api: { accessToken: "tok_ads", developerToken: "dev_tok_123" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return text ? JSON.parse(text) : {};
    },
    async text() {
      return text;
    },
  };
}

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
  lastMethod = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleAdsOAuth2Api: { name: "googleAdsOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleAds executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("get all campaigns", async () => {
    installFetch((url, method, body) => {
      const b = body as { query?: string } | undefined;
      if (method === "POST" && url.includes("/googleAds:search") && b?.query?.includes("FROM campaign")) {
        return mockResponse({
          results: [
            {
              campaign: { id: "1", name: "Campaign 1", status: "ENABLED" },
              metrics: { impressions: "1000" },
            },
            {
              campaign: { id: "2", name: "Campaign 2", status: "ENABLED" },
              metrics: { impressions: "500" },
            },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "campaign",
      operation: "getAll",
      clientCustomerId: "123-456-7890",
      managerCustomerId: "987-654-3210",
      additionalOptions: {
        dateRange: "LAST_30_DAYS",
        campaignStatus: "ENABLED",
      },
    });

    expect(out[0].length).toBe(2);
    expect(out[0][0].json).toMatchObject({
      campaign: { id: "1", name: "Campaign 1", status: "ENABLED" },
      metrics: { impressions: "1000" },
    });
    expect(out[0][1].json).toMatchObject({
      campaign: { id: "2", name: "Campaign 2", status: "ENABLED" },
      metrics: { impressions: "500" },
    });
    expect(lastMethod).toBe("POST");
    expect(lastBody).toMatchObject({
      query: expect.stringContaining("SELECT campaign.id"),
    });
    expect(lastUrl).toContain("/1234567890/googleAds:search");
  });

  it("get single campaign", async () => {
    installFetch((url, method, body) => {
      const b = body as { query?: string } | undefined;
      if (method === "POST" && url.includes("/googleAds:search") && b?.query?.includes("campaign.id = 123456789")) {
        return mockResponse({
          results: [
            {
              campaign: { id: "123456789", name: "Single Campaign", status: "ENABLED" },
              metrics: { impressions: "250", cost_micros: "1000000" },
            },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "campaign",
      operation: "get",
      clientCustomerId: "123-456-7890",
      managerCustomerId: "987-654-3210",
      campaignId: "123456789",
    });

    expect(out[0].length).toBe(1);
    expect(out[0][0].json).toMatchObject({
      campaign: { id: "123456789", name: "Single Campaign", status: "ENABLED" },
    });
    expect(lastBody).toMatchObject({
      query: expect.stringContaining("campaign.id = 123456789"),
    });
  });

  it("continueOnFail returns error json", async () => {
    installFetch(() => mockResponse({ error: { message: "Invalid customer ID" } }, 400));
    const out = await run(
      {
        resource: "campaign",
        operation: "getAll",
        clientCustomerId: "",
        managerCustomerId: "",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("required") });
  });
});