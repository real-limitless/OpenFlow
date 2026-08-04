import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.whatsAppTool";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(_name: string) { return null; },
      entries() { return new Map().entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall { url: string; method: string; headers: Record<string, string>; body: string | FormData | undefined; }

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ messaging_product: "whatsapp", messages: [{ id: "wamid.test" }] })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : init?.body instanceof FormData ? init.body : undefined,
    });
    return nextResponse;
  }));
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i ? (i as INodeExecutionData) : { json: i as Record<string, unknown> },
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
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
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

const CREDS = { whatsAppApi: { accessToken: "EAAG_test_token", businessAccountId: "123456" } };
const SEND_RESPONSE = {
  messaging_product: "whatsapp",
  contacts: [{ input: "15551234567", wa_id: "15551234567" }],
  messages: [{ id: "wamid.test123" }],
};

beforeEach(() => { installFetch(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue whatsAppTool — n8n-nodes-base.whatsAppTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
  });

  it("sends a text message", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run({
      resource: "Message",
      operation: "Send",
      from: "123456789",
      to: "15551234567",
      messageType: "Text",
      text: "Hello from tool",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.facebook.com/v17.0/123456789/messages");
    expect(JSON.parse(calls[0].body as string)).toMatchObject({
      messaging_product: "whatsapp",
      to: "15551234567",
      type: "text",
      text: { body: "Hello from tool" },
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ messaging_product: "whatsapp", messages: [{ id: "wamid.test123" }] });
    expect(out[1]).toHaveLength(0);
  });

  it("sends a template message", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run({
      resource: "Message",
      operation: "Send Template",
      from: "123456789",
      to: "15551234567",
      template: "hello_world",
      language: "en_US",
    });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body as string);
    expect(body.type).toBe("template");
    expect(body.template).toEqual({ name: "hello_world", language: { code: "en_US" } });
    expect(out[0][0].json).toMatchObject({ messaging_product: "whatsapp" });
  });

  it("sends and wait routes item to output[1]", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run(
      {
        resource: "Message",
        operation: "Send and Wait for Response",
        from: "123456789",
        to: "15551234567",
        messageType: "Text",
        text: "Approve?",
      },
      [{ requestId: "REQ-001" }],
    );

    expect(calls).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
    expect(out[1]).toHaveLength(1);
    expect(out[1][0].json).toMatchObject({ requestId: "REQ-001", waitResponse: { approved: true } });
  });

  it("uploads media via form data", async () => {
    installFetch(mockResponse({ id: "media_upload_id", messaging_product: "whatsapp" }));
    const out = await run(
      {
        resource: "Media",
        operation: "Upload",
        from: "123456789",
        inputDataFieldName: "data",
      },
      [{ json: {}, binary: { data: { mimeType: "image/png", data: "iVBORw0KGgo=" } } }],
    );

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.facebook.com/v17.0/123456789/media");
    expect(calls[0].body).toBeInstanceOf(FormData);
    expect(out[0][0].json).toMatchObject({ id: "media_upload_id" });
  });

  it("downloads media via GET", async () => {
    installFetch(mockResponse({ url: "https://example.com/media.mp4", id: "m1" }));
    const out = await run({
      resource: "Media",
      operation: "Download",
      from: "123456789",
      mediaId: "media_abc",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://graph.facebook.com/v17.0/media_abc");
    expect(out[0][0].json).toMatchObject({ url: "https://example.com/media.mp4" });
  });

  it("deletes media via DELETE", async () => {
    installFetch(mockResponse("", { status: 200 }));
    const out = await run({
      resource: "Media",
      operation: "Delete",
      from: "123456789",
      mediaId: "media_abc",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://graph.facebook.com/v17.0/media_abc");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("sends Bearer token from credential", async () => {
    await run({
      resource: "Message",
      operation: "Send",
      from: "123456789",
      to: "15551234567",
      messageType: "Text",
      text: "Hi",
    });

    expect(calls[0].headers["Authorization"]).toBe("Bearer EAAG_test_token");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "Message", operation: "Send", from: "123456789", to: "15551234567", messageType: "Text", text: "Hi" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/whatsAppApi credential is not configured/);
  });

  it("throws on missing from", async () => {
    await expect(
      run({ resource: "Message", operation: "Send", to: "15551234567", messageType: "Text", text: "Hi" }),
    ).rejects.toThrow(/from/);
  });

  it("emits error item on continueOnFail", async () => {
    installFetch(mockResponse({ error: "bad" }, { status: 500 }));
    const out = await run(
      { resource: "Message", operation: "Send", from: "123456789", to: "15551234567", messageType: "Text", text: "Hi" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
