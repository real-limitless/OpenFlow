import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.matrix";

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
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
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
      return text ? JSON.parse(text) : null;
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
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse({ ok: true }),
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

const CREDS = { matrixApi: { accessToken: "tok_123", homeserverUrl: "https://matrix-client.matrix.org" } };

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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue matrix — n8n-nodes-base.matrix", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Matrix");
  });

  it("account:me — get current user", async () => {
    installFetch({
      "GET https://matrix-client.matrix.org/_matrix/client/v3/account/whoami": mockResponse({
        user_id: "@test:matrix.org",
        device_id: "DEVICE1",
        is_guest: false,
      }),
    });
    const out = await run({ resource: "account", operation: "me" }, [{}]);
    expect(out[0][0].json).toMatchObject({ user_id: "@test:matrix.org" });
    expect(calls[0].headers.Authorization).toBe("Bearer tok_123");
  });

  it("message:create — send text message", async () => {
    const baseUrl = "https://matrix-client.matrix.org/_matrix/client/v3/rooms/!test%3Amatrix.org/send/m.room.message/";
    // Use a route prefix check: the full URL includes a random txnId
    installFetch({});
    const out = await run(
      {
        resource: "message",
        operation: "create",
        roomId: "!test:matrix.org",
        text: "Hello from n8n",
        messageType: "m.text",
        messageFormat: "plain",
      },
      [{}],
      { credentials: { matrixApi: { accessToken: "tok_123", homeserverUrl: "https://matrix-client.matrix.org" } } },
    );
    // Mock returns { ok: true } by default, so we just check the call shape
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("/_matrix/client/v3/rooms/!test%3Amatrix.org/send/m.room.message/");
    const body = JSON.parse(calls[0].body as string);
    expect(body).toMatchObject({ body: "Hello from n8n", msgtype: "m.text" });
    expect(out[0][0].json).toHaveProperty("ok");
  });

  it("message:getAll — paginated messages", async () => {
    installFetch({
      "GET https://matrix-client.matrix.org/_matrix/client/v3/rooms/!test%3Amatrix.org/messages?dir=f&limit=10": mockResponse({
        chunk: [
          { event_id: "e1", type: "m.room.message", sender: "@user1:matrix.org", content: { body: "hi" }, origin_server_ts: 1000, room_id: "!test:matrix.org", user_id: "@user1:matrix.org", unsigned: {} },
          { event_id: "e2", type: "m.room.message", sender: "@user2:matrix.org", content: { body: "hello" }, origin_server_ts: 1001, room_id: "!test:matrix.org", user_id: "@user2:matrix.org", unsigned: {} },
        ],
      }),
    });
    const out = await run(
      {
        resource: "message",
        operation: "getAll",
        roomId: "!test:matrix.org",
        returnAll: false,
        limit: 10,
      },
      [{}],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ event_id: "e1", type: "m.room.message", sender: "@user1:matrix.org" });
    expect(out[0][1].json).toMatchObject({ event_id: "e2", type: "m.room.message", sender: "@user2:matrix.org" });
  });

  it("room:create — new public room", async () => {
    installFetch({
      "POST https://matrix-client.matrix.org/_matrix/client/v3/createRoom": mockResponse({
        room_id: "!newroom:matrix.org",
      }),
    });
    const out = await run(
      {
        resource: "room",
        operation: "create",
        roomName: "Test Room",
        preset: "public_chat",
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ room_id: "!newroom:matrix.org" });
    const body = JSON.parse(calls[0].body as string);
    expect(body).toMatchObject({ name: "Test Room", preset: "public_chat" });
  });

  it("room:join — join room", async () => {
    installFetch({
      "POST https://matrix-client.matrix.org/_matrix/client/v3/join/%23myroom%3Amatrix.org": mockResponse({
        room_id: "!joined:matrix.org",
      }),
    });
    const out = await run(
      {
        resource: "room",
        operation: "join",
        roomIdOrAlias: "#myroom:matrix.org",
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ room_id: "!joined:matrix.org" });
  });

  it("room:invite — invite user", async () => {
    installFetch({
      "POST https://matrix-client.matrix.org/_matrix/client/v3/rooms/!test%3Amatrix.org/invite": mockResponse({}),
    });
    const out = await run(
      {
        resource: "room",
        operation: "invite",
        roomId: "!test:matrix.org",
        userId: "@user:matrix.org",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({});
    const body = JSON.parse(calls[0].body as string);
    expect(body).toMatchObject({ user_id: "@user:matrix.org" });
  });

  it("room:kick — kick user", async () => {
    installFetch({
      "POST https://matrix-client.matrix.org/_matrix/client/v3/rooms/!test%3Amatrix.org/kick": mockResponse({}),
    });
    const out = await run(
      {
        resource: "room",
        operation: "kick",
        roomId: "!test:matrix.org",
        userId: "@user:matrix.org",
        reason: "spam",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({});
    const body = JSON.parse(calls[0].body as string);
    expect(body).toMatchObject({ user_id: "@user:matrix.org", reason: "spam" });
  });

  it("room:leave — leave room", async () => {
    installFetch({
      "POST https://matrix-client.matrix.org/_matrix/client/v3/rooms/!test%3Amatrix.org/leave": mockResponse({}),
    });
    const out = await run(
      {
        resource: "room",
        operation: "leave",
        roomId: "!test:matrix.org",
      },
      [{}],
    );
    expect(out[0][0].json).toEqual({});
  });

  it("roomMember:getAll — list members filtered by membership", async () => {
    installFetch({
      "GET https://matrix-client.matrix.org/_matrix/client/v3/rooms/!test%3Amatrix.org/members?membership=join": mockResponse({
        chunk: [
          { content: { membership: "join" }, state_key: "@user1:matrix.org", type: "m.room.member", event_id: "e1", origin_server_ts: 1000, sender: "@user1:matrix.org", room_id: "!test:matrix.org", unsigned: {}, user_id: "@user1:matrix.org" },
        ],
      }),
    });
    const out = await run(
      {
        resource: "roomMember",
        operation: "getAll",
        roomId: "!test:matrix.org",
        filters: { membership: "join" },
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ content: { membership: "join" } });
  });

  it("event:get — get event", async () => {
    installFetch({
      "GET https://matrix-client.matrix.org/_matrix/client/v3/rooms/!test%3Amatrix.org/event/%24event123%3Amatrix.org": mockResponse({
        event_id: "$event123:matrix.org",
        type: "m.room.message",
        sender: "@user:matrix.org",
        content: { body: "hello" },
      }),
    });
    const out = await run(
      {
        resource: "event",
        operation: "get",
        roomId: "!test:matrix.org",
        eventId: "$event123:matrix.org",
      },
      [{}],
    );
    expect(out[0][0].json).toMatchObject({ event_id: "$event123:matrix.org" });
  });

  it("media:upload — upload binary file to a room", async () => {
    installFetch(
      {
        "POST https://matrix-client.matrix.org/_matrix/media/v3/upload": mockResponse({ content_uri: "mxc://test.image" }),
      },
      mockResponse({ event_id: "$event_upload123" }),
    );
    const out = await run(
      {
        resource: "media",
        operation: "upload",
        roomId: "!test:matrix.org",
        binaryPropertyName: "data",
        mediaType: "image",
      },
      [{ json: {}, binary: { data: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" } } }],
    );
    expect(out[0][0].json).toHaveProperty("event_id");
    expect(out[0][0].json.event_id).toBe("$event_upload123");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://matrix-client.matrix.org/_matrix/media/v3/upload");
    expect(calls[0].headers.Authorization).toBe("Bearer tok_123");
    expect(calls[0].headers["Content-Type"]).toBe("image/png");
    expect(calls[1].method).toBe("PUT");
    expect(calls[1].url).toContain("/_matrix/client/v3/rooms/!test%3Amatrix.org/send/m.room.message/");
    const msgBody = JSON.parse(calls[1].body as string);
    expect(msgBody).toMatchObject({ msgtype: "m.image", url: "mxc://test.image" });
  });

  it("media:upload — throws on missing binary data", async () => {
    await expect(
      run(
        {
          resource: "media",
          operation: "upload",
          roomId: "!test:matrix.org",
          binaryPropertyName: "data",
          mediaType: "image",
        },
        [{}],
      ),
    ).rejects.toThrow(/binary data not found/);
  });

  it("media:upload — uses optional fileName on upload URL", async () => {
    installFetch(
      {
        "POST https://matrix-client.matrix.org/_matrix/media/v3/upload?filename=photo.png": mockResponse({ content_uri: "mxc://test.photo" }),
      },
      mockResponse({ event_id: "$event_photo123" }),
    );
    const out = await run(
      {
        resource: "media",
        operation: "upload",
        roomId: "!test:matrix.org",
        binaryPropertyName: "data",
        mediaType: "image",
        additionalFields: { fileName: "photo.png" },
      },
      [{ json: {}, binary: { data: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" } } }],
    );
    expect(out[0][0].json).toHaveProperty("event_id");
    expect(calls[0].url).toContain("filename=photo.png");
  });

  it("continueOnFail — handles API error gracefully", async () => {
    installFetch({
      "GET https://matrix-client.matrix.org/_matrix/client/v3/account/whoami": mockResponse(
        { errcode: "M_UNKNOWN_TOKEN", error: "Invalid access token" },
        { status: 401 },
      ),
    });
    const out = await run(
      { resource: "account", operation: "me" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("M_UNKNOWN_TOKEN") });
  });
});