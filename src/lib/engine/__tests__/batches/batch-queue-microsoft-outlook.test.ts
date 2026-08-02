import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftOutlook";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ id: "msg-1" })) {
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

const CREDS = { microsoftOutlookOAuth2Api: { accessToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijp7InN1YiI6IjEyMzQ1Njc4OTAifQ" } };

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  const creds = credentials ?? CREDS;
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
    getCredential: async (name) => creds[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
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

const SEND_RESPONSE = {
  id: "AAMkAD",
  subject: "Hello",
  toRecipients: [{ emailAddress: { address: "recipient@example.com" } }],
  body: { contentType: "Text", content: "World" },
};

const LIST_RESPONSE = {
  value: [
    { id: "msg-1", subject: "First", body: { contentType: "Text", content: "Hello" } },
    { id: "msg-2", subject: "Second", body: { contentType: "Text", content: "World" } },
  ],
};

const EVENT_RESPONSE = {
  id: "event-1",
  subject: "Planning",
  start: { dateTime: "2026-08-15T10:00:00Z", timeZone: "UTC" },
  end: { dateTime: "2026-08-15T11:00:00Z", timeZone: "UTC" },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue microsoft-outlook — n8n-nodes-base.microsoftOutlook", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft Outlook");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.microsoftOutlook")).toBe(canonical);
  });

  it("sends a message via POST /sendMail", async () => {
    installFetch(mockResponse({}));
    const out = await run(
      {
        resource: "message",
        operation: "send",
        toRecipients: "recipient@example.com",
        subject: "Hello",
        bodyContent: "World",
        bodyType: "text",
      },
      [{ json: {} }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(calls[0].headers["Authorization"]).toContain("Bearer ");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toMatchObject({
      message: {
        subject: "Hello",
        toRecipients: [{ emailAddress: { address: "recipient@example.com" } }],
      },
    });
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("sends a message by resolving expression parameters from item JSON", async () => {
    installFetch(mockResponse({}));
    const out = await run(
      {
        resource: "message",
        operation: "send",
        toRecipients: "{{ $json.to }}",
        subject: "{{ $json.subject }}",
        bodyContent: "{{ $json.bodyText }}",
        bodyType: "text",
      },
      [{ to: "recipient@example.com", subject: "Hello", bodyText: "World" }],
    );

    expect(calls).toHaveLength(1);
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toMatchObject({
      message: {
        subject: "Hello",
        toRecipients: [{ emailAddress: { address: "recipient@example.com" } }],
      },
    });
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("gets a message by ID", async () => {
    const msgResponse = {
      id: "msg-1",
      subject: "Test",
      body: { contentType: "Text", content: "Hello" },
    };
    installFetch(mockResponse(msgResponse));
    const out = await run(
      {
        resource: "message",
        operation: "get",
        messageId: "msg-1",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/messages/msg-1");
    expect(out[0][0].json).toMatchObject(msgResponse);
  });

  it("gets many messages from a folder (folderMessage)", async () => {
    installFetch(mockResponse(LIST_RESPONSE));
    const out = await run(
      {
        resource: "folderMessage",
        operation: "getAll",
        folderId: "Inbox",
        returnAll: false,
        limit: 10,
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?%24top=10");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "msg-1", subject: "First" });
    expect(out[0][1].json).toMatchObject({ id: "msg-2", subject: "Second" });
  });

  it("gets many messages from a folder with pagination (nextLink)", async () => {
    const page1 = {
      value: [{ id: "msg-1" }],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$skip=1",
    };
    const page2 = { value: [{ id: "msg-2" }] };
    const responses = [mockResponse(page1), mockResponse(page2)];
    let idx = 0;
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit | undefined) => {
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
          headers: (init?.headers as Record<string, string>) ?? {},
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        return responses[idx++] ?? responses[responses.length - 1];
      }),
    );
    const out = await run(
      {
        resource: "folderMessage",
        operation: "getAll",
        folderId: "Inbox",
        returnAll: true,
      },
      [{}],
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages");
    expect(calls[1].url).toBe("https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$skip=1");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "msg-1" });
    expect(out[0][1].json).toMatchObject({ id: "msg-2" });
  });

  it("creates a calendar event", async () => {
    installFetch(mockResponse(EVENT_RESPONSE));
    const out = await run(
      {
        resource: "event",
        operation: "create",
        subject: "{{ $json.title }}",
        startDateTime: "{{ $json.start }}",
        endDateTime: "{{ $json.end }}",
      },
      [{ title: "Planning", start: "2026-08-15T10:00:00Z", end: "2026-08-15T11:00:00Z" }],
    );

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/events");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toMatchObject({
      subject: "Planning",
      start: { dateTime: "2026-08-15T10:00:00Z" },
      end: { dateTime: "2026-08-15T11:00:00Z" },
    });
    expect(out[0][0].json).toMatchObject(EVENT_RESPONSE);
  });

  it("adds an attachment from binary input", async () => {
    const attachResponse = {
      id: "attach-1",
      name: "note.txt",
      contentType: "text/plain",
      size: 4,
    };
    installFetch(mockResponse(attachResponse));
    const out = await run(
      {
        resource: "messageAttachment",
        operation: "add",
        messageId: "msg-123",
        binaryProperty: "file",
      },
      [
        {
          json: { messageId: "msg-123" },
          binary: { file: { mimeType: "text/plain", fileName: "note.txt", fileSize: 4, data: "SGVsbG8=" } },
        },
      ],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/messages/msg-123/attachments");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toMatchObject({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "note.txt",
      contentType: "text/plain",
      contentBytes: "SGVsbG8=",
    });
    expect(out[0][0].json).toMatchObject(attachResponse);
  });

  it("deletes a message with continueOnFail", async () => {
    installFetch(mockResponse({ error: { message: "Resource not found" } }, { status: 404 }));
    const out = await run(
      {
        resource: "message",
        operation: "delete",
        messageId: "NONEXISTENT",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toHaveProperty("error");
    expect(typeof out[0][0].json.error).toBe("string");
  });

  it("deletes a message successfully and passes through input", async () => {
    installFetch(mockResponse(undefined, { status: 204 }));
    const out = await run(
      {
        resource: "message",
        operation: "delete",
        messageId: "msg-1",
      },
      [{ hello: "world" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(out[0][0].json).toMatchObject({ hello: "world" });
  });

  it("gets an attachment with binary data", async () => {
    const attachResponse = {
      id: "attach-1",
      name: "report.pdf",
      contentType: "application/pdf",
      contentBytes: "JVBERi0xLjc=",
      size: 1234,
    };
    installFetch(mockResponse(attachResponse));
    const out = await run(
      {
        resource: "messageAttachment",
        operation: "get",
        messageId: "msg-1",
        attachmentId: "attach-1",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(out[0][0].json).toMatchObject(attachResponse);
    expect(out[0][0].binary).toBeDefined();
    expect(out[0][0].binary!["attach-1"]).toBeDefined();
    expect(out[0][0].binary!["attach-1"].data).toBe("JVBERi0xLjc=");
    expect(out[0][0].binary!["attach-1"].fileName).toBe("report.pdf");
  });

  it("moves a message to a different folder", async () => {
    const moveResponse = { id: "msg-1", parentFolderId: "dest-folder-id" };
    installFetch(mockResponse(moveResponse));
    const out = await run(
      {
        resource: "message",
        operation: "move",
        messageId: "msg-1",
        destinationFolderId: "dest-folder-id",
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/messages/msg-1/move");
    const body = JSON.parse(calls[0].body as string);
    expect(body).toMatchObject({ destinationId: "dest-folder-id" });
    expect(out[0][0].json).toMatchObject(moveResponse);
  });

  it("sendAndWait returns placeholder outcome (no _sendAndWait flag)", async () => {
    installFetch(mockResponse({}));
    const out = await run(
      {
        resource: "message",
        operation: "sendAndWait",
        toRecipients: "manager@example.com",
        subject: "Approve release",
        responseType: "approval",
      },
      [{ json: { approver: "manager@example.com" } }],
    );
    expect(out[0][0].json).not.toHaveProperty("_sendAndWait");
    expect(out[0][0].json).toHaveProperty("approved");
    expect(out[0][0].json).toHaveProperty("timeout");
  });

  it("handles 404 error without continueOnFail", async () => {
    installFetch(mockResponse({ error: { message: "Item not found" } }, { status: 404 }));
    await expect(
      run(
        {
          resource: "message",
          operation: "get",
          messageId: "nonexistent",
        },
        [{}],
      ),
    ).rejects.toThrow("Item not found");
  });
});
