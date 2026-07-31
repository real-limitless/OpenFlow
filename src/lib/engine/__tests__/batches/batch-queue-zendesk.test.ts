import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.zendesk";

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

const CREDS = { zendeskApi: { subdomain: "test", email: "me@test.com", apiToken: "tok123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue zendesk — n8n-nodes-base.zendesk", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Zendesk");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.zendesk")).toBe(canonical);
  });

  it("creates a ticket", async () => {
    installFetch(
      mockResponse({
        ticket: { id: "123", subject: "Printer offline", description: "The third-floor printer is unavailable" },
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "create",
        requestFields: '{"ticket":{"subject":"Printer offline","description":"The third-floor printer is unavailable"}}',
      },
      [{ subject: "Printer offline", description: "The third-floor printer is unavailable" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://test.zendesk.com/api/v2/tickets.json");
    expect(calls[0].headers["Authorization"]).toContain("Basic");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ ticket: { subject: "Printer offline", description: "The third-floor printer is unavailable" } });
    expect(out[0][0].json).toMatchObject({
      ticket: { id: "123", subject: "Printer offline", description: "The third-floor printer is unavailable" },
    });
  });

  it("retrieves and updates a user", async () => {
    installFetch(
      mockResponse({
        user: { id: "456", name: "John Doe", role: "end-user" },
      }),
    );
    const out = await run(
      {
        resource: "user",
        operation: "update",
        id: "456",
        requestFields: '{"user":{"name":"Jane Doe"}}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://test.zendesk.com/api/v2/users/456.json");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ user: { name: "Jane Doe" } });
    expect(out[0][0].json).toMatchObject({
      user: { id: "456", name: "John Doe", role: "end-user" },
    });
  });

  it("lists all ticket fields", async () => {
    installFetch(
      mockResponse({
        ticket_fields: [
          { id: 1, type: "subject", title: "Subject" },
          { id: 2, type: "description", title: "Description" },
        ],
      }),
    );
    const out = await run(
      {
        resource: "ticketField",
        operation: "getAll",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://test.zendesk.com/api/v2/ticket_fields.json");
    expect(out[0][0].json).toMatchObject({
      ticket_fields: [
        { id: 1, type: "subject", title: "Subject" },
        { id: 2, type: "description", title: "Description" },
      ],
    });
  });

  it("organization count returns count result and not-found get produces error", async () => {
    installFetch(mockResponse({ organization_count: 42, count: 42 }));
    const out = await run(
      {
        resource: "organization",
        operation: "count",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://test.zendesk.com/api/v2/organizations/count.json");
    expect(out[0][0].json).toMatchObject({ organization_count: 42, count: 42 });
  });

  it("not-found organization get produces error", async () => {
    installFetch(mockResponse({ error: "RecordNotFound" }, { status: 404 }));

    await expect(
      run(
        {
          resource: "organization",
          operation: "get",
          id: "999999",
        },
        [{}],
      ),
    ).rejects.toThrow(/RecordNotFound/);
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "ticket", operation: "getAll" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/zendeskApi credential is not configured/);
  });

  it("continueOnFail emits error item on API error and continues", async () => {
    const responses = [
      mockResponse({ error: "RecordNotFound" }, { status: 404 }),
      mockResponse({ ticket: { id: "789", subject: "Second" } }),
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
        id: "={{ $json.id }}",
      },
      [{ id: "999999" }, { id: "789" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toContain("RecordNotFound");
    expect(out[0][1].json).toMatchObject({ ticket: { id: "789" } });
  });
});