import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pushcut";

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
  pushcutApi: {
    apiKey: "test-api-key-abc123",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue pushcut — n8n-nodes-base.pushcut", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Pushcut");
  });

  describe("send", () => {
    it("sends a basic notification with only required fields", async () => {
      const apiResponse = { id: "notif-123", notificationId: "My Alert", message: "Notification scheduled" };
      installFetch({
        "POST https://api.pushcut.io/v1/notifications": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "notification",
        operation: "send",
        notification: "My Alert",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://api.pushcut.io/v1/notifications");
      expect(calls[0].headers["API-Key"]).toBe("test-api-key-abc123");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toEqual({ notification: "My Alert" });
      expect(out[0][0].json).toMatchObject({
        id: "notif-123",
        notificationId: "My Alert",
        message: "Notification scheduled",
      });
    });

    it("sends a notification with an identifier", async () => {
      const apiResponse = { id: "notif-456", notificationId: "Server Down", message: "Notification scheduled" };
      installFetch({
        "POST https://api.pushcut.io/v1/notifications": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "notification",
        operation: "send",
        notification: "={{ $json.alertName }}",
        additionalFields: { identifier: "server-down-alert" },
      }, [{ json: { alertName: "Server Down" } }]);
      expect(calls).toHaveLength(1);
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toEqual({ notification: "Server Down", identifier: "server-down-alert" });
      expect(out[0][0].json).toMatchObject({ notificationId: "Server Down" });
    });

    it("sends a delayed notification", async () => {
      const apiResponse = { id: "notif-789", notificationId: "Reminder", message: "Notification scheduled with delay" };
      installFetch({
        "POST https://api.pushcut.io/v1/notifications": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "notification",
        operation: "send",
        notification: "Reminder",
        additionalFields: { delay: "5m" },
      });
      expect(calls).toHaveLength(1);
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toEqual({ notification: "Reminder", delay: "5m" });
      expect(out[0][0].json).toMatchObject({ id: "notif-789", message: "Notification scheduled with delay" });
    });

    it("sends a notification with sendAt", async () => {
      const apiResponse = { id: "notif-101", notificationId: "Later Alert", message: "Notification scheduled" };
      installFetch({
        "POST https://api.pushcut.io/v1/notifications": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "notification",
        operation: "send",
        notification: "Later Alert",
        additionalFields: { sendAt: "2025-01-15T14:00:00Z" },
      });
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toEqual({ notification: "Later Alert", sendAt: "2025-01-15T14:00:00Z" });
      expect(out[0][0].json).toMatchObject({ id: "notif-101" });
    });

    it("processes each input item independently", async () => {
      const responses = [
        { id: "notif-1", notificationId: "First Alert", message: "Notification scheduled" },
        { id: "notif-2", notificationId: "Second Alert", message: "Notification scheduled" },
      ];
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit | undefined) => {
          const headers: Record<string, string> = {};
          const h = init?.headers as Record<string, string> | undefined;
          if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
          calls.push({
            url: String(url),
            method: (init?.method ?? "GET").toUpperCase(),
            headers,
            body: typeof init?.body === "string" ? init.body : undefined,
          });
          const idx = callCount++;
          const resp = responses[idx] ?? responses[0];
          return mockResponse(resp);
        }),
      );
      const out = await run({
        resource: "notification",
        operation: "send",
        notification: "={{ $json.name }}",
      }, [
        { json: { name: "First Alert" } },
        { json: { name: "Second Alert" } },
      ]);
      expect(calls).toHaveLength(2);
      expect(out[0]).toHaveLength(2);
      expect(JSON.parse(calls[0].body as string).notification).toBe("First Alert");
      expect(JSON.parse(calls[1].body as string).notification).toBe("Second Alert");
      expect(out[0][0].json).toMatchObject({ notificationId: "First Alert" });
      expect(out[0][1].json).toMatchObject({ notificationId: "Second Alert" });
    });
  });

  describe("validation", () => {
    it("throws when notification is missing", async () => {
      await expect(
        run({
          resource: "notification",
          operation: "send",
          notification: "",
        }),
      ).rejects.toThrow("Pushcut: notification is required");
    });

    it("throws on missing credential", async () => {
      await expect(
        run(
          {
            resource: "notification",
            operation: "send",
            notification: "Test",
          },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow("Pushcut: pushcutApi credential is required");
    });
  });

  describe("errors", () => {
    it("handles API error response", async () => {
      installFetch({
        "POST https://api.pushcut.io/v1/notifications": mockResponse(
          { error: { message: "invalid notification name" } },
          { status: 400 },
        ),
      });
      await expect(
        run({
          resource: "notification",
          operation: "send",
          notification: "Invalid",
        }),
      ).rejects.toThrow("invalid notification name");
    });

    it("continueOnFail returns error items", async () => {
      installFetch({
        "POST https://api.pushcut.io/v1/notifications": mockResponse(
          { error: { message: "unauthorized" } },
          { status: 401 },
        ),
      });
      const out = await run(
        {
          resource: "notification",
          operation: "send",
          notification: "Test",
        },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({
        message: expect.stringContaining("unauthorized"),
      });
    });
  });
});