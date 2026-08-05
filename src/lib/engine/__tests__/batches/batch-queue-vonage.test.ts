import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.vonage";

function mockVonageResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    statusText: status === 200 ? "OK" : "Bad Request",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      forEach(fn: (v: string, k: string) => void) {
        map.forEach((v, k) => fn(v, k));
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
let nextResponse: ReturnType<typeof mockVonageResponse>;

function installFetch(response?: ReturnType<typeof mockVonageResponse>) {
  nextResponse = response ?? mockVonageResponse({
    "message-count": "1",
    messages: [{ to: "447700900001", "message-id": "02000000DA7C0A58", status: "0", "remaining-balance": "3.14159265", "message-price": "0.03330000", network: "23410" }],
  });
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

const CREDS = { vonageApi: { apiKey: "abc123", apiSecret: "secret456" } };

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

describe("batch-queue vonage — n8n-nodes-base.vonage", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Vonage");
  });

  it("resolves the executor under the canonical and short type strings", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.vonage")).toBe(canonical);
  });

  it("sends a simple SMS", async () => {
    const out = await run({
      resource: "sms",
      operation: "send",
      from: "MyApp",
      to: "+447700900001",
      message: "Hello from n8n",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://rest.nexmo.com/sms/json");

    const body = new URLSearchParams(calls[0].body);
    expect(body.get("api_key")).toBe("abc123");
    expect(body.get("api_secret")).toBe("secret456");
    expect(body.get("from")).toBe("MyApp");
    expect(body.get("to")).toBe("+447700900001");
    expect(body.get("text")).toBe("Hello from n8n");

    expect(out[0][0].json).toMatchObject({
      "message-count": "1",
      messages: [{ status: "0" }],
    });
  });

  it("sends with all options", async () => {
    const out = await run({
      resource: "sms",
      operation: "send",
      from: "AlertBot",
      to: "+447700900002",
      message: "URGENT: Server down",
      options: {
        type: "text",
        ttl: 600000,
        statusCallbackUrl: "https://example.com/dlr",
        clientRef: "alert-123",
      },
    });

    const body = new URLSearchParams(calls[0].body);
    expect(body.get("type")).toBe("text");
    expect(body.get("ttl")).toBe("600000");
    expect(body.get("status-report-req")).toBe("1");
    expect(body.get("callback")).toBe("https://example.com/dlr");
    expect(body.get("client-ref")).toBe("alert-123");

    expect(out[0][0].json).toMatchObject({
      messages: [{ status: "0" }],
    });
  });

  it("sends unicode SMS with unicode type", async () => {
    const out = await run({
      resource: "sms",
      operation: "send",
      from: "AlertBot",
      to: "+447700900003",
      message: "こんにちは世界",
      options: { type: "unicode" },
    });

    const body = new URLSearchParams(calls[0].body);
    expect(body.get("type")).toBe("unicode");
    expect(body.get("text")).toBe("こんにちは世界");

    expect(out[0][0].json).toMatchObject({
      messages: [{ status: "0" }],
    });
  });

  it("throws on non-zero status in response", async () => {
    installFetch(mockVonageResponse({
      "message-count": "1",
      messages: [{ to: "invalid", status: "6", "error-text": "Invalid number" }],
    }));

    await expect(
      run({
        resource: "sms",
        operation: "send",
        from: "Test",
        to: "invalid",
        message: "Hello",
      }),
    ).rejects.toThrow(/Invalid number/);
  });

  it("emits error item with continueOnFail when response has non-zero status", async () => {
    installFetch(mockVonageResponse({
      "message-count": "1",
      messages: [{ to: "invalid", status: "6", "error-text": "Invalid number" }],
    }));

    const out = await run(
      {
        resource: "sms",
        operation: "send",
        from: "Test",
        to: "invalid",
        message: "Hello",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("processes multiple items independently", async () => {
    const out = await run(
      {
        resource: "sms",
        operation: "send",
        from: "MyApp",
        to: "={{ $json.dest }}",
        message: "={{ $json.text }}",
      },
      [
        { json: { dest: "+447700900001", text: "First" } },
        { json: { dest: "+447700900002", text: "Second" } },
      ],
    );

    expect(calls).toHaveLength(2);
    expect(out[0]).toHaveLength(2);
    for (const item of out[0]) {
      expect(item.json).toMatchObject({
        messages: [{ status: "0" }],
      });
    }
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "sms",
          operation: "send",
          from: "Test",
          to: "+447700900001",
          message: "Hello",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/vonageApi.*not configured/);
  });
});
