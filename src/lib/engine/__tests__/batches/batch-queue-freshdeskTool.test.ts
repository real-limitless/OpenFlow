import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.freshdeskTool";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
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

describe("batch-queue freshdeskTool — n8n-nodes-base.freshdeskTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc.displayName).toBe("Freshdesk (AI Tool)");
  });

  it("creates a ticket", async () => {
    installFetch(
      mockResponse({
        id: "123",
        subject: "Login issue",
        description: "User cannot log in after password reset.",
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "create",
        requestFields: '{"subject":"Login issue","description":"User cannot log in after password reset."}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/tickets");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({
      subject: "Login issue",
      description: "User cannot log in after password reset.",
    });
    expect(out[0][0].json).toMatchObject({
      id: "123",
      subject: "Login issue",
    });
  });

  it("gets a contact by ID", async () => {
    installFetch(
      mockResponse({
        id: "456",
        name: "Alice",
        email: "alice@example.com",
      }),
    );
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "456",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/contacts/456");
    expect(out[0][0].json).toMatchObject({
      id: "456",
      name: "Alice",
    });
  });

  it("searches tickets with query parameters", async () => {
    installFetch(
      mockResponse([
        { id: "1", subject: "Ticket 1", requester_email: "bob@example.com" },
        { id: "2", subject: "Ticket 2", requester_email: "bob@example.com" },
      ]),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "getAll",
        queryParameters: '{"requester_email":"bob@example.com"}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("requester_email=bob%40example.com");
    expect(out[0]).toHaveLength(2);
  });

  it("updates a ticket", async () => {
    installFetch(
      mockResponse({
        id: "789",
        status: 2,
        subject: "My Printer",
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "update",
        ticketId: "789",
        requestFields: '{"status":2}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/tickets/789");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ status: 2 });
    expect(out[0][0].json).toMatchObject({
      id: "789",
      status: 2,
    });
  });

  it("deletes a contact", async () => {
    installFetch(mockResponse({}));
    const out = await run(
      {
        resource: "contact",
        operation: "delete",
        contactId: "999",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://test.freshdesk.com/api/v2/contacts/999");
    expect(out[0][0].json).toMatchObject({ deleted: true, id: "999" });
  });

  it("fails when credential is missing", async () => {
    await expect(
      run(
        { resource: "ticket", operation: "getAll" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/freshdeskApi credential is not configured/);
  });
});
