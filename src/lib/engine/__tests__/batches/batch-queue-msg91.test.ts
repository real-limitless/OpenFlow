import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.msg91";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get() { return null; },
      forEach() { /* noop */ },
    },
    async text() { return text; },
  };
}

let calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string | undefined }>;
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse(null),
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
  msg91Api: {
    authkey: "test-msg91-authkey",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue msg91 — n8n-nodes-base.msg91", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).toBeDefined();
  });

  it("sends an SMS via the MSG91 API", async () => {
    const apiResponse = { type: "success", message: "Sent successfully" };
    installFetch({
      "POST https://api.msg91.com/api/v5/flow/": mockResponse(apiResponse),
    });
    const out = await run({
      resource: "sms",
      operation: "send",
      from: "TXTSMS",
      to: "919999999999",
      message: "Hello from n8n",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.msg91.com/api/v5/flow/");
    const body = new URLSearchParams(calls[0].body!);
    expect(body.get("authkey")).toBe("test-msg91-authkey");
    expect(body.get("sender")).toBe("TXTSMS");
    expect(body.get("mobiles")).toBe("919999999999");
    expect(body.get("message")).toBe("Hello from n8n");
    expect(out[0][0].json).toMatchObject({
      smsSent: { type: "success" },
    });
  });

  it("sends SMS per input item with expression resolution", async () => {
    const apiResponse = { type: "success", message: "Sent" };
    installFetch({
      "POST https://api.msg91.com/api/v5/flow/": mockResponse(apiResponse),
    });
    const out = await run(
      {
        resource: "sms",
        operation: "send",
        from: "SHOPIFY",
        to: "={{ $json.phone }}",
        message: "={{ $json.text }}",
      },
      [
        { json: { phone: "919000000001", text: "Order confirmed #1" } },
        { json: { phone: "919000000002", text: "Order confirmed #2" } },
      ],
    );
    expect(calls).toHaveLength(2);
    const body0 = new URLSearchParams(calls[0].body!);
    const body1 = new URLSearchParams(calls[1].body!);
    expect(body0.get("mobiles")).toBe("919000000001");
    expect(body0.get("message")).toBe("Order confirmed #1");
    expect(body1.get("mobiles")).toBe("919000000002");
    expect(body1.get("message")).toBe("Order confirmed #2");
    expect(out[0]).toHaveLength(2);
  });

  it("throws on missing credential", async () => {
    await expect(
      run({ resource: "sms", operation: "send", from: "T", to: "9", message: "Hi" }, [{}], {
        credentials: {},
      }),
    ).rejects.toThrow("MSG91: msg91Api credential is required");
  });

  it("throws on missing required field", async () => {
    await expect(
      run({
        resource: "sms",
        operation: "send",
        from: "TXTSMS",
        to: "",
        message: "Missing recipient",
      }),
    ).rejects.toThrow("MSG91: to (recipient) is required");
    expect(calls).toHaveLength(0);
  });

  it("throws on missing sender", async () => {
    await expect(
      run({
        resource: "sms",
        operation: "send",
        from: "",
        to: "919999999999",
        message: "Missing sender",
      }),
    ).rejects.toThrow("MSG91: from (sender ID) is required");
    expect(calls).toHaveLength(0);
  });

  it("throws on missing message", async () => {
    await expect(
      run({
        resource: "sms",
        operation: "send",
        from: "TXTSMS",
        to: "919999999999",
        message: "",
      }),
    ).rejects.toThrow("MSG91: message is required");
    expect(calls).toHaveLength(0);
  });

  it("continueOnFail attaches error to item", async () => {
    const out = await run(
      {
        resource: "sms",
        operation: "send",
        from: "TXTSMS",
        to: "",
        message: "Missing recipient",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("_error", "MSG91: to (recipient) is required");
    expect(calls).toHaveLength(0);
  });

  it("continueOnFail on API error", async () => {
    installFetch({
      "POST https://api.msg91.com/api/v5/flow/": mockResponse({ type: "error", message: "Invalid sender" }),
    });
    const out = await run(
      {
        resource: "sms",
        operation: "send",
        from: "TXTSMS",
        to: "919999999999",
        message: "test",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("_error");
    expect(String((out[0][0].json as Record<string, unknown>)._error)).toContain("Invalid sender");
  });
});
