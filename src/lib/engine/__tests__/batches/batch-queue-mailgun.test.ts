import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailgun";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ id: "<mock-mailgun-message-id>", message: "Queued. Thank you." })) {
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

const CREDS = { mailgunApi: { apiDomain: "api.mailgun.net", emailDomain: "mg.example.com", apiKey: "key-abc123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mailgun — n8n-nodes-base.mailgun", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mailgun");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.mailgun")).toBe(canonical);
  });

  it("sends a plain text email", async () => {
    const out = await run({
      fromEmail: "Sender <sender@example.com>",
      toEmail: "recipient@example.com",
      subject: "Hello",
      text: "This is a test message.",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.mailgun.net/v3/mg.example.com/messages");
    expect(calls[0].headers["Authorization"]).toMatch(/^Basic /);

    expect(out[0][0].json).toEqual({
      id: "<mock-mailgun-message-id>",
      message: "Queued. Thank you.",
    });
  });

  it("sends an HTML email with CC", async () => {
    const out = await run({
      fromEmail: "admin@example.com",
      toEmail: "to@example.com",
      ccEmail: "cc@example.com",
      subject: "HTML test",
      html: "<h1>Hello</h1><p>World</p>",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/messages");
    expect(out[0][0].json).toEqual({
      id: "<mock-mailgun-message-id>",
      message: "Queued. Thank you.",
    });
  });

  it("sends with binary attachment", async () => {
    const out = await run(
      {
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
        subject: "With file",
        text: "See attached",
        attachments: "myFile",
      },
      [
        {
          json: {},
          binary: {
            myFile: {
              data: Buffer.from("hello world").toString("base64"),
              mimeType: "text/plain",
              fileName: "notes.txt",
            },
          },
        },
      ],
    );

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/messages");
    expect(out[0][0].json).toEqual({
      id: "<mock-mailgun-message-id>",
      message: "Queued. Thank you.",
    });
  });

  it("emits error item when continueOnFail is on and body is missing", async () => {
    const out = await run(
      {
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
        continueOnFail: true,
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      error: {
        message: "Mailgun: at least one of text or html must be provided",
        description: "",
      },
    });
  });

  it("sends to multiple recipients", async () => {
    const out = await run({
      fromEmail: "sender@example.com",
      toEmail: "a@example.com,b@example.com",
      subject: "Group",
      text: "Hello all",
    });

    expect(calls[0].method).toBe("POST");
    expect(out[0][0].json).toEqual({
      id: "<mock-mailgun-message-id>",
      message: "Queued. Thank you.",
    });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          fromEmail: "sender@example.com",
          toEmail: "recipient@example.com",
          text: "test",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/mailgunApi credential is not configured/);
  });

  it("throws when fromEmail is missing", async () => {
    await expect(
      run({
        toEmail: "recipient@example.com",
        text: "test",
      }),
    ).rejects.toThrow(/fromEmail and toEmail/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ message: "Domain not found" }, { status: 404 }));
    await expect(
      run({
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
        text: "test",
      }),
    ).rejects.toThrow(/Domain not found/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "Server error" }, { status: 500 }));
    const out = await run(
      {
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
        text: "test",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("sends Basic auth header with api key", async () => {
    await run({
      fromEmail: "test@example.com",
      toEmail: "test@example.com",
      text: "test",
    });

    expect(calls[0].headers["Authorization"]).toBe(
      "Basic " + btoa("api:key-abc123"),
    );
  });

  it("uses EU API domain when configured", async () => {
    const euCreds = {
      mailgunApi: { apiDomain: "api.eu.mailgun.net", emailDomain: "mg.example.com", apiKey: "key-eu" },
    };
    await run(
      {
        fromEmail: "test@example.com",
        toEmail: "test@example.com",
        text: "test",
      },
      [{}],
      { credentials: euCreds },
    );

    expect(calls[0].url).toBe("https://api.eu.mailgun.net/v3/mg.example.com/messages");
  });
});