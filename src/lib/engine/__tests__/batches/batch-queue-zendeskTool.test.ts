import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.zendeskTool";

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

describe("batch-queue zendeskTool — n8n-nodes-base.zendeskTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc.displayName).toBe("Zendesk (AI Tool)");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("creates a ticket", async () => {
    installFetch(
      mockResponse({
        ticket: { id: "123", subject: "Login issue", description: "User cannot log in after password reset." },
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "create",
        requestFields: '{"ticket":{"subject":"Login issue","description":"User cannot log in after password reset."}}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://test.zendesk.com/api/v2/tickets.json");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({
      ticket: { subject: "Login issue", description: "User cannot log in after password reset." },
    });
    expect(out[0][0].json).toMatchObject({
      ticket: { id: "123", subject: "Login issue", description: "User cannot log in after password reset." },
    });
  });

  it("searches users", async () => {
    installFetch(
      mockResponse({
        users: [
          { id: "1", email: "alice@example.com" },
          { id: "2", email: "bob@example.com" },
        ],
      }),
    );
    const out = await run(
      {
        resource: "user",
        operation: "search",
        queryParameters: '{"query":"example.com"}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("users/search.json");
    expect(calls[0].url).toContain("query=example.com");
    expect(out[0][0].json).toMatchObject({
      users: expect.arrayContaining([
        expect.objectContaining({ email: "alice@example.com" }),
      ]),
    });
  });

  it("returns empty array when no users match", async () => {
    installFetch(mockResponse({ users: [] }));
    const out = await run(
      {
        resource: "user",
        operation: "search",
        queryParameters: '{"query":"nonexistent.com"}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ users: [] });
  });

  it("updates a ticket", async () => {
    installFetch(
      mockResponse({
        ticket: { id: "456", status: "solved", subject: "My Printer", description: "Still broken" },
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "update",
        id: "456",
        requestFields: '{"ticket":{"status":"solved"}}',
      },
      [{ id: "456" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("tickets/456.json");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ ticket: { status: "solved" } });
    expect(out[0][0].json).toMatchObject({
      ticket: { id: "456", status: "solved" },
    });
  });

  it("fails when credential is missing", async () => {
    await expect(
      run(
        { resource: "ticket", operation: "getAll" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/zendeskApi credential is not configured/);
  });

  it("tag replacement — update replaces existing tags", async () => {
    installFetch(
      mockResponse({
        ticket: { id: "789", tags: ["urgent"], subject: "Update test" },
      }),
    );
    const out = await run(
      {
        resource: "ticket",
        operation: "update",
        id: "789",
        requestFields: '{"ticket":{"tags":["urgent"]}}',
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ ticket: { tags: ["urgent"] } });
    expect(out[0][0].json).toMatchObject({
      ticket: { tags: ["urgent"] },
    });
  });

  it("works with OAuth2 credential", async () => {
    installFetch(
      mockResponse({
        ticket: { id: "oauth-ticket", subject: "OAuth2 Test" },
      }),
    );
    const oauthCreds = { zendeskOAuth2Api: { subdomain: "test-oauth", accessToken: "oauth-token-abc" } };
    const out = await run(
      {
        authentication: "oAuth2",
        resource: "ticket",
        operation: "create",
        requestFields: '{"ticket":{"subject":"OAuth2 Test"}}',
      },
      [{}],
      { credentials: oauthCreds },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].headers["Authorization"]).toBe("Bearer oauth-token-abc");
    expect(out[0][0].json).toMatchObject({
      ticket: { id: "oauth-ticket" },
    });
  });
});
