import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftSharePoint";

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

describe("batch-queue microsoftSharePoint — n8n-nodes-base.microsoftSharePoint", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft SharePoint");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.microsoftSharePoint")).toBe(canonical);
  });

  describe("list getAll", () => {
    it("lists all lists for a site", async () => {
      const lists = [
        { id: "LIST1", displayName: "My List", description: "", name: "MyList", createdDateTime: "2024-01-01T00:00:00Z", lastModifiedDateTime: "2024-06-01T00:00:00Z", webUrl: "https://tenant123.sharepoint.com/sites/my-site/Lists/MyList" },
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

  describe("list get", () => {
    it("gets a single list", async () => {
      const listMeta = { id: "LIST1", displayName: "My List", description: "", name: "MyList", createdDateTime: "2024-01-01T00:00:00Z", lastModifiedDateTime: "2024-06-01T00:00:00Z", webUrl: "https://tenant123.sharepoint.com/sites/my-site/Lists/MyList" };
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id": mockResponse(listMeta),
      });
      const out = await run({
        resource: "list",
        operation: "get",
        site: "my-site-id",
        list: "my-list-id",
      });

      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id");
      expect(out[0][0].json).toMatchObject({ id: "LIST1", displayName: "My List" });
    });
  });

  describe("item create", () => {
    it("creates a list item", async () => {
      const created = { id: "5", fields: { Title: "New Task", ID: 5, ContentType: "Item" }, webUrl: "https://tenant123.sharepoint.com/sites/my-site/Lists/MyList/5_.000" };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items": mockResponse(created),
      });
      const out = await run({
        resource: "item",
        operation: "create",
        site: "my-site-id",
        list: "my-list-id",
        columns: {
          fields: {
            fieldsJson: JSON.stringify({ Title: "New Task", Status: "Not Started" }),
          },
        },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items");
      expect(JSON.parse(calls[0].body!)).toEqual({ fields: { Title: "New Task", Status: "Not Started" } });
      expect(out[0][0].json).toMatchObject({ id: "5", fields: expect.objectContaining({ Title: "New Task" }) });
    });
  });

  describe("item delete", () => {
    it("passes through input item on delete", async () => {
      installFetch({
        "DELETE https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items/5": mockResponse(null, { status: 204 }),
      });
      const out = await run({
        resource: "item",
        operation: "delete",
        site: "{{ $json.siteId }}",
        list: "my-list-id",
        item: "{{ $json.itemId }}",
      }, [{ json: { siteId: "my-site-id", itemId: "5" } }]);

      expect(calls[0].method).toBe("DELETE");
      expect(out[0][0].json).toMatchObject({ siteId: "my-site-id", itemId: "5" });
    });
  });

  describe("item get", () => {
    it("gets a single item", async () => {
      const item = { id: "5", fields: { Title: "Task 1" }, webUrl: "https://sharepoint.com/item" };
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items/5": mockResponse(item),
      });
      const out = await run({
        resource: "item",
        operation: "get",
        site: "my-site-id",
        list: "my-list-id",
        item: "5",
      });

      expect(out[0][0].json).toMatchObject({ id: "5", fields: { Title: "Task 1" } });
    });
  });

  describe("file download", () => {
    it("downloads a file and returns metadata + binary data", async () => {
      const metadata = { id: "FILE1", name: "report.pdf", size: 1024, file: { mimeType: "application/pdf" } };
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/drive/items/FILE1": mockResponse(metadata),
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/drive/items/FILE1/content": mockResponse("raw content", { contentType: "application/pdf" }),
      });
      const out = await run({
        resource: "file",
        operation: "download",
        site: "my-site-id",
        file: "FILE1",
        dataPropertyName: "downloadedFile",
      });

      expect(calls).toHaveLength(2);
      expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/sites/my-site-id/drive/items/FILE1");
      expect(calls[1].url).toBe("https://graph.microsoft.com/v1.0/sites/my-site-id/drive/items/FILE1/content");
      expect(out[0][0].json).toMatchObject({}); // input item passthrough
      expect(out[0][0].binary).toBeDefined();
      expect(out[0][0].binary!["downloadedFile"]).toBeDefined();
    });
  });

  describe("file upload", () => {
    it("uploads a file with binary data", async () => {
      const uploaded = { id: "FILE1", name: "hello.txt", size: 11 };
      installFetch({
        "PUT https://graph.microsoft.com/v1.0/sites/my-site-id/drive/items/FILE1/content": mockResponse(uploaded),
      });
      const out = await run({
        resource: "file",
        operation: "upload",
        site: "my-site-id",
        file: "FILE1",
        binaryPropertyName: "file",
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
      expect(out[0][0].json).toMatchObject({ id: "FILE1", name: "hello.txt" });
    });
  });

  describe("item getAll with filter", () => {
    it("returns filtered items with OData filter", async () => {
      const items = [
        { id: "1", fields: { Title: "item1" }, webUrl: "https://sharepoint.com/item1" },
        { id: "2", fields: { Title: "item2" }, webUrl: "https://sharepoint.com/item2" },
      ];
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items?$filter=fields%2FTitle%20eq%20'item1'&$top=50": mockResponse({ value: items }),
      });
      const out = await run({
        resource: "item",
        operation: "getAll",
        site: "my-site-id",
        list: "my-list-id",
        returnAll: false,
        limit: 50,
        filter: "fields/Title eq 'item1'",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("$filter=fields%2FTitle%20eq%20'item1'");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: "1", fields: { Title: "item1" } });
    });
  });

  describe("item update", () => {
    it("updates an item via PATCH to item URL", async () => {
      const updated = { id: "5", fields: { Title: "Updated Task", ID: 5, ContentType: "Item" }, webUrl: "https://sharepoint.com/item/5" };
      installFetch({
        "PATCH https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items/5": mockResponse(updated),
      });
      const out = await run({
        resource: "item",
        operation: "update",
        site: "my-site-id",
        list: "my-list-id",
        item: "5",
        columns: {
          fields: {
            fieldsJson: JSON.stringify({ Title: "Updated Task" }),
          },
        },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PATCH");
      expect(calls[0].url).toContain("/items/5");
      expect(JSON.parse(calls[0].body!)).toEqual({ fields: { Title: "Updated Task" } });
      expect(out[0][0].json).toMatchObject({ id: "5", fields: { Title: "Updated Task" } });
    });
  });

  describe("item upsert", () => {
    it("creates a new item when no item id is provided", async () => {
      const created = { id: "10", fields: { Title: "New Item", ID: 10 }, webUrl: "https://sharepoint.com/item/10" };
      installFetch({
        "POST https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items": mockResponse(created),
      });
      const out = await run({
        resource: "item",
        operation: "upsert",
        site: "my-site-id",
        list: "my-list-id",
        columns: {
          value: { Title: "New Item", Status: "Active" },
        },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(JSON.parse(calls[0].body!)).toEqual({ fields: { Title: "New Item", Status: "Active" } });
      expect(out[0][0].json).toMatchObject({ id: "10" });
    });

    it("updates an existing item when item id is provided", async () => {
      const updated = { id: "5", fields: { Title: "Upserted", ID: 5 }, webUrl: "https://sharepoint.com/item/5" };
      installFetch({
        "PATCH https://graph.microsoft.com/v1.0/sites/my-site-id/lists/my-list-id/items/5": mockResponse(updated),
      });
      const out = await run({
        resource: "item",
        operation: "upsert",
        site: "my-site-id",
        list: "my-list-id",
        item: "5",
        columns: {
          value: { Title: "Upserted" },
        },
      });

      expect(calls[0].method).toBe("PATCH");
      expect(calls[0].url).toContain("/items/5");
      expect(out[0][0].json).toMatchObject({ id: "5", fields: { Title: "Upserted" } });
    });
  });

  describe("file update", () => {
    it("updates file metadata (rename + metadata)", async () => {
      const patched = { id: "FILE1", name: "renamed.pdf", file: { mimeType: "application/pdf" } };
      installFetch({
        "PATCH https://graph.microsoft.com/v1.0/sites/my-site-id/drive/items/FILE1": mockResponse(patched),
      });
      const out = await run({
        resource: "file",
        operation: "update",
        site: "my-site-id",
        file: "FILE1",
        fileName: "renamed.pdf",
        changeFileContent: false,
        additionalFields: {
          metadata: JSON.stringify({ author: "test" }),
        },
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PATCH");
      const body = JSON.parse(calls[0].body!);
      expect(body.name).toBe("renamed.pdf");
      expect(body.file.metadata).toEqual({ author: "test" });
      expect(out[0][0].json).toMatchObject({ id: "FILE1", name: "renamed.pdf" });
    });

    it("replaces file content when changeFileContent is true", async () => {
      installFetch({
        "PUT https://graph.microsoft.com/v1.0/sites/my-site-id/drive/items/FILE1/content": mockResponse({ id: "FILE1", name: "file.txt" }),
      });
      const out = await run({
        resource: "file",
        operation: "update",
        site: "my-site-id",
        file: "FILE1",
        changeFileContent: true,
        fileContents: "fileData",
      }, [{
        json: {},
        binary: {
          fileData: {
            mimeType: "text/plain",
            data: "dXBkYXRlZCBjb250ZW50",
          },
        },
      }]);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("PUT");
      expect(calls[0].url).toContain("/content");
    });
  });

  describe("authentication", () => {
    it("sends Bearer token from microsoftSharePointOAuth2Api credential", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/sites/my-site-id/lists?$top=50": mockResponse({ value: [] }),
      });
      await run(
        { resource: "list", operation: "getAll", site: "my-site-id", returnAll: false, limit: 50 },
        [{}],
        { credentials: { microsoftSharePointOAuth2Api: { accessToken: "my-token", subdomain: "tenant123" } } },
      );
      expect(calls[0].headers["Authorization"]).toBe("Bearer my-token");
    });

    it("throws when no credential is configured", async () => {
      await expect(
        run(
          { resource: "list", operation: "getAll", site: "my-site-id" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow(/Microsoft SharePoint credential is required/);
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
      expect(String(out[0][0].json.error)).toContain("notFound");
    });
  });

  it("processes multiple input items", async () => {
    const listMeta = { id: "LIST1", displayName: "List A" };
    installFetch({
      "GET https://graph.microsoft.com/v1.0/sites/site1/lists?$top=50": mockResponse({ value: [listMeta] }),
      "GET https://graph.microsoft.com/v1.0/sites/site2/lists?$top=50": mockResponse({ value: [listMeta] }),
    });
    const out = await run(
      { resource: "list", operation: "getAll", site: "={{ $json.site }}", returnAll: false, limit: 50 },
      [{ site: "site1" }, { site: "site2" }],
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});