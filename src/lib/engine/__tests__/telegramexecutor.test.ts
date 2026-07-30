import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../executors";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "./helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.telegram";

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
    async arrayBuffer() {
      return new TextEncoder().encode(text).buffer;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | FormData | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(
  response: ReturnType<typeof mockResponse> = mockResponse({ ok: true, result: true }),
) {
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
        body:
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof FormData
              ? init.body
              : undefined,
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

const CREDS = { telegramApi: { accessToken: "123456:ABC-DEF_token" } };

const SEND_MESSAGE_RESULT = {
  message_id: 42,
  chat: { id: 456, type: "private", title: "Example" },
  date: 1700000000,
  text: "Hello from n8n",
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("telegram executor — n8n-nodes-base.telegram", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Telegram");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.telegram")).toBe(canonical);
  });

  it("sends a message via POST /sendMessage with parse_mode and disable_notification", async () => {
    installFetch(mockResponse({ ok: true, result: SEND_MESSAGE_RESULT }));
    const out = await run({
      resource: "message",
      operation: "sendMessage",
      chatId: "@example_channel",
      text: "Hello from n8n",
      additionalFields: {
        parseMode: "markdown",
        disableNotification: false,
        appendAttribution: false,
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.telegram.org/bot123456:ABC-DEF_token/sendMessage");
    expect(JSON.parse(calls[0].body as string)).toEqual({
      chat_id: "@example_channel",
      text: "Hello from n8n",
      parse_mode: "Markdown",
      disable_notification: false,
    });
    expect(out[0][0].json).toMatchObject({
      message_id: 42,
      chat: { id: 456 },
    });
  });

  it("appends n8n attribution by default to sendMessage", async () => {
    installFetch(mockResponse({ ok: true, result: SEND_MESSAGE_RESULT }));
    await run({
      resource: "message",
      operation: "sendMessage",
      chatId: "123456789",
      text: "Hi",
    });

    const body = JSON.parse(calls[0].body as string);
    expect(body.text).toBe("Hi\n\nThis message was sent automatically with n8n");
  });

  it("gets chat via POST /getChat", async () => {
    const chatResult = {
      id: 456,
      type: "private",
      title: "Example",
      username: "example_channel",
    };
    installFetch(mockResponse({ ok: true, result: chatResult }));
    const out = await run({
      resource: "chat",
      operation: "get",
      chatId: "@example_channel",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.telegram.org/bot123456:ABC-DEF_token/getChat");
    expect(JSON.parse(calls[0].body as string)).toEqual({ chat_id: "@example_channel" });
    expect(out[0][0].json).toMatchObject({ id: 456, type: "private" });
  });

  it("gets chat administrators and returns an array", async () => {
    const admins = [
      { user: { id: 1, is_bot: false, first_name: "Alice" }, status: "creator" },
      { user: { id: 2, is_bot: true, first_name: "Bot" }, status: "administrator" },
    ];
    installFetch(mockResponse({ ok: true, result: admins }));
    const out = await run({
      resource: "chat",
      operation: "getAdministrators",
      chatId: "@example_channel",
    });

    expect(calls[0].url).toBe(
      "https://api.telegram.org/bot123456:ABC-DEF_token/getChatAdministrators",
    );
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect(out[0][0].json).toHaveLength(2);
  });

  it("gets file metadata via POST /getFile (download=false)", async () => {
    const fileResult = {
      file_id: "AgACAgIAAxk...",
      file_unique_id: "AQAT_unique",
      file_size: 1234,
      file_path: "photos/file_1.jpg",
    };
    installFetch(mockResponse({ ok: true, result: fileResult }));
    const out = await run({
      resource: "file",
      operation: "get",
      fileId: "AgACAgIAAxk...",
      download: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/bot123456:ABC-DEF_token/getFile");
    expect(JSON.parse(calls[0].body as string)).toEqual({ file_id: "AgACAgIAAxk..." });
    expect(out[0][0].json).toMatchObject({
      file_id: "AgACAgIAAxk...",
      file_path: "photos/file_1.jpg",
    });
    expect(out[0][0].binary).toBeUndefined();
  });

  it("downloads file bytes when download=true (two HTTPS calls)", async () => {
    const fileResult = {
      file_id: "AgACAgIAAxk...",
      file_path: "photos/file_1.jpg",
    };
    const fileBytes = "FAKE_IMAGE_BYTES";
    let callIdx = 0;
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
        callIdx += 1;
        if (callIdx === 1) return mockResponse({ ok: true, result: fileResult });
        return mockResponse(fileBytes, { contentType: "image/jpeg" });
      }),
    );

    const out = await run({
      resource: "file",
      operation: "get",
      fileId: "AgACAgIAAxk...",
      download: true,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.telegram.org/bot123456:ABC-DEF_token/getFile");
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toBe(
      "https://api.telegram.org/file/bot123456:ABC-DEF_token/photos/file_1.jpg",
    );
    expect(out[0][0].json).toMatchObject({ file_id: "AgACAgIAAxk..." });
    expect(out[0][0].binary?.data).toBeDefined();
    expect(out[0][0].binary?.data.fileName).toBe("file_1.jpg");
  });

  it("sends a photo from binary as multipart/form-data", async () => {
    installFetch(mockResponse({ ok: true, result: { message_id: 7, photo: [{ file_id: "p1" }] } }));
    const out = await run(
      {
        resource: "message",
        operation: "sendPhoto",
        chatId: "123456789",
        binaryFile: true,
        binaryPropertyName: "data",
        additionalFields: { caption: "Look" },
      },
      [
        {
          json: {},
          binary: { data: { mimeType: "image/png", data: "iVBORw0KGgo=", fileName: "pic.png" } },
        },
      ],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.telegram.org/bot123456:ABC-DEF_token/sendPhoto");
    expect(calls[0].body).toBeInstanceOf(FormData);
    const form = calls[0].body as FormData;
    expect(form.get("chat_id")).toBe("123456789");
    expect(form.get("caption")).toBe("Look");
    expect(form.get("photo")).toBeInstanceOf(Blob);
    expect(out[0][0].json).toMatchObject({ message_id: 7 });
  });

  it("sends a photo by file_id/URL as JSON", async () => {
    installFetch(mockResponse({ ok: true, result: { message_id: 8 } }));
    await run({
      resource: "message",
      operation: "sendPhoto",
      chatId: "123456789",
      binaryFile: false,
      photo: "AgACAgIAAxk_photo_id",
      additionalFields: { caption: "Look" },
    });

    expect(JSON.parse(calls[0].body as string)).toEqual({
      chat_id: "123456789",
      photo: "AgACAgIAAxk_photo_id",
      caption: "Look",
    });
  });

  it("send and wait — sends message with inline keyboard then passes through input", async () => {
    installFetch(mockResponse({ ok: true, result: SEND_MESSAGE_RESULT }));
    const out = await run(
      {
        resource: "message",
        operation: "sendAndWait",
        chatId: "@example_channel",
        message: "Approve?",
        responseType: "approval",
        typeOfApproval: "double",
        buttonLabel: "Approve",
        declineButtonLabel: "Decline",
        limitWaitTime: false,
      },
      [{ requestId: "REQ-1" }],
    );

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body as string);
    expect(body.chat_id).toBe("@example_channel");
    expect(body.text).toBe("Approve?");
    const markup = JSON.parse(body.reply_markup);
    expect(markup.inline_keyboard[0]).toHaveLength(2);
    expect(markup.inline_keyboard[0][0].text).toBe("Approve");
    expect(markup.inline_keyboard[0][1].text).toBe("Decline");
    // TODO: wait/resume not implemented; input item passed through
    expect(out[0][0].json).toMatchObject({ requestId: "REQ-1" });
  });

  it("throws when telegramApi credential is missing", async () => {
    await expect(
      run(
        {
          resource: "message",
          operation: "sendMessage",
          chatId: "@example_channel",
          text: "Hi",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/telegramApi credential is not configured/);
  });

  it("throws on Telegram API error (ok=false)", async () => {
    installFetch(mockResponse({ ok: false, description: "Bad Request: chat not found" }));
    await expect(
      run({
        resource: "message",
        operation: "sendMessage",
        chatId: "@nope",
        text: "Hi",
      }),
    ).rejects.toThrow(/chat not found/);
  });

  it("throws on HTTP error status", async () => {
    installFetch(mockResponse({ ok: false, description: "Unauthorized" }, { status: 401 }));
    await expect(
      run({
        resource: "message",
        operation: "sendMessage",
        chatId: "@nope",
        text: "Hi",
      }),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ ok: false, description: "chat not found" }, { status: 400 }));
    const out = await run(
      {
        resource: "message",
        operation: "sendMessage",
        chatId: "@nope",
        text: "Hi",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json).toHaveProperty("message");
  });

  it("throws when chatId is missing for sendMessage", async () => {
    await expect(
      run({
        resource: "message",
        operation: "sendMessage",
        text: "Hi",
      }),
    ).rejects.toThrow(/chatId is required/);
  });

  it("makes one request per input item with expression resolution", async () => {
    installFetch(mockResponse({ ok: true, result: SEND_MESSAGE_RESULT }));
    await run(
      {
        resource: "message",
        operation: "sendMessage",
        chatId: "={{ $json.chatId }}",
        text: "Hi {{ $json.name }}",
        additionalFields: { appendAttribution: false },
      },
      [
        { chatId: "111", name: "Alice" },
        { chatId: "222", name: "Bob" },
      ],
    );

    expect(calls).toHaveLength(2);
    const body0 = JSON.parse(calls[0].body as string);
    const body1 = JSON.parse(calls[1].body as string);
    expect(body0.chat_id).toBe("111");
    expect(body0.text).toBe("Hi Alice");
    expect(body1.chat_id).toBe("222");
    expect(body1.text).toBe("Hi Bob");
  });
});
