import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gmail";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ id: "msg-id" })) {
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

const CREDS = { gmailOAuth2: { accessToken: "ya29.token_123" } };

const SEND_RESPONSE = { id: "msg-id", threadId: "thread-id", labelIds: ["SENT"] };

const SIMPLE_MSG_RESPONSE = {
  id: "172ce2c4a72cc243",
  threadId: "thread-id",
  labelIds: ["INBOX"],
  snippet: "Hello",
  payload: {
    headers: [
      { name: "From", value: "sender@example.com" },
      { name: "To", value: "me@example.com" },
      { name: "Subject", value: "Test" },
      { name: "Date", value: "2024-01-01T00:00:00.000Z" },
    ],
    parts: [{ mimeType: "text/plain", body: { data: btoa("Hello world") } }],
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue gmail — n8n-nodes-base.gmail", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Gmail");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.gmail")).toBe(canonical);
  });

  it("sends a text message via POST /messages/send", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run({
      resource: "message",
      operation: "send",
      sendTo: "recipient@example.com",
      subject: "Test from n8n",
      emailType: "text",
      message: "Hello world",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(calls[0].headers["Authorization"]).toBe("Bearer ya29.token_123");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toHaveProperty("raw");
    expect(out[0][0].json).toMatchObject({
      id: "msg-id",
      threadId: "thread-id",
      labelIds: ["SENT"],
    });
  });

  it("sends a message with attachments via multipart MIME", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run(
      {
        resource: "message",
        operation: "send",
        sendTo: "recipient@example.com",
        subject: "With attachment",
        emailType: "text",
        message: "See attached",
        options: {
          attachmentsUi: {
            attachmentsBinary: [{ property: "data" }],
          },
        },
      },
      [
        {
          json: {},
          binary: {
            data: {
              mimeType: "text/plain",
              fileName: "test.txt",
              data: btoa("file content"),
            },
          },
        },
      ],
    );

    expect(calls).toHaveLength(1);
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toHaveProperty("raw");
    expect(out[0][0].json).toMatchObject({
      id: "msg-id",
      threadId: "thread-id",
      labelIds: ["SENT"],
    });
  });

  it("gets a message in simplified form", async () => {
    installFetch(mockResponse(SIMPLE_MSG_RESPONSE));
    const out = await run(
      {
        resource: "message",
        operation: "get",
        messageId: "={{ $json.messageId }}",
        simple: true,
      },
      [{ messageId: "172ce2c4a72cc243" }],
    );

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/172ce2c4a72cc243",
    );
    expect(out[0][0].json).toMatchObject({
      id: "172ce2c4a72cc243",
      threadId: "thread-id",
      from: "sender@example.com",
      to: "me@example.com",
      subject: "Test",
      date: "2024-01-01T00:00:00.000Z",
      snippet: "Hello",
      body: "Hello world",
    });
  });

  it("gets many messages with filters", async () => {
    const listResponse = {
      messages: [
        { id: "msg-1", threadId: "t1" },
        { id: "msg-2", threadId: "t2" },
      ],
    };
    const msg1 = {
      id: "msg-1",
      threadId: "t1",
      snippet: "Has attachment",
      payload: {
        headers: [{ name: "Subject", value: "Has attachment" }],
        parts: [
          { mimeType: "text/plain", body: { data: "" } },
          { headers: { "Content-Disposition": "attachment" }, body: { data: "" } },
        ],
      },
    };
    const msg2 = {
      id: "msg-2",
      threadId: "t2",
      snippet: "Another",
      payload: {
        headers: [{ name: "Subject", value: "Another" }],
        parts: [{ headers: { "Content-Disposition": "attachment" }, body: { data: "" } }],
      },
    };
    const responses = [mockResponse(listResponse), mockResponse(msg1), mockResponse(msg2)];
    let idx = 0;
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
        return responses[idx++] ?? responses[responses.length - 1];
      }),
    );

    const out = await run({
      resource: "message",
      operation: "getAll",
      returnAll: false,
      limit: 10,
      simple: true,
      filters: {
        q: "has:attachment",
        readStatus: "unread",
        labelIds: ["INBOX"],
      },
    });

    expect(calls[0].url).toContain("/messages?");
    expect(calls[0].url).toContain("q=has%3Aattachment+is%3Aunread");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({
      id: "msg-1",
      threadId: "t1",
      subject: "Has attachment",
      hasAttachments: true,
    });
    expect(out[0][1].json).toMatchObject({
      id: "msg-2",
      threadId: "t2",
      subject: "Another",
      hasAttachments: true,
    });
  });

  it("creates a label", async () => {
    installFetch(
      mockResponse({
        id: "Label_123",
        name: "Invoices",
        type: "user",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    );
    const out = await run({
      resource: "label",
      operation: "create",
      name: "Invoices",
      options: {
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/labels");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({
      name: "Invoices",
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    });
    expect(out[0][0].json).toMatchObject({
      id: "Label_123",
      name: "Invoices",
      type: "user",
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    });
  });

  it("creates a draft with threadId", async () => {
    installFetch(
      mockResponse({
        id: "draft-id",
        message: { id: "msg-id", threadId: "18cc573e2431878f" },
      }),
    );
    const out = await run(
      {
        resource: "draft",
        operation: "create",
        subject: "Re: Your email",
        emailType: "html",
        message: "<p>Thanks for your email</p>",
        options: {
          threadId: "={{ $json.threadId }}",
          sendTo: "sender@example.com",
        },
      },
      [{ threadId: "18cc573e2431878f" }],
    );

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.message.threadId).toBe("18cc573e2431878f");
    expect(sentBody.message).toHaveProperty("raw");
    expect(out[0][0].json).toMatchObject({
      id: "draft-id",
      message: { id: "msg-id", threadId: "18cc573e2431878f" },
    });
  });

  it("replies to a message in a thread", async () => {
    const origMsg = {
      id: "msg-123",
      threadId: "18cc573e2431878f",
      payload: {
        headers: [
          { name: "From", value: "sender@example.com" },
          { name: "Subject", value: "Info" },
          { name: "Message-Id", value: "<abc@mail.example>" },
        ],
      },
    };
    const responses = [
      mockResponse(origMsg),
      mockResponse({ id: "reply-msg-id", threadId: "18cc573e2431878f", labelIds: ["SENT"] }),
    ];
    let idx = 0;
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
        return responses[idx++] ?? responses[responses.length - 1];
      }),
    );

    const out = await run(
      {
        resource: "thread",
        operation: "reply",
        threadId: "={{ $json.threadId }}",
        messageId: "={{ $json.messageId }}",
        emailType: "text",
        message: "Thanks for the info",
        options: {
          replyToSenderOnly: true,
        },
      },
      [{ threadId: "18cc573e2431878f", messageId: "msg-123" }],
    );

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/messages/msg-123");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    const sentBody = JSON.parse(calls[1].body as string);
    expect(sentBody.threadId).toBe("18cc573e2431878f");
    expect(sentBody).toHaveProperty("raw");
    expect(out[0][0].json).toMatchObject({
      id: "reply-msg-id",
      threadId: "18cc573e2431878f",
      labelIds: ["SENT"],
    });
  });

  it("sendAndWait sends message and passes through input item", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run(
      {
        resource: "message",
        operation: "sendAndWait",
        sendTo: "={{ $json.replyTo }}",
        subject: "Please confirm",
        emailType: "text",
        message: "Reply YES to confirm",
      },
      [{ replyTo: "user@example.com" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    // TODO: wait/resume not implemented; input item passed through
    expect(out[0][0].json).toMatchObject({ replyTo: "user@example.com" });
  });

  it("continueOnFail emits error item on 404 and continues", async () => {
    const responses = [
      mockResponse({ error: { message: "Request failed with status code 404" } }, { status: 404 }),
      mockResponse({
        id: "valid-id",
        threadId: "t1",
        snippet: "Valid",
        payload: {
          headers: [{ name: "Subject", value: "Valid message" }],
          parts: [],
        },
      }),
    ];
    let idx = 0;
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
        return responses[idx++] ?? responses[responses.length - 1];
      }),
    );

    const out = await run(
      {
        resource: "message",
        operation: "get",
        messageId: "={{ $json.messageId }}",
        simple: true,
      },
      [{ messageId: "invalid" }, { messageId: "valid-id" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toContain("404");
    expect(out[0][1].json).toMatchObject({ id: "valid-id", subject: "Valid message" });
  });

  it("deletes a message and returns success", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      resource: "message",
      operation: "delete",
      messageId: "msg-123",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-123");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("marks a message as read (removes UNREAD label)", async () => {
    installFetch(mockResponse({ id: "msg-1", labelIds: ["INBOX"] }));
    const out = await run({
      resource: "message",
      operation: "markAsRead",
      messageId: "msg-1",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1/modify",
    );
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ addLabelIds: [], removeLabelIds: ["UNREAD"] });
    expect(out[0][0].json).toMatchObject({ id: "msg-1" });
  });

  it("adds labels to a message", async () => {
    installFetch(mockResponse({ id: "msg-1", labelIds: ["INBOX", "Label_1"] }));
    const out = await run({
      resource: "message",
      operation: "addLabels",
      messageId: "msg-1",
      labelIds: ["Label_1"],
    });

    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ addLabelIds: ["Label_1"], removeLabelIds: [] });
    expect(out[0][0].json).toMatchObject({ id: "msg-1" });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "message",
          operation: "send",
          sendTo: "recipient@example.com",
          subject: "Test",
          emailType: "text",
          message: "Hi",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/gmailOAuth2 credential is not configured/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ error: { message: "Invalid grant" } }, { status: 401 }));
    await expect(
      run({
        resource: "message",
        operation: "get",
        messageId: "msg-1",
        simple: true,
      }),
    ).rejects.toThrow(/Invalid grant/);
  });

  it("makes one request per input item for send", async () => {
    await run(
      {
        resource: "message",
        operation: "send",
        sendTo: "={{ $json.email }}",
        subject: "Hi {{ $json.name }}",
        emailType: "text",
        message: "Hello",
      },
      [
        { email: "a@example.com", name: "Alice" },
        { email: "b@example.com", name: "Bob" },
      ],
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe("POST");
    expect(calls[1].method).toBe("POST");
  });
});
