import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.freshdesk";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ ok: true })) {
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
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { freshdeskApi: { domain: "test", apiKey: "key123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue freshdesk — n8n-nodes-base.freshdesk", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Freshdesk");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.freshdesk")).toBe(canonical);
  });

  it("creates a contact", async () => {
    installFetch(
      mockResponse({
        id: 101,
        name: "Jane Doe",
        email: "jane@example.com",
      }),
    );
    const out = await run(
      {
        resource: "contact",
        operation: "create",
        requestFields: '{"name":"Jane Doe","email":"jane@example.com"}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/contacts");
    expect(calls[0].headers["Authorization"]).toContain("Basic");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ name: "Jane Doe", email: "jane@example.com" });
    expect(out[0][0].json).toMatchObject({
      id: 101,
      name: "Jane Doe",
      email: "jane@example.com",
    });
  });

  it("gets a ticket by id", async () => {
    installFetch(
      mockResponse({
        id: 42,
        subject: "Printer offline",
        status: 2,
        priority: 1,
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "get",
        ticketId: "42",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/tickets/42");
    expect(out[0][0].json).toMatchObject({
      id: 42,
      subject: "Printer offline",
    });
  });

  it("creates a ticket with nested body", async () => {
    installFetch(
      mockResponse({
        id: 200,
        subject: "Need help",
        description: "Can you assist?",
        status: 2,
        priority: 1,
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "create",
        requestFields: '{"subject":"Need help","description":"Can you assist?","status":2,"priority":1}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/tickets");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ subject: "Need help", description: "Can you assist?", status: 2, priority: 1 });
    expect(out[0][0].json).toMatchObject({ id: 200, subject: "Need help" });
  });

  it("updates a ticket", async () => {
    installFetch(
      mockResponse({
        id: 42,
        subject: "Printer offline",
        priority: 4,
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "update",
        ticketId: "42",
        requestFields: '{"priority":4}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/tickets/42");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ priority: 4 });
    expect(out[0][0].json).toMatchObject({ id: 42, priority: 4 });
  });

  it("deletes a contact and returns success", async () => {
    installFetch(mockResponse({}, { status: 204 }));
    const out = await run(
      {
        resource: "contact",
        operation: "delete",
        contactId: "99",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/contacts/99");
    expect(out[0][0].json).toMatchObject({ deleted: true, id: "99" });
  });

  it("lists contacts with query parameters", async () => {
    installFetch(
      mockResponse([
        { id: 1, name: "Alice", email: "alice@example.com" },
        { id: 2, name: "Bob", email: "bob@example.com" },
      ]),
    );
    const out = await run(
      {
        resource: "contact",
        operation: "getAll",
        queryParameters: '{"email":"alice@example.com"}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("email=alice%40example.com");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ name: "Alice" });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "ticket", operation: "getAll" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/freshdeskApi credential is not configured/);
  });

  it("throws on 404 for a non-existent contact", async () => {
    installFetch(mockResponse({ description: "Record not found" }, { status: 404 }));

    await expect(
      run(
        {
          resource: "contact",
          operation: "get",
          contactId: "999999",
        },
        [{}],
      ),
    ).rejects.toThrow(/Record not found/);
  });

  it("continueOnFail emits error item on API error and continues", async () => {
    const responses = [
      mockResponse({ description: "Record not found" }, { status: 404 }),
      mockResponse({ id: 789, subject: "Second ticket" }),
    ];
    let idx = 0;
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
        return responses[idx++] ?? responses[responses.length - 1];
      }),
    );

    const out = await run(
      {
        resource: "ticket",
        operation: "get",
        ticketId: "={{ $json.id }}",
      },
      [{ id: "999999" }, { id: "789" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toContain("Record not found");
    expect(out[0][1].json).toMatchObject({ id: 789, subject: "Second ticket" });
  });
});
