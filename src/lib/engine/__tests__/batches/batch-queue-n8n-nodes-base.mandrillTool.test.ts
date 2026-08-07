import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mandrillTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
      },
      entries() {
        return new Map([["content-type", "application/json"]]).entries();
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

function installFetch(response = mockResponse([{ _id: "mock-id-123", email: "recipient@example.com", status: "sent" }])) {
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

const CREDS = { mandrillApi: { apiKey: "mock-api-key-123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mandrillTool — n8n-nodes-base.mandrillTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mandrill (AI Tool)");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.mandrillTool")).toBe(canonical);
  });

  it("sends an HTML email (sendHtml operation)", async () => {
    installFetch(mockResponse([{ _id: "mock-id-123", email: "user@example.com", status: "sent" }]));
    const out = await run({
      resource: "message",
      operation: "sendHtml",
      fromEmail: "admin@example.com",
      toEmail: "user@example.com",
      options: {
        subject: "Hello from the AI",
        html: "<h1>Hello</h1><p>This was sent by an AI agent.</p>",
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mandrillapp.com/api/1.0/messages/send");

    const body = JSON.parse(calls[0].body!);
    expect(body.key).toBe("mock-api-key-123");
    expect(body.message.from_email).toBe("admin@example.com");
    expect(body.message.to).toEqual([{ email: "user@example.com" }]);
    expect(body.message.subject).toBe("Hello from the AI");
    expect(body.message.html).toBe("<h1>Hello</h1><p>This was sent by an AI agent.</p>");

    expect(out[0][0].json).toEqual({
      _id: "mock-id-123",
      email: "user@example.com",
      status: "sent",
    });
  });

  it("sends a template email (sendTemplate operation)", async () => {
    installFetch(mockResponse([{ _id: "mock-id-123", email: "user@example.com", status: "sent" }]));
    const out = await run({
      resource: "message",
      operation: "sendTemplate",
      template: "welcome-email",
      fromEmail: "team@example.com",
      toEmail: "user@example.com",
      options: { subject: "Welcome!" },
    });

    expect(calls[0].url).toBe("https://mandrillapp.com/api/1.0/messages/send-template");

    const body = JSON.parse(calls[0].body!);
    expect(body.template_name).toBe("welcome-email");
    expect(body.template_content).toEqual([{}]);
    expect(body.message.from_email).toBe("team@example.com");

    expect(out[0][0].json).toEqual({
      _id: "mock-id-123",
      email: "user@example.com",
      status: "sent",
    });
  });

  it("scheduled send via tool returns scheduled status", async () => {
    installFetch(mockResponse([{ _id: "mock-id-456", email: "user@example.com", status: "scheduled" }]));
    const out = await run({
      resource: "message",
      operation: "sendHtml",
      fromEmail: "sender@example.com",
      toEmail: "user@example.com",
      options: {
        subject: "Scheduled",
        html: "<p>Later</p>",
        sendAt: "2026-12-25 09:00:00",
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.send_at).toBe("2026-12-25 09:00:00");
    expect(out[0][0].json.status).toBe("scheduled");
  });

  it("throws when template is missing for sendTemplate in tool mode", async () => {
    await expect(
      run({
        resource: "message",
        operation: "sendTemplate",
        fromEmail: "team@example.com",
        toEmail: "user@example.com",
      }),
    ).rejects.toThrow(/template is required/);
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "message",
          operation: "sendHtml",
          fromEmail: "sender@example.com",
          toEmail: "recipient@example.com",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/mandrillApi credential is not configured/);
  });

  it("throws when fromEmail is missing", async () => {
    await expect(
      run({
        resource: "message",
        operation: "sendHtml",
        toEmail: "recipient@example.com",
      }),
    ).rejects.toThrow(/fromEmail is required/);
  });

  it("throws on API error", async () => {
    installFetch(mockResponse({ message: "Invalid API key", status: "error" }, 500));
    await expect(
      run({
        resource: "message",
        operation: "sendHtml",
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
      }),
    ).rejects.toThrow(/Invalid API key/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "Server error" }, 500));
    const out = await run(
      {
        resource: "message",
        operation: "sendHtml",
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
