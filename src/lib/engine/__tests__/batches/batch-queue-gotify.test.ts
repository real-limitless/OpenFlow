import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gotify";

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
  gotifyApi: {
    url: "https://gotify.example.com",
    appToken: "app-token-abc",
    clientToken: "client-token-xyz",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue gotify — n8n-nodes-base.gotify", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Gotify");
  });

  describe("create", () => {
    it("creates a message", async () => {
      const created = { id: 1, appid: 1, message: "Test body", title: "Test Title", priority: 5, date: "2024-01-01T12:00:00Z" };
      installFetch({
        "POST https://gotify.example.com/message": mockResponse(created),
      });
      const out = await run({
        resource: "message",
        operation: "create",
        message: "Test body",
        additionalFields: { title: "Test Title", priority: 5 },
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://gotify.example.com/message");
      expect(calls[0].headers["X-Gotify-Key"]).toBe("app-token-abc");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({ message: "Test body", title: "Test Title", priority: 5 });
      expect(out[0][0].json).toMatchObject({
        id: 1,
        message: "Test body",
        title: "Test Title",
        priority: 5,
      });
    });

    it("creates a message with markdown content type", async () => {
      const created = { id: 2, appid: 1, message: "**bold** and *italic* text", title: "", priority: 1, date: "2024-01-01T12:00:00Z", extras: { client: { display: { contentType: "text/markdown" } } } };
      installFetch({
        "POST https://gotify.example.com/message": mockResponse(created),
      });
      const out = await run({
        resource: "message",
        operation: "create",
        message: "**bold** and *italic* text",
        options: { contentType: "text/markdown" },
      });
      expect(calls).toHaveLength(1);
      const sent = JSON.parse(calls[0].body as string);
      expect(sent.extras).toMatchObject({ client: { display: { contentType: "text/markdown" } } });
      expect(out[0][0].json).toMatchObject({ message: "**bold** and *italic* text" });
    });

    it("defaults priority to 1 when omitted", async () => {
      const created = { id: 3, appid: 1, message: "no priority", title: "", priority: 1, date: "2024-01-01T12:00:00Z" };
      installFetch({
        "POST https://gotify.example.com/message": mockResponse(created),
      });
      const out = await run({
        resource: "message",
        operation: "create",
        message: "no priority",
      });
      const sent = JSON.parse(calls[0].body as string);
      expect(sent.priority).toBe(1);
    });

    it("throws when message is missing", async () => {
      await expect(
        run({
          resource: "message",
          operation: "create",
        }),
      ).rejects.toThrow("Gotify: message is required for create operation");
    });
  });

  describe("delete", () => {
    it("deletes a message and returns success", async () => {
      installFetch({
        "DELETE https://gotify.example.com/message/1": mockResponse(null, { status: 204 }),
      });
      const out = await run({
        resource: "message",
        operation: "delete",
        messageId: "1",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toBe("https://gotify.example.com/message/1");
      expect(calls[0].headers["X-Gotify-Key"]).toBe("client-token-xyz");
      expect(out[0][0].json).toEqual({ success: true });
    });

    it("throws when messageId is missing", async () => {
      await expect(
        run({
          resource: "message",
          operation: "delete",
          messageId: "",
        }),
      ).rejects.toThrow("Gotify: messageId is required for delete operation");
    });
  });

  describe("getAll", () => {
    it("returns all messages", async () => {
      const messages = [
        { id: 2, appid: 1, message: "second", title: "", priority: 0, date: "2024-01-02T12:00:00Z" },
        { id: 1, appid: 1, message: "first", title: "", priority: 3, date: "2024-01-01T12:00:00Z" },
      ];
      installFetch({
        "GET https://gotify.example.com/message": mockResponse({ messages }),
      });
      const out = await run({
        resource: "message",
        operation: "getAll",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://gotify.example.com/message");
      expect(calls[0].headers["X-Gotify-Key"]).toBe("client-token-xyz");
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: 2, message: "second" });
      expect(out[0][1].json).toMatchObject({ id: 1, message: "first" });
    });

    it("respects limit option", async () => {
      const messages = [
        { id: 3, appid: 1, message: "third", title: "", priority: 0, date: "2024-01-03T12:00:00Z" },
        { id: 2, appid: 1, message: "second", title: "", priority: 0, date: "2024-01-02T12:00:00Z" },
        { id: 1, appid: 1, message: "first", title: "", priority: 5, date: "2024-01-01T12:00:00Z" },
      ];
      installFetch({
        "GET https://gotify.example.com/message?limit=2": mockResponse({ messages: messages.slice(0, 2) }),
      });
      const out = await run({
        resource: "message",
        operation: "getAll",
        limit: 2,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://gotify.example.com/message?limit=2");
      expect(out[0]).toHaveLength(2);
    });

    it("paginates when returnAll is true", async () => {
      const page1 = [
        { id: 2, appid: 1, message: "second", title: "", priority: 0, date: "2024-01-02T12:00:00Z" },
        { id: 1, appid: 1, message: "first", title: "", priority: 3, date: "2024-01-01T12:00:00Z" },
      ];
      const page2 = [
        { id: 4, appid: 1, message: "fourth", title: "", priority: 0, date: "2024-01-04T12:00:00Z" },
        { id: 3, appid: 1, message: "third", title: "", priority: 1, date: "2024-01-03T12:00:00Z" },
      ];
      let callCount = 0;
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
          callCount++;
          if (callCount === 1) return mockResponse({ messages: page1 });
          return mockResponse({ messages: page2 });
        }),
      );
      const out = await run({
        resource: "message",
        operation: "getAll",
        returnAll: true,
      });
      expect(calls).toHaveLength(2);
      expect(out[0]).toHaveLength(4);
      expect(out[0][0].json).toMatchObject({ id: 2, message: "second" });
      expect(out[0][3].json).toMatchObject({ id: 3, message: "third" });
    });

    it("stops pagination when empty page returned", async () => {
      const page1 = [
        { id: 1, appid: 1, message: "only", title: "", priority: 1, date: "2024-01-01T12:00:00Z" },
      ];
      let callCount = 0;
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
          callCount++;
          if (callCount === 1) return mockResponse({ messages: page1 });
          return mockResponse({ messages: [] });
        }),
      );
      const out = await run({
        resource: "message",
        operation: "getAll",
        returnAll: true,
      });
      expect(calls).toHaveLength(2);
      expect(out[0]).toHaveLength(1);
    });
  });

  describe("errors", () => {
    it("throws on API error", async () => {
      installFetch({
        "POST https://gotify.example.com/message": mockResponse(
          { error: "unauthorized" },
          { status: 401 },
        ),
      });
      await expect(
        run({
          resource: "message",
          operation: "create",
          message: "should fail",
        }),
      ).rejects.toThrow("unauthorized");
    });

    it("continueOnFail returns error items", async () => {
      installFetch({
        "POST https://gotify.example.com/message": mockResponse(
          { error: "unauthorized" },
          { status: 401 },
        ),
      });
      const out = await run(
        {
          resource: "message",
          operation: "create",
          message: "should fail gracefully",
        },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(String(out[0][0].json.error)).toContain("unauthorized");
    });

    it("throws on missing credential", async () => {
      await expect(
        run(
          { resource: "message", operation: "create", message: "test" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow("Gotify: gotifyApi credential is required");
    });

    it("throws on wrong token type for operation", async () => {
      const badCreds = {
        gotifyApi: {
          url: "https://gotify.example.com",
          appToken: "",
          clientToken: "client-token-xyz",
        },
      };
      await expect(
        run(
          { resource: "message", operation: "create", message: "test" },
          [{}],
          { credentials: badCreds },
        ),
      ).rejects.toThrow("Gotify: appToken is required for create operation");
    });
  });

  it("processes multiple input items", async () => {
    const created = { id: 1, appid: 1, message: "multi", title: "", priority: 0, date: "2024-01-01T12:00:00Z" };
    installFetch({
      "POST https://gotify.example.com/message": mockResponse(created),
    });
    const out = await run(
      {
        resource: "message",
        operation: "create",
        message: "multi",
      },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});