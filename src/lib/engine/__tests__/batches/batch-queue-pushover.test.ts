import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pushover";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const map = new Map<string, string>([["content-type", "application/json"]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
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

const CREDS = {
  pushoverApi: {
    apiKey: "test-api-key-123",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue pushover — n8n-nodes-base.pushover", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Pushover");
  });

  describe("push", () => {
    it("sends a basic push notification", async () => {
      const apiResponse = { status: 1, request: "647d2300-702c-4b38-8b2f-d56326ae460b" };
      installFetch({
        "POST https://api.pushover.net/1/messages.json": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "message",
        operation: "push",
        user: "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
        message: "Hello from OpenFlow",
        title: "Test Notification",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://api.pushover.net/1/messages.json");
      const body = new URLSearchParams(calls[0].body as string);
      expect(body.get("token")).toBe("test-api-key-123");
      expect(body.get("user")).toBe("uQiRzpo4DXghDmr9QzzfQu27cmVRsG");
      expect(body.get("message")).toBe("Hello from OpenFlow");
      expect(body.get("title")).toBe("Test Notification");
      expect(body.get("priority")).toBe("0");
      expect(out[0][0].json).toMatchObject({
        status: 1,
        request: "647d2300-702c-4b38-8b2f-d56326ae460b",
      });
    });

    it("sends emergency priority with retry/expire", async () => {
      const apiResponse = { status: 1, request: "req-abc-123" };
      installFetch({
        "POST https://api.pushover.net/1/messages.json": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "message",
        operation: "push",
        user: "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
        message: "Server is down!",
        priority: 2,
        retry: 60,
        expire: 3600,
      });
      expect(calls).toHaveLength(1);
      const body = new URLSearchParams(calls[0].body as string);
      expect(body.get("priority")).toBe("2");
      expect(body.get("retry")).toBe("60");
      expect(body.get("expire")).toBe("3600");
      expect(out[0][0].json).toMatchObject({ status: 1, request: "req-abc-123" });
    });

    it("includes optional parameters when provided", async () => {
      const apiResponse = { status: 1, request: "req-456" };
      installFetch({
        "POST https://api.pushover.net/1/messages.json": mockResponse(apiResponse),
      });
      await run({
        resource: "message",
        operation: "push",
        user: "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
        message: "Test",
        device: "iphone,android",
        sound: "bike",
        html: true,
        ttl: 86400,
        url: "https://example.com",
        url_title: "Example",
      });
      const body = new URLSearchParams(calls[0].body as string);
      expect(body.get("device")).toBe("iphone,android");
      expect(body.get("sound")).toBe("bike");
      expect(body.get("html")).toBe("1");
      expect(body.get("ttl")).toBe("86400");
      expect(body.get("url")).toBe("https://example.com");
      expect(body.get("url_title")).toBe("Example");
    });
  });

  describe("validation", () => {
    it("throws when user is missing", async () => {
      await expect(
        run({
          resource: "message",
          operation: "push",
          message: "Hello",
        }),
      ).rejects.toThrow("Pushover: user is required");
    });

    it("throws when message is missing", async () => {
      await expect(
        run({
          resource: "message",
          operation: "push",
          user: "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
        }),
      ).rejects.toThrow("Pushover: message is required");
    });

    it("throws when emergency priority without retry/expire", async () => {
      await expect(
        run({
          resource: "message",
          operation: "push",
          user: "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
          message: "Alert",
          priority: 2,
        }),
      ).rejects.toThrow("Pushover: retry and expire are required for emergency priority");
    });

    it("throws on missing credential", async () => {
      await expect(
        run(
          {
            resource: "message",
            operation: "push",
            user: "uQiRzpo4DXghDmr9QzzfQu27cmVRsG",
            message: "Test",
          },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow("Pushover: pushoverApi credential is required");
    });
  });

  describe("errors", () => {
    it("handles API error response", async () => {
      installFetch({
        "POST https://api.pushover.net/1/messages.json": mockResponse(
          { status: 0, errors: ["invalid user key"] },
          { status: 400 },
        ),
      });
      await expect(
        run({
          resource: "message",
          operation: "push",
          user: "invalid",
          message: "Test",
        }),
      ).rejects.toThrow("invalid user key");
    });

    it("continueOnFail returns error items", async () => {
      installFetch({
        "POST https://api.pushover.net/1/messages.json": mockResponse(
          { status: 0, errors: ["invalid user key"] },
          { status: 400 },
        ),
      });
      const out = await run(
        {
          resource: "message",
          operation: "push",
          user: "invalid",
          message: "Test",
        },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({
        message: expect.stringContaining("invalid user key"),
      });
    });
  });
});