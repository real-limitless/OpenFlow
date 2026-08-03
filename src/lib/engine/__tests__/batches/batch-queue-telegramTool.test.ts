import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import type { INode } from "@/lib/workflow/types";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.telegramTool";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockTelegramOk(result: unknown): ReturnType<typeof mockResponse> {
  return mockResponse({ ok: true, result });
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
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
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
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
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
        body: typeof init?.body === "string" ? init.body : init?.body instanceof FormData ? "[FormData]" : undefined,
      });
      const next = responseQueue.shift() ?? mockResponse({});
      return next;
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

const CREDS = { telegramApi: { accessToken: "test:bot_token" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue telegramTool — n8n-nodes-base.telegramTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc!.displayName).toBe("Telegram Tool");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.telegramTool")).toBe(canonical);
  });

  it("sendMessage — sends a text message", async () => {
    installFetch(mockTelegramOk({
      message_id: 123,
      chat: { id: -1001234567890, type: "channel", title: "Test Channel" },
      date: 1700000000,
      text: "Hello from workflow",
    }));

    const out = await run({
      resource: "message",
      operation: "sendMessage",
      chatId: "@testchannel",
      text: "Hello from workflow",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toMatch(/\/bottest:bot_token\/sendMessage$/);
    const body = JSON.parse(calls[0].body!);
    expect(body.chat_id).toBe("@testchannel");
    expect(body.text).toBe("Hello from workflow");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.message_id).toBe(123);
    expect(out[0][0].json.chat.id).toBe(-1001234567890);
    expect(out[0][0].json.text).toBe("Hello from workflow");
  });

  it("getAdministrators — gets chat admins", async () => {
    installFetch(mockTelegramOk([
      { user: { id: 123456, is_bot: false, first_name: "Admin" }, status: "creator" },
    ]));

    const out = await run({
      resource: "chat",
      operation: "getAdministrators",
      chatId: "@testchannel",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/getChatAdministrators$/);
    const body = JSON.parse(calls[0].body!);
    expect(body.chat_id).toBe("@testchannel");

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toBeInstanceOf(Array);
    expect(out[0][0].json[0].user.id).toBe(123456);
  });

  it("answerQuery — answers a callback query", async () => {
    installFetch(mockTelegramOk({ success: true }));

    const out = await run({
      resource: "callback",
      operation: "answerQuery",
      queryId: "1234567890",
      additionalFields: { text: "Action completed" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/answerCallbackQuery$/);
    const body = JSON.parse(calls[0].body!);
    expect(body.callback_query_id).toBe("1234567890");
    expect(body.text).toBe("Action completed");

    expect(out[0][0].json.success).toBe(true);
  });

  it("fails when credential is missing", async () => {
    await expect(
      run(
        { resource: "message", operation: "sendMessage", chatId: "@x", text: "hi" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/telegramApi credential is not configured/);
  });

  it("fails when chatId is missing", async () => {
    await expect(
      run({ resource: "chat", operation: "get", chatId: "" }),
    ).rejects.toThrow(/chatId is required/);
  });

  it("continueOnFail yields error item", async () => {
    installFetch(mockResponse({ ok: false, description: "Chat not found" }, { status: 400 }));
    const out = await run(
      { resource: "chat", operation: "get", chatId: "@nonexistent" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toMatch(/Telegram/);
  });

  it("resolves expression parameters from input items", async () => {
    installFetch(mockTelegramOk({ message_id: 456, text: "Hello dynamic" }));

    const out = await run(
      {
        resource: "message",
        operation: "sendMessage",
        chatId: "={{ $json.chatId }}",
        text: "={{ $json.text }}",
      },
      [{ json: { chatId: "@dynamic", text: "Hello dynamic" } }],
    );

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body!);
    expect(body.chat_id).toBe("@dynamic");
    expect(body.text).toBe("Hello dynamic");
    expect(out[0][0].json.message_id).toBe(456);
  });

  it("sendPhoto — sends a photo from binaryFile+binaryPropertyName", async () => {
    installFetch(mockTelegramOk({
      message_id: 124,
      chat: { id: -1001234567890, type: "channel", title: "Test Channel" },
      date: 1700000001,
      photo: [{ file_id: "AgAD...", file_size: 1234, width: 320, height: 240 }],
    }));

    const out = await run(
      {
        resource: "message",
        operation: "sendPhoto",
        chatId: "@testchannel",
        binaryFile: true,
        binaryPropertyName: "photo",
      },
      [
        {
          json: {},
          binary: {
            photo: {
              data: btoa("fake-image-data"),
              mimeType: "image/jpeg",
              fileName: "image.jpg",
            },
          },
        },
      ],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/sendPhoto$/);
    expect(calls[0].body).toBeDefined();
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.message_id).toBe(124);
    expect(out[0][0].json.photo[0].file_id).toBe("AgAD...");
  });

  it("sendMediaGroup — sends multiple media items", async () => {
    installFetch(mockTelegramOk([
      { message_id: 1, date: 1700000000, photo: [{ file_id: "f1" }] },
      { message_id: 2, date: 1700000001, video: [{ file_id: "f2" }] },
    ]));

    const out = await run({
      resource: "message",
      operation: "sendMediaGroup",
      chatId: "@testchannel",
      media: {
        values: [
          { type: "photo", media: "https://example.com/photo.jpg", caption: "A photo" },
          { type: "video", media: "https://example.com/video.mp4" },
        ],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/sendMediaGroup$/);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toBeDefined();
  });

  it("file.get — gets file metadata without download", async () => {
    installFetch(mockTelegramOk({
      file_id: "abc123",
      file_unique_id: "xyz789",
      file_size: 1234,
      file_path: "photos/photo.jpg",
    }));

    const out = await run({
      resource: "file",
      operation: "get",
      fileId: "abc123",
      download: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/getFile$/);
    const body = JSON.parse(calls[0].body!);
    expect(body.file_id).toBe("abc123");
    expect(out[0][0].json.file_id).toBe("abc123");
  });
});
