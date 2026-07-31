import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.notion";

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
    typeVersion: 2.2,
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

describe("batch-queue notion — n8n-nodes-base.notion", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Notion");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.notion")).toBe(canonical);
  });

  it("databasePage.create — with title and properties", async () => {
    installFetch(
      mockResponse({
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
      databaseId: { mode: "id", value: "ab1545b247fb49fa92d6f4b49f4d8116" },
      title: "New Task",
      simple: true,
      propertiesUi: {
        propertyValues: [
          { key: "Status|select", type: "select", selectValue: "In Progress" },
          { key: "Due Date|date", type: "date", date: "2026-08-15" },
        ],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.notion.com/v1/pages");
    expect(calls[0].headers.Authorization).toBe("Bearer secret_test_token");
    expect(calls[0].headers["Notion-Version"]).toBe("2022-06-28");

    const body = JSON.parse(calls[0].body!);
    expect(body.parent).toEqual({
      database_id: "ab1545b2-47fb-49fa-92d6-f4b49f4d8116",
    });
    expect(body.properties.Status).toEqual({ select: { name: "In Progress" } });
    expect(body.properties["Due Date"]).toEqual({ date: { start: "2026-08-15" } });
    expect(body.properties.Name).toEqual({
      title: [{ type: "text", text: { content: "New Task" } }],
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      id: "abc123",
      name: "New Task",
      url: "https://www.notion.so/New-Task-abc123",
    });
  });

  it("page.create — with blocks and icon", async () => {
    installFetch(
      mockResponse({
        id: "page-id-1",
        url: "https://www.notion.so/My-New-Page-page-id",
        properties: {
          title: {
            type: "title",
            title: [{ plain_text: "My New Page", text: { content: "My New Page" } }],
          },
        },
      }),
    );

    const out = await run({
      resource: "page",
      operation: "create",
      pageId: { mode: "id", value: "b4eeb113e118403aa450af65ac25f0b9" },
      title: "My New Page",
      simple: true,
      options: {
        iconType: "emoji",
        icon: "🚀",
      },
      children: {
        entryValues: [
          {
            type: "heading_1",
            heading_1: { richText: false, textContent: "Welcome" },
          },
          {
            type: "paragraph",
            paragraph: { richText: false, textContent: "This is a paragraph." },
          },
        ],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.notion.com/v1/pages");
    const body = JSON.parse(calls[0].body!);
    expect(body.parent).toEqual({
      page_id: "b4eeb113-e118-403a-a450-af65ac25f0b9",
    });
    expect(body.icon).toEqual({ type: "emoji", emoji: "🚀" });
    expect(body.children).toHaveLength(2);
    expect(body.children[0].type).toBe("heading_1");
    expect(body.children[0].heading_1.rich_text[0].text.content).toBe("Welcome");
    expect(body.children[1].type).toBe("paragraph");
    expect(out[0][0].json).toEqual({
      id: "page-id-1",
      name: "My New Page",
      url: "https://www.notion.so/My-New-Page-page-id",
    });
  });

  it("block.getAll — simplified child blocks with limit", async () => {
    installFetch(
      mockResponse({
        results: [
          {
            id: "block-id-1",
            type: "paragraph",
            paragraph: {
              rich_text: [{ plain_text: "First block text", text: { content: "First block text" } }],
            },
          },
        ],
        has_more: false,
      }),
    );

    const out = await run({
      resource: "block",
      operation: "getAll",
      blockId: { mode: "id", value: "c44444444444bbbbb4d32fdfdd84e000" },
      returnAll: false,
      limit: 50,
      fetchNestedBlocks: false,
      simplifyOutput: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/v1/blocks/");
    expect(calls[0].url).toContain("/children");
    expect(calls[0].url).toContain("page_size=50");
    expect(out[0][0].json).toEqual({
      id: "block-id-1",
      type: "paragraph",
      text: "First block text",
    });
  });

  it("user.getAll — return all users simplified", async () => {
    installFetch(
      mockResponse({
        results: [
          {
            id: "user-uuid-1",
            name: "Alice",
            object: "user",
            type: "person",
            person: { email: "alice@example.com" },
          },
        ],
        has_more: false,
      }),
    );

    const out = await run({
      resource: "user",
      operation: "getAll",
      returnAll: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("https://api.notion.com/v1/users");
    expect(out[0][0].json).toEqual({
      id: "user-uuid-1",
      name: "Alice",
      object: "user",
      person: { email: "alice@example.com" },
      type: "person",
    });
  });

  it("database.search — with sort and simple output", async () => {
    installFetch(
      mockResponse({
        results: [
          {
            id: "db-id-1",
            object: "database",
            url: "https://www.notion.so/db-id",
            title: [{ plain_text: "Project Database", text: { content: "Project Database" } }],
          },
        ],
        has_more: false,
      }),
    );

    const out = await run({
      resource: "database",
      operation: "search",
      text: "Project",
      returnAll: false,
      limit: 20,
      simple: true,
      options: {
        sort: {
          sortValue: { direction: "descending", timestamp: "last_edited_time" },
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.notion.com/v1/search");
    const body = JSON.parse(calls[0].body!);
    expect(body.query).toBe("Project");
    expect(body.filter).toEqual({ property: "object", value: "database" });
    expect(body.sort).toEqual({ direction: "descending", timestamp: "last_edited_time" });
    expect(body.page_size).toBe(20);
    expect(out[0][0].json).toEqual({
      id: "db-id-1",
      name: "Project Database",
      url: "https://www.notion.so/db-id",
    });
  });

  it("fails when notionApi credential is missing", async () => {
    await expect(
      run(
        { resource: "user", operation: "getAll", returnAll: true },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/notionApi credential is not configured/);
  });

  it("continueOnFail yields error item", async () => {
    installFetch(mockResponse({ message: "Validation error" }, { status: 400 }));
    const out = await run(
      {
        resource: "page",
        operation: "get",
        pageId: { mode: "id", value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        simple: true,
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Validation error/);
  });
});
