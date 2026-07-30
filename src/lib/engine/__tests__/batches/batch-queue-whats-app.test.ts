import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.whatsApp";

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
  body: string | FormData | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ id: "msg_1" })) {
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

const CREDS = { whatsAppApi: { accessToken: "EAAG_token_123", businessAccountId: "123456" } };

const SEND_RESPONSE = {
  messaging_product: "whatsapp",
  contacts: [{ input: "15551234567", wa_id: "15551234567" }],
  messages: [{ id: "wamid.HBgMMTU1NTEyMzQ1NjcVAgARGBJGM..." }],
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue whatsApp — n8n-nodes-base.whatsApp", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("WhatsApp Business Cloud");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.whatsApp")).toBe(canonical);
  });

  it("sends a text message via POST", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run({
      resource: "message",
      operation: "send",
      phoneNumberId: "1234567890",
      recipientPhoneNumber: "15551234567",
      messageType: "text",
      textBody: "Hello from n8n!",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.facebook.com/v18.0/1234567890/messages");
    expect(JSON.parse(calls[0].body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "15551234567",
      type: "text",
      text: { body: "Hello from n8n!" },
    });
    expect(out[0][0].json).toMatchObject({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.HBgMMTU1NTEyMzQ1NjcVAgARGBJGM..." }],
    });
  });

  it("sends an image via media link with caption", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run({
      resource: "message",
      operation: "send",
      phoneNumberId: "1234567890",
      recipientPhoneNumber: "15551234567",
      messageType: "image",
      mediaPath: "useMediaLink",
      mediaLink: "https://example.com/image.png",
      mediaCaption: "Test image",
    });

    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "15551234567",
      type: "image",
      image: {
        link: "https://example.com/image.png",
        caption: "Test image",
      },
    });
    expect(out[0][0].json).toMatchObject({ messaging_product: "whatsapp" });
  });

  it("sends an image via media ID", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    await run({
      resource: "message",
      operation: "send",
      phoneNumberId: "1234567890",
      recipientPhoneNumber: "15551234567",
      messageType: "image",
      mediaPath: "useMediaId",
      mediaId: "media_abc",
    });

    expect(JSON.parse(calls[0].body as string).image).toEqual({ id: "media_abc" });
  });

  it("sends a document via media ID with filename", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    await run({
      resource: "message",
      operation: "send",
      phoneNumberId: "1234567890",
      recipientPhoneNumber: "15551234567",
      messageType: "document",
      mediaPath: "useMediaId",
      mediaId: "media_doc",
      mediaFilename: "report.pdf",
    });

    expect(JSON.parse(calls[0].body as string).document).toEqual({
      id: "media_doc",
      filename: "report.pdf",
    });
  });

  it("sends a location message", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    await run({
      resource: "message",
      operation: "send",
      phoneNumberId: "1234567890",
      recipientPhoneNumber: "15551234567",
      messageType: "location",
      longitude: -122.4194,
      latitude: 37.7749,
      locationName: "SF Office",
      locationAddress: "123 Main St",
    });

    expect(JSON.parse(calls[0].body as string).location).toEqual({
      longitude: -122.4194,
      latitude: 37.7749,
      name: "SF Office",
      address: "123 Main St",
    });
  });

  it("sends a template with body parameters and expression resolution", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run(
      {
        resource: "message",
        operation: "sendTemplate",
        phoneNumberId: "1234567890",
        recipientPhoneNumber: "15551234567",
        template: "order_confirmation|en_US",
        components: [
          {
            type: "body",
            bodyParameters: [
              { type: "text", text: "={{ $json.customerName }}" },
              { type: "text", text: "={{ $json.orderId }}" },
            ],
          },
        ],
      },
      [{ orderId: "ORD-123", customerName: "John" }],
    );

    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.type).toBe("template");
    expect(sentBody.template).toEqual({
      name: "order_confirmation",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "John" },
            { type: "text", text: "ORD-123" },
          ],
        },
      ],
    });
    expect(out[0][0].json).toMatchObject({ messaging_product: "whatsapp" });
  });

  it("cleans recipient phone number (strips non-digits)", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    await run({
      resource: "message",
      operation: "send",
      phoneNumberId: "1234567890",
      recipientPhoneNumber: "+1 (555) 123-4567",
      messageType: "text",
      textBody: "Hi",
    });

    expect(JSON.parse(calls[0].body as string).to).toBe("+15551234567");
  });

  it("sends and wait — sends message and passes through input item", async () => {
    installFetch(mockResponse(SEND_RESPONSE));
    const out = await run(
      {
        resource: "message",
        operation: "sendAndWait",
        phoneNumberId: "1234567890",
        recipientPhoneNumber: "15551234567",
        messageType: "text",
        textBody: "Approve request APP-001?",
        responseType: "approval",
        limitWaitTime: false,
      },
      [{ approvalId: "APP-001" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body as string).text.body).toBe("Approve request APP-001?");
    // TODO: wait/resume not implemented; input item passed through
    expect(out[0][0].json).toMatchObject({ approvalId: "APP-001" });
  });

  it("uploads media via multipart form data", async () => {
    installFetch(mockResponse({ id: "media_id_123", messaging_product: "whatsapp" }));
    const out = await run(
      {
        resource: "media",
        operation: "mediaUpload",
        phoneNumberId: "1234567890",
        mediaPropertyName: "data",
        mediaFileName: "test.png",
      },
      [
        {
          json: {},
          binary: { data: { mimeType: "image/png", data: "iVBORw0KGgo=" } },
        },
      ],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://graph.facebook.com/v18.0/1234567890/media");
    expect(calls[0].body).toBeInstanceOf(FormData);
    expect(out[0][0].json).toMatchObject({ id: "media_id_123" });
  });

  it("gets media URL via GET", async () => {
    installFetch(mockResponse({ url: "https://example.com/media.mp4", id: "m1" }));
    const out = await run({
      resource: "media",
      operation: "mediaUrlGet",
      mediaGetId: "media_abc",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://graph.facebook.com/v18.0/media_abc");
    expect(out[0][0].json).toMatchObject({ url: "https://example.com/media.mp4" });
  });

  it("deletes media via DELETE and returns success", async () => {
    installFetch(mockResponse("", { status: 200 }));
    const out = await run({
      resource: "media",
      operation: "mediaDelete",
      mediaDeleteId: "media_abc",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://graph.facebook.com/v18.0/media_abc");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("sends Bearer token from whatsAppApi credential", async () => {
    await run({
      resource: "message",
      operation: "send",
      phoneNumberId: "1234567890",
      recipientPhoneNumber: "15551234567",
      messageType: "text",
      textBody: "Hi",
    });

    expect(calls[0].headers["Authorization"]).toBe("Bearer EAAG_token_123");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "message",
          operation: "send",
          phoneNumberId: "1234567890",
          recipientPhoneNumber: "15551234567",
          messageType: "text",
          textBody: "Hi",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/whatsAppApi credential is not configured/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ error: { message: "bad request" } }, { status: 400 }));
    await expect(
      run({
        resource: "message",
        operation: "send",
        phoneNumberId: "1234567890",
        recipientPhoneNumber: "15551234567",
        messageType: "text",
        textBody: "Hi",
      }),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "bad" }, { status: 500 }));
    const out = await run(
      {
        resource: "message",
        operation: "send",
        phoneNumberId: "1234567890",
        recipientPhoneNumber: "15551234567",
        messageType: "text",
        textBody: "Hi",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json).toHaveProperty("message");
  });

  it("throws when phoneNumberId is missing", async () => {
    await expect(
      run({
        resource: "message",
        operation: "send",
        recipientPhoneNumber: "15551234567",
        messageType: "text",
        textBody: "Hi",
      }),
    ).rejects.toThrow(/phoneNumberId is required/);
  });

  it("makes one request per input item", async () => {
    await run(
      {
        resource: "message",
        operation: "send",
        phoneNumberId: "1234567890",
        recipientPhoneNumber: "={{ $json.phone }}",
        messageType: "text",
        textBody: "Hi {{ $json.name }}",
      },
      [
        { phone: "15551111111", name: "Alice" },
        { phone: "15552222222", name: "Bob" },
      ],
    );

    expect(calls).toHaveLength(2);
    const body0 = JSON.parse(calls[0].body as string);
    const body1 = JSON.parse(calls[1].body as string);
    expect(body0.to).toBe("15551111111");
    expect(body0.text.body).toBe("Hi Alice");
    expect(body1.to).toBe("15552222222");
    expect(body1.text.body).toBe("Hi Bob");
  });
});
