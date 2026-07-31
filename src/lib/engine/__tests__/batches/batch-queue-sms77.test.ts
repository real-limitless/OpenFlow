import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sms77";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const map = new Map<string, string>([["content-type", "application/json"]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
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
      return text ? JSON.parse(text) : null;
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
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse({}),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
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
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = {
  sms77Api: {
    apiKey: "test-seven-api-key",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue sms77 — n8n-nodes-base.sms77", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("seven");
  });

  describe("sms send", () => {
    it("sends an SMS via the seven API", async () => {
      const apiResponse = {
        success: "100",
        total_price: 0.075,
        balance: 593.994,
        debug: "false",
        sms_type: "direct",
        messages: [
          {
            id: "77229318510",
            sender: "OpenFlow",
            recipient: "49176123456789",
            text: "Hello from OpenFlow",
            encoding: "gsm",
            parts: 1,
            price: 0.075,
            success: true,
          },
        ],
      };
      installFetch({
        "POST https://gateway.seven.io/api/sms": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "sms",
        operation: "send",
        to: "+49176123456789",
        text: "Hello from OpenFlow",
        from: "OpenFlow",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://gateway.seven.io/api/sms");
      expect(calls[0].headers["X-Api-Key"]).toBe("test-seven-api-key");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({
        to: "+49176123456789",
        text: "Hello from OpenFlow",
        from: "OpenFlow",
      });
      expect(out[0][0].json).toMatchObject({
        success: "100",
        messages: expect.arrayContaining([expect.objectContaining({ success: true })]),
      });
    });

    it("sends SMS with additional fields", async () => {
      const apiResponse = {
        success: "100",
        total_price: 0.075,
        balance: 593.994,
        messages: [{ id: "77229318511", recipient: "49176123456789", success: true }],
      };
      installFetch({
        "POST https://gateway.seven.io/api/sms": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "sms",
        operation: "send",
        to: "+49176123456789",
        text: "Flash alert",
        additionalFields: {
          flash: true,
          label: "test-alert",
        },
      });
      const sent = JSON.parse(calls[0].body as string);
      expect(sent.flash).toBe(true);
      expect(sent.label).toBe("test-alert");
      expect(out[0][0].json).toMatchObject({
        messages: expect.arrayContaining([expect.objectContaining({ success: true })]),
      });
    });

    it("sends SMS with additional fields and resolves expression values", async () => {
      const apiResponse = {
        success: "100",
        total_price: 0.075,
        balance: 593.994,
        messages: [{ id: "77229318511", recipient: "49176123456789", success: true }],
      };
      installFetch({
        "POST https://gateway.seven.io/api/sms": mockResponse(apiResponse),
      });
      const out = await run(
        {
          resource: "sms",
          operation: "send",
          to: "={{ $json.phone }}",
          text: "={{ $json.message }}",
          from: "{{ $json.sender }}",
          additionalFields: {
            flash: true,
            label: "=" + "$json.tag",
          },
        },
        [{ phone: "+49176123456789", message: "Hello from OpenFlow", sender: "OpenFlow", tag: "test-alert" }],
      );
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({
        to: "+49176123456789",
        text: "Hello from OpenFlow",
        from: "OpenFlow",
        flash: true,
        label: "test-alert",
      });
      expect(out[0][0].json).toMatchObject({
        messages: expect.arrayContaining([expect.objectContaining({ success: true })]),
      });
    });

    it("makes one request per input item with expression resolution", async () => {
      const apiResponse = { success: "100", messages: [{ id: "m1", success: true }] };
      installFetch({
        "POST https://gateway.seven.io/api/sms": mockResponse(apiResponse),
      });
      const out = await run(
        {
          resource: "sms",
          operation: "send",
          to: "={{ $json.phone }}",
          text: "={{ $json.msg }}",
        },
        [
          { phone: "+491111111111", msg: "First" },
          { phone: "+492222222222", msg: "Second" },
        ],
      );
      expect(calls).toHaveLength(2);
      const body0 = JSON.parse(calls[0].body as string);
      const body1 = JSON.parse(calls[1].body as string);
      expect(body0.to).toBe("+491111111111");
      expect(body0.text).toBe("First");
      expect(body1.to).toBe("+492222222222");
      expect(body1.text).toBe("Second");
      expect(out[0]).toHaveLength(2);
    });
  });

  describe("voice send", () => {
    it("sends a voice call via the seven API", async () => {
      const apiResponse = {
        success: "100",
        total_price: 0.05,
        balance: 593.994,
        messages: [{ id: "voice-123", recipient: "49176123456789", success: true }],
      };
      installFetch({
        "POST https://gateway.seven.io/api/voice": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "voice",
        operation: "send",
        to: "+49176123456789",
        text: "Your appointment is tomorrow at 10 AM",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://gateway.seven.io/api/voice");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({
        to: "+49176123456789",
        text: "Your appointment is tomorrow at 10 AM",
      });
      expect(out[0][0].json).toMatchObject({
        success: "100",
        messages: expect.arrayContaining([expect.objectContaining({ success: true })]),
      });
    });
  });

  describe("errors", () => {
    it("throws on missing credential", async () => {
      await expect(
        run({ resource: "sms", operation: "send", to: "+49", text: "Hi" }, [{}], {
          credentials: {},
        }),
      ).rejects.toThrow("seven: sms77Api credential is required");
    });

    it("throws on non-100/101 success code from API", async () => {
      const apiResponse = {
        success: "201",
        messages: [],
        debug: "invalid sender",
      };
      installFetch({
        "POST https://gateway.seven.io/api/sms": mockResponse(apiResponse),
      });
      await expect(
        run({
          resource: "sms",
          operation: "send",
          to: "+49176123456789",
          text: "test",
        }),
      ).rejects.toThrow(/201/);
    });

    it("throws on empty to and text without API call", async () => {
      await expect(
        run({
          resource: "sms",
          operation: "send",
          to: "",
          text: "",
        }),
      ).rejects.toThrow("seven: to and text are required");
      expect(calls).toHaveLength(0);
    });

    it("continueOnFail returns error items", async () => {
      installFetch({
        "POST https://gateway.seven.io/api/sms": mockResponse(
          { error: "invalid sender" },
          { status: 400 },
        ),
      });
      const out = await run(
        {
          resource: "sms",
          operation: "send",
          to: "+49176123456789",
          text: "test",
        },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({
        message: expect.stringContaining("invalid sender"),
      });
    });
  });
});
