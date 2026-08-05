import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gongTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
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

let calls: Array<{ url: string; method: string; headers: Record<string, string> }>;
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response?: ReturnType<typeof mockResponse>) {
  nextResponse = response ?? mockResponse({});
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({ url: String(url), method: init?.method ?? "GET", headers });
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

const CREDS = { gongApi: { accessKey: "ak_123", secretKey: "sk_456" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue gongTool — n8n-nodes-base.gongTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Gong Tool");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.gongTool")).toBe(canonical);
  });

  describe("call — get", () => {
    it("retrieves a single call by id", async () => {
      installFetch(
        mockResponse({
          id: "123456789",
          clientUniqueId: "uuid-abc",
          title: "Sales Call Q1",
          duration: 1800,
          started: "2025-01-15T14:00:00Z",
          participants: [{ name: "Alice" }, { name: "Bob" }],
        }),
      );
      const out = await run({
        resource: "call",
        operation: "get",
        callId: "123456789",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://api.gong.io/v2/calls/123456789");
      expect(out[0][0].json).toMatchObject({ id: "123456789", title: "Sales Call Q1" });
    });

    it("throws when callId is missing", async () => {
      await expect(
        run({ resource: "call", operation: "get" }, [{}], { credentials: CREDS }),
      ).rejects.toThrow(/callId is required/);
    });

    it("accepts $fromAI() expression for callId", async () => {
      installFetch(
        mockResponse({
          id: "abc123",
          title: "AI-sourced Call",
          started: "2026-02-01T10:00:00Z",
          duration: 1200,
          participants: [{ name: "Charlie" }],
        }),
      );
      const out = await run({
        resource: "call",
        operation: "get",
        callId: '={{ $fromAI("Extract the Gong call ID from the conversation") }}',
      });

      expect(calls).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "abc123", title: "AI-sourced Call" });
    });
  });

  describe("call — getMany", () => {
    it("returns calls array with date filter", async () => {
      installFetch(
        mockResponse({
          calls: [
            { id: "1", title: "Call 1" },
            { id: "2", title: "Call 2" },
          ],
        }),
      );
      const out = await run({
        resource: "call",
        operation: "getMany",
        fromDateTime: "2026-01-01T00:00:00Z",
        toDateTime: "2026-01-31T23:59:59Z",
      });

      expect(calls[0].url).toContain("fromDateTime=2026-01-01T00%3A00%3A00Z");
      expect(calls[0].url).toContain("toDateTime=2026-01-31T23%3A59%3A59Z");
      expect(out[0][0].json).toHaveProperty("calls");
      expect(Array.isArray(out[0][0].json.calls)).toBe(true);
      expect(out[0][0].json.calls).toHaveLength(2);
    });
  });

  describe("user — get", () => {
    it("retrieves a single user by id", async () => {
      installFetch(
        mockResponse({ id: "abc123", email: "alice@example.com", name: "Alice" }),
      );
      const out = await run({
        resource: "user",
        operation: "get",
        userId: "abc123",
      });

      expect(calls[0].url).toBe("https://api.gong.io/v2/users/abc123");
      expect(out[0][0].json).toMatchObject({ id: "abc123", email: "alice@example.com" });
    });

    it("throws when userId is missing", async () => {
      await expect(
        run({ resource: "user", operation: "get" }, [{}], { credentials: CREDS }),
      ).rejects.toThrow(/userId is required/);
    });
  });

  describe("user — getMany", () => {
    it("returns users array", async () => {
      installFetch(
        mockResponse({ users: [{ id: "1", email: "a@x.com" }, { id: "2", email: "b@x.com" }] }),
      );
      const out = await run({
        resource: "user",
        operation: "getMany",
      });

      expect(calls[0].url).toBe("https://api.gong.io/v2/users");
      expect(out[0][0].json).toHaveProperty("users");
      expect(out[0][0].json.users).toHaveLength(2);
    });
  });

  it("sends Basic auth from gongApi credential", async () => {
    installFetch(mockResponse({ id: "123" }));
    await run(
      { resource: "call", operation: "get", callId: "123" },
      [{}],
      { credentials: CREDS },
    );

    expect(calls[0].headers["Authorization"]).toMatch(/^Basic /);
  });

  it("sends Bearer token from gongOAuth2Api credential", async () => {
    installFetch(mockResponse({ id: "123" }));
    await run(
      { resource: "call", operation: "get", callId: "123" },
      [{}],
      { credentials: { gongOAuth2Api: { accessToken: "oauth_tok" } } },
    );

    expect(calls[0].headers["Authorization"]).toBe("Bearer oauth_tok");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "call", operation: "get", callId: "123" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/Gong credential/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "bad" }, 500));
    const out = await run(
      { resource: "call", operation: "get", callId: "bad" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("makes one request per input item", async () => {
    installFetch(mockResponse({ id: "result" }));
    await run(
      { resource: "call", operation: "get", callId: "={{ $json.id }}" },
      [{ id: "call_a" }, { id: "call_b" }],
      { credentials: CREDS },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("call_a");
    expect(calls[1].url).toContain("call_b");
  });

  it("invalid resource throws an error", async () => {
    await expect(
      run(
        { resource: "invalidResource", operation: "get" },
        [{}],
        { credentials: CREDS },
      ),
    ).rejects.toThrow();
  });
});
