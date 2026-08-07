import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mandrill";

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
    statusText: status === 200 ? "OK" : "Bad Request",
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

const SENT_RESPONSE = [
  { _id: "abc123", email: "recipient@example.com", status: "sent" },
];

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse(SENT_RESPONSE)) {
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

const CREDS = { mandrillApi: { apiKey: "mock-api-key-12345" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mandrill — n8n-nodes-base.mandrill", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mandrill");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.mandrill")).toBe(canonical);
  });

  it("sends an HTML email (Test A)", async () => {
    const out = await run({
      resource: "message",
      operation: "sendHtml",
      fromEmail: "sender@example.com",
      toEmail: "recipient@example.com",
      options: {
        subject: "Test from OpenFlow",
        html: "<h1>Hello</h1><p>This is a test.</p>",
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mandrillapp.com/api/1.0/messages/send");

    const body = JSON.parse(calls[0].body!);
    expect(body.key).toBe("mock-api-key-12345");
    expect(body.message.from_email).toBe("sender@example.com");
    expect(body.message.to).toEqual([{ email: "recipient@example.com" }]);
    expect(body.message.subject).toBe("Test from OpenFlow");
    expect(body.message.html).toBe("<h1>Hello</h1><p>This is a test.</p>");

    expect(out[0][0].json).toEqual({
      _id: "abc123",
      email: "recipient@example.com",
      status: "sent",
    });
  });

  it("sends a template email (Test B)", async () => {
    const out = await run({
      resource: "message",
      operation: "sendTemplate",
      template: "welcome-email",
      fromEmail: "team@example.com",
      toEmail: "user@example.com",
      options: {
        subject: "Welcome!",
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mandrillapp.com/api/1.0/messages/send-template");

    const body = JSON.parse(calls[0].body!);
    expect(body.template_name).toBe("welcome-email");
    expect(body.template_content).toEqual([{}]);
    expect(body.message.from_email).toBe("team@example.com");
    expect(body.message.to).toEqual([{ email: "user@example.com" }]);

    expect(out[0][0].json).toHaveProperty("_id");
    expect(out[0][0].json).toHaveProperty("status");
  });

  it("scheduled send sets send_at (Test C)", async () => {
    const futureTime = "2027-01-01 12:00:00";
    const out = await run({
      resource: "message",
      operation: "sendHtml",
      fromEmail: "sender@example.com",
      toEmail: "recipient@example.com",
      options: {
        subject: "Scheduled",
        html: "<p>Later</p>",
        sendAt: futureTime,
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.send_at).toBe(futureTime);
    expect(out[0][0].json).toHaveProperty("_id");
  });

  it("handles multiple recipients (comma-separated)", async () => {
    await run({
      resource: "message",
      operation: "sendHtml",
      fromEmail: "sender@example.com",
      toEmail: "a@example.com,b@example.com,c@example.com",
      options: {
        subject: "Group",
        html: "<p>Hello all</p>",
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.message.to).toEqual([
      { email: "a@example.com" },
      { email: "b@example.com" },
      { email: "c@example.com" },
    ]);
  });

  it("applies optional boolean options", async () => {
    await run({
      resource: "message",
      operation: "sendHtml",
      fromEmail: "sender@example.com",
      toEmail: "recipient@example.com",
      options: {
        important: true,
        trackOpens: true,
        trackClicks: true,
        subject: "Tracking test",
        html: "<p>Track this</p>",
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.message.important).toBe(true);
    expect(body.message.track_opens).toBe(true);
    expect(body.message.track_clicks).toBe(true);
  });

  it("applies string options like tags and ipPool", async () => {
    await run({
      resource: "message",
      operation: "sendHtml",
      fromEmail: "sender@example.com",
      toEmail: "recipient@example.com",
      options: {
        tags: "test,welcome",
        ipPool: "dedicated-1",
        subAccount: "sub-account-id",
        subject: "Options test",
        html: "<p>Test</p>",
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.message.tags).toEqual(["test", "welcome"]);
    expect(body.message.ip_pool).toBe("dedicated-1");
    expect(body.message.subaccount).toBe("sub-account-id");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "message",
          operation: "sendHtml",
          fromEmail: "sender@example.com",
          toEmail: "recipient@example.com",
          options: { html: "<p>Test</p>" },
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
        options: { html: "<p>Test</p>" },
      }),
    ).rejects.toThrow(/fromEmail is required/);
  });

  it("throws when toEmail is missing", async () => {
    await expect(
      run({
        resource: "message",
        operation: "sendHtml",
        fromEmail: "sender@example.com",
      }),
    ).rejects.toThrow(/toEmail is required/);
  });

  it("throws when template is missing for sendTemplate operation (Test E)", async () => {
    await expect(
      run({
        resource: "message",
        operation: "sendTemplate",
        fromEmail: "team@example.com",
        toEmail: "user@example.com",
      }),
    ).rejects.toThrow(/template is required/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ message: "Invalid API key", status: "error" }, { status: 401 }));
    await expect(
      run({
        resource: "message",
        operation: "sendHtml",
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
        options: { html: "<p>Test</p>" },
      }),
    ).rejects.toThrow(/Invalid API key/);
  });

  it("emits error item on HTTP error when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "Rejected", status: "error" }, { status: 400 }));
    const out = await run(
      {
        resource: "message",
        operation: "sendHtml",
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
        options: { html: "<p>Test</p>" },
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("emits error item when fromEmail is missing and continueOnFail is on", async () => {
    const out = await run(
      {
        resource: "message",
        operation: "sendHtml",
        toEmail: "recipient@example.com",
        options: { html: "<p>Test</p>" },
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      error: {
        message: "Mandrill: fromEmail is required",
        description: "",
      },
    });
  });

  it("sends with async flag", async () => {
    await run({
      resource: "message",
      operation: "sendHtml",
      fromEmail: "sender@example.com",
      toEmail: "recipient@example.com",
      options: {
        async: true,
        subject: "Async",
        html: "<p>Async send</p>",
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.async).toBe(true);
  });

  it("sends to multiple input items", async () => {
    const out = await run(
      {
        resource: "message",
        operation: "sendHtml",
        fromEmail: "={{ $json.from }}",
        toEmail: "={{ $json.to }}",
        options: {
          subject: "={{ $json.subject }}",
          html: "={{ $json.html }}",
        },
      },
      [
        { json: { from: "a@example.com", to: "b@example.com", subject: "One", html: "<p>1</p>" } },
        { json: { from: "c@example.com", to: "d@example.com", subject: "Two", html: "<p>2</p>" } },
      ],
    );

    expect(calls).toHaveLength(2);
    expect(out[0]).toHaveLength(2);

    const body0 = JSON.parse(calls[0].body!);
    expect(body0.message.from_email).toBe("a@example.com");
    expect(body0.message.to).toEqual([{ email: "b@example.com" }]);

    const body1 = JSON.parse(calls[1].body!);
    expect(body1.message.from_email).toBe("c@example.com");
    expect(body1.message.to).toEqual([{ email: "d@example.com" }]);
  });
});
