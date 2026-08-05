import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.zammad";

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
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({})) {
  nextResponse = response;
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
      return nextResponse;
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
    parameters,
    credentials: { zammadApi: { name: "zammadApi" } },
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = {
  zammadApi: {
    baseUrl: "https://zammad.example.com",
    authType: "tokenAuth",
    accessToken: "zammad-token-abc",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue zammad — n8n-nodes-base.zammad", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.zammad")).toBe(canonical);
  });

  it("sends tokenAuth header as Token token=<accessToken>", async () => {
    installFetch(mockResponse({ id: 1, name: "Test" }));
    await run({
      resource: "group",
      operation: "create",
      name: "Test Group",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe("Token token=zammad-token-abc");
  });

  it("sends basic auth header as Base64-encoded credentials", async () => {
    installFetch(mockResponse({ id: 1, name: "Test" }));
    const basicCreds = {
      zammadApi: {
        baseUrl: "https://zammad.example.com",
        authType: "basicAuth",
        username: "admin@example.com",
        password: "secret",
      },
    };
    await run(
      { resource: "group", operation: "create", name: "Test Group" },
      [{}],
      { credentials: basicCreds as Record<string, Record<string, unknown>> },
    );

    expect(calls).toHaveLength(1);
    const encoded = btoa("admin@example.com:secret");
    expect(calls[0].headers.Authorization).toBe(`Basic ${encoded}`);
  });

  it("creates and retrieves a group", async () => {
    installFetch(
      mockResponse({ id: 42, name: "Test Group", active: true, note: "Created via workflow" }),
    );
    const out = await run({
      resource: "group",
      operation: "create",
      name: "Test Group",
      active: true,
      note: "Created via workflow",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://zammad.example.com/api/v1/groups");
    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("Test Group");
    expect(body.active).toBe(true);
    expect(body.note).toBe("Created via workflow");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("Test Group");
    expect(out[0][0].json.active).toBe(true);
  });

  it("gets all tickets with limit sets per_page", async () => {
    installFetch(
      mockResponse([
        { id: 1, title: "Ticket 1" },
        { id: 2, title: "Ticket 2" },
      ]),
    );
    const out = await run({
      resource: "ticket",
      operation: "getAll",
      limit: 5,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://zammad.example.com/api/v1/tickets?per_page=5");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe(1);
    expect(out[0][1].json.title).toBe("Ticket 2");
  });

  it("creates user with address mapping", async () => {
    installFetch(
      mockResponse({
        id: 10,
        firstname: "Jane",
        lastname: "Doe",
        email: "jane@example.com",
        address: { street: "Main St 1", city: "Berlin", zip: "10115", country: "Germany" },
      }),
    );
    const out = await run({
      resource: "user",
      operation: "create",
      firstname: "Jane",
      lastname: "Doe",
      email: "jane@example.com",
      addressStreet: "Main St 1",
      addressCity: "Berlin",
      addressZip: "10115",
      addressCountry: "Germany",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://zammad.example.com/api/v1/users");
    const body = JSON.parse(calls[0].body!);
    expect(body.firstname).toBe("Jane");
    expect(body.lastname).toBe("Doe");
    expect(body.email).toBe("jane@example.com");
    expect(body.street).toBe("Main St 1");
    expect(body.city).toBe("Berlin");
    expect(body.zip).toBe("10115");
    expect(body.country).toBe("Germany");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.firstname).toBe("Jane");
  });

  it("retrieves self", async () => {
    installFetch(
      mockResponse({ id: 1, email: "admin@zammad.example.com", firstname: "Admin", lastname: "User" }),
    );
    const out = await run({
      resource: "user",
      operation: "getSelf",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://zammad.example.com/api/v1/users/me");
    expect(out[0][0].json.email).toBe("admin@zammad.example.com");
  });

  it("creates ticket with article mapping", async () => {
    installFetch(
      mockResponse({ id: 99, title: "Support request", article_count: 1 }),
    );
    const out = await run({
      resource: "ticket",
      operation: "create",
      title: "Support request",
      articleSubject: "Help needed",
      articleBody: "Please assist with this issue",
      articleType: "email",
      articleVisibility: "external",
      articleSender: "Customer",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://zammad.example.com/api/v1/tickets");
    const body = JSON.parse(calls[0].body!);
    expect(body.title).toBe("Support request");
    expect(body.article).toBeDefined();
    expect(body.article.subject).toBe("Help needed");
    expect(body.article.body).toBe("Please assist with this issue");
    expect(body.article.type).toBe("email");
    expect(body.article.internal).toBe(false);
    expect(body.article.sender).toBe("Customer");

    expect(out[0][0].json.title).toBe("Support request");
  });

  it("creates ticket with internal article visibility", async () => {
    installFetch(
      mockResponse({ id: 100, title: "Internal note", article_count: 1 }),
    );
    await run({
      resource: "ticket",
      operation: "create",
      title: "Internal note",
      articleSubject: "Note",
      articleBody: "Internal only",
      articleVisibility: "internal",
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.article.internal).toBe(true);
  });

  it("throws on missing required fields", async () => {
    await expect(
      run({ resource: "group", operation: "create" }),
    ).rejects.toThrow("Zammad: name is required for group create");
  });

  it("throws on empty update body", async () => {
    installFetch(mockResponse({}));
    await expect(
      run({ resource: "group", operation: "update", groupId: "1" }),
    ).rejects.toThrow("Zammad: No update data provided");
  });

  it("handles getAll with per_page and page", async () => {
    installFetch(mockResponse([]));
    await run({
      resource: "ticket",
      operation: "getAll",
      limit: 10,
      page: 2,
    });

    expect(calls[0].url).toContain("per_page=10");
    expect(calls[0].url).toContain("page=2");
  });

  it("deletes a group", async () => {
    installFetch(mockResponse({ id: 42, name: "Test Group" }));
    const out = await run({
      resource: "group",
      operation: "delete",
      groupId: "42",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://zammad.example.com/api/v1/groups/42");
    expect(out[0][0].json.id).toBe(42);
  });

  it("updates an organization", async () => {
    installFetch(mockResponse({ id: 7, name: "Updated Org", active: true }));
    const out = await run({
      resource: "organization",
      operation: "update",
      organizationId: "7",
      name: "Updated Org",
      active: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://zammad.example.com/api/v1/organizations/7");
    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("Updated Org");
    expect(body.active).toBe(true);
    expect(out[0][0].json.name).toBe("Updated Org");
  });

  it("surfaces API errors", async () => {
    installFetch(mockResponse({ error: "Invalid ticket data" }, { status: 422 }));
    await expect(
      run({ resource: "ticket", operation: "create", title: "Bad" }),
    ).rejects.toThrow("Zammad: Invalid ticket data");
  });
});
