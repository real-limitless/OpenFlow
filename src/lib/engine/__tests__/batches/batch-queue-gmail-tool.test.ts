import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gmailTool";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ id: "msg-id" })) {
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
      return response;
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

const CREDS = { gmailOAuth2: { accessToken: "ya29.token_123" } };
const SEND_RESPONSE = { id: "msg-id", threadId: "thread-id", labelIds: ["SENT"] };

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

const SIMPLE_MSG_RESPONSE = {
  id: "172ce2c4a72cc243",
  threadId: "thread-id",
  labelIds: ["INBOX"],
  snippet: "Hello from n8n workflow",
  payload: {
    headers: [
      { name: "From", value: "sender@example.com" },
      { name: "To", value: "me@example.com" },
      { name: "Subject", value: "Automated greeting" },
      { name: "Date", value: "2024-01-01T00:00:00.000Z" },
    ],
    parts: [{ mimeType: "text/plain", body: { data: btoa("Hello from n8n workflow") } }],
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue gmailTool — n8n-nodes-base.gmailTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Gmail (AI Tool)");
  });

  // Acceptance: Send a simple text message
  it("sends a text message via POST /messages/send", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run({
      resource: "message",
      operation: "send",
      sendTo: "recipient@example.com",
      subject: "Automated greeting",
      emailType: "text",
      message: "Hello from n8n workflow",
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

  // Acceptance: Get Many messages with read status filter
  it("gets many messages with unread filter", async () => {
    const listResponse = {
      messages: [
        { id: "msg-1", threadId: "t1" },
        { id: "msg-2", threadId: "t2" },
      ],
    };
    const msg1 = {
      id: "msg-1",
      threadId: "t1",
      labelIds: ["UNREAD", "INBOX"],
      snippet: "Re: Meeting",
      payload: {
        headers: [
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: "Re: Meeting" },
          { name: "Date", value: "2024-01-01T00:00:00.000Z" },
        ],
        parts: [],
      },
    };
    const msg2 = {
      id: "msg-2",
      threadId: "t2",
      labelIds: ["UNREAD", "INBOX"],
      snippet: "Another",
      payload: {
        headers: [{ name: "Subject", value: "Another" }],
        parts: [],
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
      returnAll: true,
      simplify: true,
      filters: { readStatus: "unread" },
    });

    expect(calls[0].url).toContain("/messages?");
    expect(calls[0].url).toContain("is%3Aunread");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({
      id: "msg-1",
      threadId: "t1",
      labelIds: ["UNREAD", "INBOX"],
      headers: {
        From: "sender@example.com",
        To: "me@example.com",
        Subject: "Re: Meeting",
      },
    });
  });

  // Acceptance: Create a draft
  it("creates a draft via POST /drafts", async () => {
    installFetch(
      mockResponse({
        id: "draft-id",
        message: { id: "msg-id", threadId: "thread-id" },
      }),
    );
    const out = await run({
      resource: "draft",
      operation: "create",
      subject: "Draft proposal",
      emailType: "text",
      message: "Body of draft",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(out[0][0].json).toMatchObject({
      id: "draft-id",
      message: { id: "msg-id", threadId: "thread-id" },
    });
  });

  // Acceptance: Mark a message as read
  it("marks a message as read", async () => {
    installFetch(mockResponse({ id: "123abc", labelIds: ["INBOX"] }));
    const out = await run(
      {
        resource: "message",
        operation: "markAsRead",
        messageId: "={{ $json.messageId }}",
      },
      [{ messageId: "123abc" }],
    );

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/123abc/modify",
    );
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ addLabelIds: [], removeLabelIds: ["UNREAD"] });
    expect(out[0][0].json).toMatchObject({ id: "123abc" });
  });

  it("gets a simplified message", async () => {
    installFetch(mockResponse(SIMPLE_MSG_RESPONSE));
    const out = await run(
      {
        resource: "message",
        operation: "get",
        messageId: "172ce2c4a72cc243",
        simplify: true,
      },
      [{}],
    );

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/172ce2c4a72cc243",
    );
    expect(out[0][0].json).toMatchObject({
      id: "172ce2c4a72cc243",
      threadId: "thread-id",
      snippet: "Hello from n8n workflow",
      headers: {
        From: "sender@example.com",
        To: "me@example.com",
        Subject: "Automated greeting",
      },
    });
    expect(out[0][0].json).toHaveProperty("body");
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
      }),
    ).rejects.toThrow(/Invalid grant/);
  });

  it("continueOnFail emits error item and continues", async () => {
    installFetch(mockResponse({ error: { message: "Not found" } }, { status: 404 }));
    const out = await run(
      {
        resource: "message",
        operation: "get",
        messageId: "={{ $json.messageId }}",
      },
      [{ messageId: "bad-id" }, { messageId: "valid-id" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
