import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.notionTool";

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

const CREDS = { notionApi: { apiKey: "secret_test_token" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue notionTool — n8n-nodes-base.notionTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Notion Tool");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.notionTool")).toBe(canonical);
  });

  it("databasePage.create — creates a page in a database", async () => {
    installFetch(
      mockResponse({
        object: "page",
        id: "abc123",
        url: "https://www.notion.so/New-Task-abc123",
        properties: {
          Name: {
            type: "title",
            title: [{ plain_text: "New Task", text: { content: "New Task" } }],
          },
        },
      }),
    );

    const out = await run({
      resource: "databasePage",
      operation: "create",
      databaseId: "ab1545b247fb49fa92d6f4b49f4d8116",
      title: "New Task",
      properties: {
        values: [{ name: "Status", value: "To Do" }],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.notion.com/v1/pages");
    expect(calls[0].headers.Authorization).toBe("Bearer secret_test_token");
    expect(calls[0].headers["Notion-Version"]).toBe("2022-06-28");

    const body = JSON.parse(calls[0].body!);
    expect(body.parent).toEqual({ database_id: "ab1545b2-47fb-49fa-92d6-f4b49f4d8116" });
    expect(body.properties.Name).toEqual({ title: [{ type: "text", text: { content: "New Task" } }] });
    expect(body.properties.Status).toBe("To Do");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.object).toBe("page");
    expect(out[0][0].json.id).toBe("abc123");
  });

  it("databasePage.getMany — with filter", async () => {
    installFetch(
      mockResponse({
        results: [
          { object: "page", id: "page-1", url: "https://..." },
          { object: "page", id: "page-2", url: "https://..." },
        ],
        has_more: false,
      }),
    );

    const out = await run({
      resource: "databasePage",
      operation: "getMany",
      databaseId: "abc123",
      filter: {
        property: "Status",
        select: { equals: "Done" },
      },
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.notion.com/v1/databases/abc123/query");

    const body = JSON.parse(calls[0].body!);
    expect(body.filter).toEqual({ property: "Status", select: { equals: "Done" } });
    expect(body.page_size).toBe(10);

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.object).toBe("page");
    expect(out[0][1].json.object).toBe("page");
  });

  it("page.search — searches pages", async () => {
    installFetch(
      mockResponse({
        results: [
          { object: "page", id: "search-1", url: "https://..." },
        ],
        has_more: false,
      }),
    );

    const out = await run({
      resource: "page",
      operation: "search",
      query: "meeting notes",
      limit: 5,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.notion.com/v1/search");

    const body = JSON.parse(calls[0].body!);
    expect(body.query).toBe("meeting notes");
    expect(body.page_size).toBe(5);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.object).toBe("page");
  });

  it("block.appendAfter — appends block content", async () => {
    installFetch(
      mockResponse({
        object: "block",
        id: "block123",
        type: "paragraph",
        paragraph: { rich_text: [{ plain_text: "Appended text" }] },
      }),
    );

    const out = await run({
      resource: "block",
      operation: "appendAfter",
      blockId: "block123",
      properties: {
        values: [
          { name: "type", value: "paragraph" },
          { name: "value", value: "Appended text" },
        ],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("/v1/blocks/block123/children");

    const body = JSON.parse(calls[0].body!);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].type).toBe("paragraph");
    expect(body.children[0].paragraph.rich_text[0].text.content).toBe("Appended text");

    expect(out[0][0].json.object).toBe("block");
  });

  it("user.getMany — lists users", async () => {
    installFetch(
      mockResponse({
        results: [
          { object: "user", id: "user-1", name: "Alice", type: "person" },
        ],
        has_more: false,
      }),
    );

    const out = await run({
      resource: "user",
      operation: "getMany",
      limit: 20,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/v1/users");
    expect(calls[0].url).toContain("page_size=20");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.object).toBe("user");
    expect(out[0][0].json.id).toBe("user-1");
    expect(out[0][0].json.name).toBe("Alice");
  });

  it("dataSource.search — searches by query", async () => {
    installFetch(
      mockResponse({
        results: [
          { object: "page", id: "ds-page-1" },
          { object: "database", id: "ds-db-1" },
        ],
        has_more: false,
      }),
    );

    const out = await run({
      resource: "dataSource",
      operation: "search",
      query: "project",
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.notion.com/v1/search");

    const body = JSON.parse(calls[0].body!);
    expect(body.query).toBe("project");
    expect(body.page_size).toBe(10);

    expect(out[0]).toHaveLength(2);
  });

  it("fails when credential is missing", async () => {
    await expect(
      run(
        { resource: "user", operation: "getMany", limit: 20 },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/notionApi credential is not configured/);
  });

  it("continueOnFail yields error item", async () => {
    installFetch(mockResponse({ message: "Not found" }, { status: 404 }));
    const out = await run(
      {
        resource: "page",
        operation: "get",
        pageId: "nonexistent",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Notion/);
  });

  it("resolves expression parameters from input items", async () => {
    installFetch(
      mockResponse({
        object: "page",
        id: "resolved-page",
        properties: { title: [{ plain_text: "Dynamic" }] },
      }),
    );

    const out = await run(
      {
        resource: "databasePage",
        operation: "create",
        databaseId: "={{ $json.dbId }}",
        title: "={{ $json.title }}",
        properties: {
          values: [
            { name: "Status", value: "={{ $json.status }}" },
          ],
        },
      },
      [{ json: { dbId: "db123", title: "Dynamic", status: "Active" } }],
    );

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.parent.database_id).toBe("db123");
    expect(body.properties.Name.title[0].text.content).toBe("Dynamic");
    expect(body.properties.Status).toBe("Active");
  });
});
