import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pushbullet";

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
  pushbulletOAuth2Api: {
    accessToken: "test-access-token-123",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue pushbullet — n8n-nodes-base.pushbullet", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Pushbullet");
  });

  describe("create", () => {
    it("creates a note push", async () => {
      const created = { iden: "push-abc", active: true, created: 1.7, modified: 1.7, type: "note", direction: "self", title: "Test Note", body: "Hello from OpenFlow", sender_iden: "sender-1" };
      installFetch({
        "POST https://api.pushbullet.com/v2/pushes": mockResponse(created),
      });
      const out = await run({
        resource: "push",
        operation: "create",
        pushType: "note",
        title: "Test Note",
        body: "Hello from OpenFlow",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://api.pushbullet.com/v2/pushes");
      expect(calls[0].headers["Access-Token"]).toBe("test-access-token-123");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({ type: "note", title: "Test Note", body: "Hello from OpenFlow" });
      expect(out[0][0].json).toMatchObject({
        iden: "push-abc",
        type: "note",
        title: "Test Note",
        body: "Hello from OpenFlow",
        direction: "self",
      });
    });

    it("creates a link push to email target", async () => {
      const created = { iden: "push-xyz", active: true, created: 1.8, modified: 1.8, type: "link", direction: "self", title: "Check this out", url: "https://example.com", sender_iden: "sender-1" };
      installFetch({
        "POST https://api.pushbullet.com/v2/pushes": mockResponse(created),
      });
      const out = await run({
        resource: "push",
        operation: "create",
        pushType: "link",
        title: "Check this out",
        url: "https://example.com",
        target: "email",
        email: "user@example.com",
      });
      expect(calls).toHaveLength(1);
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({ type: "link", title: "Check this out", url: "https://example.com", email: "user@example.com" });
      expect(out[0][0].json).toMatchObject({ iden: "push-xyz", type: "link" });
    });
  });

  describe("getAll", () => {
    it("returns pushes with limit", async () => {
      const pushes = [
        { iden: "push-1", active: true, type: "note", title: "First", body: "Hello", created: 1.0, modified: 1.0, direction: "self", sender_iden: "s1" },
        { iden: "push-2", active: true, type: "note", title: "Second", body: "World", created: 2.0, modified: 2.0, direction: "self", sender_iden: "s1" },
      ];
      installFetch({
        "GET https://api.pushbullet.com/v2/pushes?active=true&limit=10": mockResponse({ pushes }),
      });
      const out = await run({
        resource: "push",
        operation: "getAll",
        returnAll: false,
        limit: 10,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://api.pushbullet.com/v2/pushes?active=true&limit=10");
      expect(out[0][0].json).toMatchObject({ pushes });
    });
  });

  describe("delete", () => {
    it("deletes a push and returns empty object", async () => {
      installFetch({
        "DELETE https://api.pushbullet.com/v2/pushes/ujpah72o0sjAoRtnM0jc": mockResponse(null, { status: 200 }),
      });
      const out = await run({
        resource: "push",
        operation: "delete",
        pushId: "ujpah72o0sjAoRtnM0jc",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toBe("https://api.pushbullet.com/v2/pushes/ujpah72o0sjAoRtnM0jc");
      expect(out[0][0].json).toEqual({});
    });

    it("throws when pushId is missing", async () => {
      await expect(
        run({
          resource: "push",
          operation: "delete",
          pushId: "",
        }),
      ).rejects.toThrow("Pushbullet: pushId is required for delete");
    });
  });

  describe("update", () => {
    it("marks a push as dismissed", async () => {
      const updated = { iden: "ujpah72o0sjAoRtnM0jc", active: true, dismissed: true, type: "note", title: "Test", body: "Hello", created: 1.0, modified: 2.0, direction: "self", sender_iden: "s1" };
      installFetch({
        "POST https://api.pushbullet.com/v2/pushes/ujpah72o0sjAoRtnM0jc": mockResponse(updated),
      });
      const out = await run({
        resource: "push",
        operation: "update",
        pushId: "ujpah72o0sjAoRtnM0jc",
        dismissed: true,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://api.pushbullet.com/v2/pushes/ujpah72o0sjAoRtnM0jc");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toEqual({ dismissed: true });
      expect(out[0][0].json).toMatchObject({ iden: "ujpah72o0sjAoRtnM0jc", dismissed: true });
    });
  });

  describe("errors", () => {
    it("throws on missing credential", async () => {
      await expect(
        run(
          { resource: "push", operation: "create", pushType: "note", title: "Test" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow("Pushbullet: pushbulletOAuth2Api credential is required");
    });

    it("continueOnFail returns error items", async () => {
      installFetch({
        "POST https://api.pushbullet.com/v2/pushes": mockResponse(
          { error: { message: "unauthorized", type: "invalid_request" } },
          { status: 401 },
        ),
      });
      const out = await run(
        {
          resource: "push",
          operation: "create",
          pushType: "note",
          title: "Fail",
        },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({ message: expect.stringContaining("unauthorized") });
    });

    it("continueOnFail returns error item for missing pushId on delete", async () => {
      const out = await run(
        {
          resource: "push",
          operation: "delete",
          pushId: "",
        },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({
        message: expect.stringContaining("Pushbullet: pushId is required for delete"),
      });
    });
  });
});