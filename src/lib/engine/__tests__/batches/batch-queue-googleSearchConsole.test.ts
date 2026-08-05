import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleSearchConsole";
const CREDS = { googleOAuth2Api: { accessToken: "tok_gsc" } };

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
    credentials: { googleOAuth2Api: { name: "googleOAuth2Api" } },
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

describe("googleSearchConsole executor", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeDefined();
  });

  describe("searchAnalytics query", () => {
    const SA_BODY = {
      responseAggregationType: "auto",
      rows: [
        { keys: ["united-states", "desktop"], clicks: 1234, impressions: 56789, ctr: 2.17, position: 4.5 },
        { keys: ["united-states", "mobile"], clicks: 567, impressions: 12345, ctr: 4.59, position: 6.2 },
      ],
      totalRows: 2,
    };

    it("returns rows with keys matching requested dimensions", async () => {
      installFetch(() => mockResponse(SA_BODY));
      const out = await run({
        resource: "searchAnalytics",
        operation: "query",
        siteUrl: "sc_domain:example.com",
        startDate: "7daysAgo",
        endDate: "today",
        dimensions: "country,device",
        searchType: "web",
        rowLimit: 10,
      });
      const item = out[0][0];
      expect(item.json.rows).toBeInstanceOf(Array);
      expect(item.json.rows).toHaveLength(2);
      expect(item.json.rows[0].keys).toEqual(["united-states", "desktop"]);
      expect(item.json.rows[0].clicks).toBe(1234);
      expect(item.json.rows[0].impressions).toBe(56789);
      expect(item.json.rows[0].ctr).toBe(2.17);
      expect(item.json.rows[0].position).toBe(4.5);
      expect(item.json.totalRows).toBe(2);
      expect(lastUrl).toContain("/searchAnalytics/query");
      expect(lastMethod).toBe("POST");
    });

    it("sends dates and dimensions in the request body", async () => {
      installFetch(() => mockResponse(SA_BODY));
      await run({
        resource: "searchAnalytics",
        operation: "query",
        siteUrl: "sc_domain:example.com",
        startDate: "2024-01-01",
        endDate: "2024-01-31",
        dimensions: "country,device,page",
        searchType: "web",
        rowLimit: 100,
      });
      const body = lastBody as Record<string, unknown>;
      expect(body.startDate).toBe("2024-01-01");
      expect(body.endDate).toBe("2024-01-31");
      expect(body.dimensions).toEqual(["country", "device", "page"]);
      expect(body.rowLimit).toBe(100);
    });
  });

  describe("sitemaps list", () => {
    const SITEMAP_BODY = {
      sitemap: [
        { path: "https://www.example.com/sitemap.xml", type: "xml", lastSubmitted: "2024-01-15T10:00:00Z" },
      ],
    };

    it("returns sitemap array", async () => {
      installFetch(() => mockResponse(SITEMAP_BODY));
      const out = await run({
        resource: "sitemaps",
        operation: "list",
        siteUrl: "sc_domain:example.com",
      });
      const item = out[0][0];
      expect(item.json.sitemap).toBeInstanceOf(Array);
      if (Array.isArray(item.json.sitemap)) {
        expect(item.json.sitemap[0].path).toBe("https://www.example.com/sitemap.xml");
        expect(item.json.sitemap[0].type).toBe("xml");
      }
      expect(lastUrl).toContain("/sitemaps");
      expect(lastMethod).toBe("GET");
    });
  });

  describe("sites list", () => {
    const SITES_BODY = {
      siteEntry: [
        { siteUrl: "sc_domain:example.com", permissionLevel: "siteFullUser" },
      ],
    };

    it("returns siteEntry array", async () => {
      installFetch(() => mockResponse(SITES_BODY));
      const out = await run({
        resource: "sites",
        operation: "list",
      });
      const item = out[0][0];
      expect(item.json.siteEntry).toBeInstanceOf(Array);
      if (Array.isArray(item.json.siteEntry)) {
        expect(item.json.siteEntry[0].siteUrl).toBe("sc_domain:example.com");
        expect(item.json.siteEntry[0].permissionLevel).toBe("siteFullUser");
      }
      expect(lastUrl).toBe("https://www.googleapis.com/webmasters/v3/sites");
      expect(lastMethod).toBe("GET");
    });
  });

  describe("URL inspection", () => {
    const INSPECT_BODY = {
      inspectionResult: {
        inspectionUrl: "https://www.example.com/",
        indexStatusResult: {
          verdict: "PASS",
          coverageState: "Submitted and indexed",
          crawling: "Allowed",
          indexing: "Allowed",
          robotsTxtState: "Allowed",
          pageFetchState: "Successful",
          googleCanonical: "https://www.example.com/",
          userCanonical: "https://www.example.com/",
        },
      },
    };

    it("returns inspection result", async () => {
      installFetch(() => mockResponse(INSPECT_BODY));
      const out = await run({
        resource: "urlInspection",
        operation: "inspect",
        siteUrl: "sc_domain:example.com",
        inspectionUrl: "https://www.example.com/",
        languageCode: "en-US",
      });
      const item = out[0][0];
      expect(item.json.inspectionResult).toBeInstanceOf(Object);
      const result = item.json.inspectionResult as Record<string, unknown>;
      expect(result.inspectionUrl).toBe("https://www.example.com/");
      const status = result.indexStatusResult as Record<string, unknown>;
      expect(["PASS", "PARTIAL", "FAIL", "NEUTRAL"]).toContain(status.verdict);
      expect(lastUrl).toContain("searchconsole.googleapis.com");
      expect(lastMethod).toBe("POST");
    });
  });

  describe("error handling", () => {
    it("throws on missing credential", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "sites", operation: "list" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "wf", name: "T", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => null,
      });
      await expect(getExecutor(TYPE)!(ctx, node)).rejects.toThrow(/credential/i);
    });

    it("throws on invalid siteUrl (404) with continueOnFail off", async () => {
      installFetch(() => mockResponse({ error: { message: "Site not found" } }, 404));
      await expect(
        run({
          resource: "sites",
          operation: "get",
          siteUrl: "https://nonexistent.example/",
        }),
      ).rejects.toThrow(/Site not found/i);
    });

    it("continueOnFail returns error item instead of throwing", async () => {
      installFetch(() => mockResponse({ error: { message: "Not found" } }, 404));
      const [output] = await run(
        { resource: "sites", operation: "get", siteUrl: "https://nonexistent.example/" },
        [{}],
        { continueOnFail: true },
      );
      expect(output[0].json.error).toMatch(/Not found/i);
    });
  });
});
