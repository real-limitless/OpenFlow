import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftOutlookTool";

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
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
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

const CREDS = { microsoftOutlookOAuth2Api: { accessToken: "eyJhbGciOiJSUzI1NiJ9.test" } };

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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue microsoftOutlookTool — n8n-nodes-base.microsoftOutlookTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Microsoft Outlook (AI Tool)");
  });

  it("sends a message via AI tool", async () => {
    installFetch(mockResponse({}));
    const out = await run({
      resource: "message",
      operation: "send",
      toRecipients: "recipient@example.com",
      subject: "Automated greeting",
      bodyContent: "Hello from AI agent",
      bodyType: "text",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/sendMail");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.message.subject).toBe("Automated greeting");
    expect(sentBody.message.toRecipients[0].emailAddress.address).toBe("recipient@example.com");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("gets many messages from folder", async () => {
    installFetch(
      mockResponse({
        value: [
          { id: "msg-1", subject: "First" },
          { id: "msg-2", subject: "Second" },
        ],
      }),
    );
    const out = await run({
      resource: "folderMessage",
      operation: "getAll",
      folderId: "Inbox",
      returnAll: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/mailFolders/Inbox/messages");
    expect(out[0][0].json).toHaveLength(2);
    expect((out[0][0].json as Record<string, unknown>[])[0]).toMatchObject({ id: "msg-1", subject: "First" });
  });

  it("creates a calendar event", async () => {
    installFetch(
      mockResponse({
        id: "event-1",
        subject: "Meeting",
        start: { dateTime: "2026-08-15T10:00:00Z", timeZone: "UTC" },
        end: { dateTime: "2026-08-15T11:00:00Z", timeZone: "UTC" },
      }),
    );
    const out = await run(
      {
        resource: "event",
        operation: "create",
        subject: "Meeting",
        startDateTime: "2026-08-15T10:00:00Z",
        endDateTime: "2026-08-15T11:00:00Z",
      },
      [{ json: { title: "Meeting", start: "2026-08-15T10:00:00Z", end: "2026-08-15T11:00:00Z" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/events");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.subject).toBe("Meeting");
    expect(sentBody.start.dateTime).toBe("2026-08-15T10:00:00Z");
    expect(out[0][0].json).toMatchObject({ id: "event-1", subject: "Meeting" });
  });

  it("handles $fromAI() expressions without throwing", async () => {
    installFetch(mockResponse({}));
    const out = await run({
      resource: "message",
      operation: "send",
      toRecipients: "= $fromAI('recipient')",
      subject: "= $fromAI('subject')",
      bodyContent: "= $fromAI('body')",
      bodyType: "text",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/sendMail");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.message.subject).toBeDefined();
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("moves a message", async () => {
    installFetch(mockResponse({ id: "msg-1", parentFolderId: "target-folder" }));
    const out = await run({
      resource: "message",
      operation: "move",
      messageId: "msg-1",
      destinationFolderId: "target-folder",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/messages/msg-1/move");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.destinationId).toBe("target-folder");
    expect((out[0][0].json as Record<string, unknown>).id).toBe("msg-1");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "message", operation: "send", toRecipients: "a@b.com", subject: "test", bodyContent: "hello" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/no valid credential/i);
  });

  it("errors with continueOnFail on API failure", async () => {
    installFetch(
      mockResponse({ error: { message: "Resource not found" } }, { status: 404 }),
    );
    const out = await run(
      { resource: "message", operation: "get", messageId: "nonexistent" },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toMatchObject({
      error: { message: expect.stringContaining("Resource not found") },
    });
  });

  it("gets a message by id", async () => {
    installFetch(mockResponse({ id: "msg-1", subject: "Hello", body: { contentType: "Text", content: "World" } }));
    const out = await run({
      resource: "message",
      operation: "get",
      messageId: "msg-1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/messages/msg-1");
    expect(out[0][0].json).toMatchObject({ id: "msg-1", subject: "Hello" });
  });
});
