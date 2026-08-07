import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.netlifyTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

function mockResponse(body: unknown, status = 200, linkHeader?: string) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const headers = new Map<string, string>();
  headers.set("content-type", "application/json");
  if (linkHeader) headers.set("link", linkHeader);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return headers.get(name.toLowerCase()) ?? null; },
      entries() { return headers.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>>) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
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
      return queue.shift() ?? mockResponse({});
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

const CREDS = { netlifyApi: { accessToken: "test-token" } };

beforeEach(() => {
  installFetch([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe(TYPE, () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Netlify Tool");
  });

  describe("site / getAll", () => {
    it("returns sites with limit", async () => {
      const sites = [{ id: "3970e0fe-8564-4903-9a55-c5f8de49fb8b", name: "synergy", url: "http://www.example.com", created_at: "2024-01-15T10:30:00.000Z" }];
      installFetch(mockResponse(sites));
      const out = await run({ resource: "site", operation: "getAll", returnAll: false, limit: 10 }, [{}]);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("page=1&per_page=10");
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual(sites[0]);
    });

    it("paginates with returnAll across multiple pages (Link header)", async () => {
      const page1 = [{ id: "1", name: "site-a" }];
      const page2 = [{ id: "2", name: "site-b" }];
      installFetch([
        mockResponse(page1, 200, '</api/v1/sites?page=2&per_page=100>; rel="next"'),
        mockResponse(page2),
      ]);
      const out = await run({ resource: "site", operation: "getAll", returnAll: true }, [{}]);
      expect(calls).toHaveLength(2);
      expect(calls[0].url).toContain("page=1&per_page=100");
      expect(calls[1].url).toContain("page=2&per_page=100");
      expect(out[0]).toHaveLength(2);
    });
  });

  describe("site / get", () => {
    it("returns a site by domain", async () => {
      const site = { id: "3970e0fe-8564-4903-9a55-c5f8de49fb8b", name: "synergy", custom_domain: "www.example.com", url: "http://www.example.com", created_at: "2024-01-15T10:30:00.000Z" };
      installFetch(mockResponse(site));
      const out = await run({ resource: "site", operation: "get", siteId: "www.example.com" }, [{}]);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/sites/www.example.com");
      expect(out[0][0].json).toEqual(site);
    });
  });

  describe("site / delete", () => {
    it("deletes a site and returns success", async () => {
      installFetch(mockResponse({}));
      const out = await run({ resource: "site", operation: "delete", siteId: "test-site" }, [{}]);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/sites/test-site");
      expect(out[0][0].json).toEqual({ success: true });
    });
  });

  describe("deploy / get", () => {
    it("resolves expression-based params and returns a deploy", async () => {
      const deploy = { id: "52465f435803544542000001", site_id: "3970e0fe-8564-4903-9a55-c5f8de49fb8b", name: "synergy", state: "ready", created_at: "2024-01-15T10:30:00.000Z" };
      installFetch(mockResponse(deploy));
      const out = await run(
        { resource: "deploy", operation: "get", siteId: "={{$json.siteName}}", deployId: "={{$json.deployUuid}}" },
        [{ json: { siteName: "my-site", deployUuid: "52465f435803544542000001" } }],
      );
      expect(calls[0].url).toContain("/sites/my-site/deploys/52465f435803544542000001");
      expect(out[0][0].json).toEqual(deploy);
    });
  });

  describe("deploy / cancel", () => {
    it("calls POST /deploys/{deployId}/cancel without site path", async () => {
      const cancelled = { id: "52465f435803544542000001", state: "cancelled" };
      installFetch(mockResponse(cancelled));
      const out = await run({ resource: "deploy", operation: "cancel", deployId: "52465f435803544542000001" }, [{}]);
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://api.netlify.com/api/v1/deploys/52465f435803544542000001/cancel");
      expect(out[0][0].json).toEqual(cancelled);
    });

    it("does not require siteId", async () => {
      const cancelled = { id: "d1", state: "cancelled" };
      installFetch(mockResponse(cancelled));
      const out = await run({ resource: "deploy", operation: "cancel", deployId: "d1" }, [{}]);
      expect(out[0][0].json).toEqual(cancelled);
    });
  });

  describe("deploy / getAll", () => {
    it("returns deploys for a site", async () => {
      const deploys = [{ id: "d1", site_id: "s1", state: "ready" }];
      installFetch(mockResponse(deploys));
      const out = await run({ resource: "deploy", operation: "getAll", siteId: "my-site", returnAll: false, limit: 20 }, [{}]);
      expect(calls[0].url).toContain("/sites/my-site/deploys");
      expect(calls[0].url).toContain("page=1&per_page=20");
      expect(out[0][0].json).toEqual(deploys[0]);
    });
  });

  describe("deploy / create", () => {
    it("creates a deploy with additional fields", async () => {
      const deploy = { id: "d1", state: "preparing" };
      installFetch(mockResponse(deploy));
      const out = await run(
        { resource: "deploy", operation: "create", siteId: "s1", additionalFields: { branch: "main", title: "My deploy" } },
        [{}],
      );
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/sites/s1/deploys");
      expect(JSON.parse(calls[0].body!)).toEqual({ branch: "main", title: "My deploy" });
      expect(out[0][0].json).toEqual(deploy);
    });
  });

  describe("error handling", () => {
    it("throws on missing credential", async () => {
      await expect(run({ resource: "site", operation: "getAll" }, [{}], { credentials: {} })).rejects.toThrow(/netlifyApi credential/);
    });

    it("throws on API error", async () => {
      installFetch(mockResponse({ message: "Unauthorized" }, 401));
      await expect(run({ resource: "site", operation: "getAll" }, [{}])).rejects.toThrow(/Netlify API: Unauthorized/);
    });

    it("continueOnFail emits no item on error", async () => {
      installFetch(mockResponse({ message: "Not found" }, 404));
      const out = await run({ resource: "site", operation: "get", siteId: "missing" }, [{}], { continueOnFail: true });
      expect(out[0]).toHaveLength(0);
    });
  });
});
