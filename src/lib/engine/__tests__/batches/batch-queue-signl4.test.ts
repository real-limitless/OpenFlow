import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.signl4";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 201;
  const map = new Map<string, string>([["content-type", "application/json"]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status >= 200 && status < 300 ? "Created" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
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
  fallback: ReturnType<typeof mockResponse> = mockResponse({ eventId: "2518975207516268778_100c76b7-5ed7-4c2a-843e-a38fc8727bd0" }),
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

const CREDS = {
  signl4Api: {
    teamSecret: "test-team-secret-123",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue signl4 — n8n-nodes-base.signl4", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("SIGNL4");
  });

  describe("send", () => {
    it("sends a basic alert", async () => {
      const apiResponse = { eventId: "2518975207516268778_100c76b7-5ed7-4c2a-843e-a38fc8727bd0" };
      installFetch({
        "POST https://connect.signl4.com/webhook/test-team-secret-123": mockResponse(apiResponse),
      });
      const out = await run(
        {
          resource: "alert",
          operation: "send",
          alertFields: {
            message: "Server CPU over 90%",
            alertFieldsAdditional: {
              xS4Service: "Infrastructure",
            },
          },
        },
        [{ message: "Server CPU over 90%", service: "Infrastructure" }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://connect.signl4.com/webhook/test-team-secret-123");
      expect(calls[0].headers["X-S4-Service"]).toBe("Infrastructure");
      const body = JSON.parse(calls[0].body ?? "{}");
      expect(body.message).toBe("Server CPU over 90%");
      expect(out[0][0].json).toMatchObject({
        message: "Server CPU over 90%",
        service: "Infrastructure",
        eventId: "2518975207516268778_100c76b7-5ed7-4c2a-843e-a38fc8727bd0",
      });
    });

    it("sends an alert with all optional fields", async () => {
      const apiResponse = { eventId: "req-abc-123" };
      installFetch({
        "POST https://connect.signl4.com/webhook/test-team-secret-123": mockResponse(apiResponse),
      });
      const out = await run(
        {
          resource: "alert",
          operation: "send",
          alertFields: {
            message: "={{ $json.message }}",
            alertFieldsAdditional: {
              xS4Location: "={{ $json.location }}",
              xS4AlertingScenario: "emergency",
              xS4ExternalID: "={{ $json.externalId }}",
              xS4Filtering: false,
            },
          },
        },
        [{ message: "Security breach detected", location: "40.7128,-74.0060", externalId: "SEC-2024-001" }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].headers["X-S4-Location"]).toBe("40.7128,-74.0060");
      expect(calls[0].headers["X-S4-AlertingScenario"]).toBe("emergency");
      expect(calls[0].headers["X-S4-ExternalID"]).toBe("SEC-2024-001");
      expect(calls[0].headers["X-S4-Filtering"]).toBe("false");
      expect(out[0][0].json).toHaveProperty("eventId");
    });

    it("includes optional status correlation params", async () => {
      installFetch();
      await run(
        {
          resource: "alert",
          operation: "send",
          alertFields: { message: "Test" },
          options: {
            extIdParam: "id",
            extStatusParam: "status",
            newStatus: "new",
            resolvedStatus: "resolved",
            ackStatus: "ack",
          },
        },
        [{ message: "Test" }],
      );
      expect(calls[0].headers["ExtIdParam"]).toBe("id");
      expect(calls[0].headers["ExtStatusParam"]).toBe("status");
      expect(calls[0].headers["NewStatus"]).toBe("new");
      expect(calls[0].headers["ResolvedStatus"]).toBe("resolved");
      expect(calls[0].headers["AckStatus"]).toBe("ack");
    });
  });

  describe("resolve", () => {
    it("resolves an alert by external ID", async () => {
      const apiResponse = { eventId: "resolve-123" };
      installFetch({
        "POST https://connect.signl4.com/webhook/test-team-secret-123": mockResponse(apiResponse),
      });
      const out = await run(
        {
          resource: "alert",
          operation: "resolve",
          resolveFields: {
            xS4ExternalID: "={{ $json.externalId }}",
          },
        },
        [{ externalId: "SEC-2024-001" }],
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].headers["X-S4-Status"]).toBe("resolved");
      expect(calls[0].headers["X-S4-ExternalID"]).toBe("SEC-2024-001");
      expect(out[0][0].json).toHaveProperty("eventId");
    });
  });

  describe("errors", () => {
    it("throws 404 on invalid team secret", async () => {
      installFetch({}, mockResponse({ error: "Not Found" }, { status: 404 }));
      await expect(
        run(
          {
            resource: "alert",
            operation: "send",
            alertFields: { message: "test" },
          },
          [{ message: "test" }],
        ),
      ).rejects.toThrow("SIGNL4: invalid credentials");
    });

    it("throws on HTTP 400", async () => {
      installFetch({}, mockResponse({ error: "Bad Request" }, { status: 400 }));
      await expect(
        run(
          {
            resource: "alert",
            operation: "send",
            alertFields: { message: "" },
          },
          [{ message: "" }],
        ),
      ).rejects.toThrow("SIGNL4: request body was empty or missing");
    });

    it("throws on missing credential", async () => {
      await expect(
        run(
          { resource: "alert", operation: "send", alertFields: { message: "test" } },
          [{ message: "test" }],
          { credentials: {} },
        ),
      ).rejects.toThrow("SIGNL4: signl4Api credential is required");
    });

    it("continueOnFail returns error items", async () => {
      installFetch({}, mockResponse({ error: "Not Found" }, { status: 404 }));
      const out = await run(
        {
          resource: "alert",
          operation: "send",
          alertFields: { message: "test" },
        },
        [{ message: "test" }],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({
        message: expect.stringContaining("invalid credentials"),
      });
    });
  });
});
