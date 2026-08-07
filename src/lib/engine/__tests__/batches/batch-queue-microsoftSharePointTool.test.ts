import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftSharePointTool";

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
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      forEach(cb: (v: string, k: string) => void) { map.forEach((v, k) => cb(v, k)); },
      entries() { return map.entries(); },
    },
    async json() { return text ? JSON.parse(text) : null; },
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
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse({}),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
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

const CREDS = { microsoftSharePointOAuth2Api: { accessToken: "mock-token-abc", subdomain: "tenant123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue microsoftSharePointTool — n8n-nodes-base.microsoftSharePointTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Microsoft SharePoint Tool");
    expect(getNodeType(TYPE).usableAsTool).toBe(true);
  });

  describe("list getAll", () => {
    it("lists all lists for a site", async () => {
      const lists = [
        { id: "LIST1", displayName: "My List", webUrl: "https://tenant123.sharepoint.com/sites/my-site/Lists/MyList" },
      ];
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/lists?$top=50": mockResponse({ value: lists }),
      });
      const out = await run({
        resource: "list",
        operation: "getAll",
        site: "my-site-id",
        returnAll: false,
        limit: 50,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/sites/my-site-id/lists?$top=50");
      expect(out[0][0].json).toMatchObject({ id: "LIST1", displayName: "My List" });
    });
  });

  describe("item create with columns", () => {
    it("creates a list item from defineBelow columns", async () => {
      const created = { id: "5", fields: { Title: "Test Item", Status: "Active" }, webUrl: "https://sharepoint.com/item/5" };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items": mockResponse(created),
      });
      const out = await run({
        resource: "item",
        operation: "create",
        site: "my-site-id",
        list: "my-list-id",
        columns: { mappingMode: "defineBelow", value: { Title: "Test Item", Status: "Active" } },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(JSON.parse(calls[0].body!)).toEqual({ fields: { Title: "Test Item", Status: "Active" } });
      expect(out[0][0].json).toMatchObject({ id: "5", fields: expect.objectContaining({ Title: "Test Item" }) });
    });
  });

  describe("item getAll with filter", () => {
    it("returns filtered items with OData filter and simplify", async () => {
      const items = [
        { id: "1", fields: { Title: "item1", Status: "Active" }, webUrl: "https://sharepoint.com/item1" },
        { id: "2", fields: { Title: "item2", Status: "Active" }, webUrl: "https://sharepoint.com/item2" },
      ];
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items?$filter=Status%20eq%20'Active'&$top=10&$expand=fields": mockResponse({ value: items }),
      });
      const out = await run({
        resource: "item",
        operation: "getAll",
        site: "my-site-id",
        list: "my-list-id",
        filter: "Status eq 'Active'",
        returnAll: false,
        limit: 10,
        simplify: true,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("$filter=Status%20eq%20'Active'");
      expect(calls[0].url).toContain("$expand=fields");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: "1", Title: "item1", Status: "Active" });
    });
  });

  describe("file download", () => {
    it("downloads a file with binary data and metadata", async () => {
      const metadata = { id: "FILE1", name: "report.pdf", size: 1024, file: { mimeType: "application/pdf" } };
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site/drive/items/file123": mockResponse(metadata),
        "GET https://graph.microsoft.com/v1.0/sites/my-site/drive/items/file123/content": mockResponse("raw content", { contentType: "application/pdf" }),
      });
      const out = await run({
        resource: "file",
        operation: "download",
        site: { mode: "id", value: "my-site" },
        folder: { mode: "id", value: "root" },
        file: { mode: "id", value: "file123" },
      }, [{ json: { siteId: "my-site", fileId: "file123" } }]);

      expect(calls).toHaveLength(2);
      expect(out[0][0].binary).toBeDefined();
      expect(out[0][0].binary!["data"]).toBeDefined();
      expect(out[0][0].binary!["data"].mimeType).toBe("application/pdf");
      expect(out[0][0].json).toMatchObject({ name: "report.pdf", size: 1024, id: "FILE1" });
    });
  });

  describe("file upload", () => {
    it("uploads a file with binary data", async () => {
      const uploaded = { id: "FILE1", name: "newfile.txt", size: 11 };
      installFetch({
        "PUT https://graph.microsoft.com/v1.0/sites/my-site/drive/items/root:/newfile.txt:/content": mockResponse(uploaded),
      });
      const out = await run({
        resource: "file",
        operation: "upload",
        site: "my-site",
        folder: { mode: "id", value: "root" },
        fileName: "newfile.txt",
        fileContents: "file",
      }, [{
        json: {},
        binary: {
          file: {
            mimeType: "text/plain",
            data: "aGVsbG8gd29ybGQ=",
          },
        },
      }]);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(out[0][0].json).toMatchObject({ name: "newfile.txt" });
    });
  });

  describe("authentication", () => {
    it("throws when no credential is configured", async () => {
      await expect(
        run(
          { resource: "list", operation: "getAll", site: "my-site-id" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow(/credential/);
    });
  });

  describe("continueOnFail", () => {
    it("returns error item when continueOnFail is enabled", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/lists?$top=50": mockResponse({ error: "notFound" }, { status: 404 }),
      });
      const out = await run({
        resource: "list",
        operation: "getAll",
        site: "my-site-id",
        returnAll: false,
        limit: 50,
      }, [{}], { continueOnFail: true });

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
    });
  });
});
