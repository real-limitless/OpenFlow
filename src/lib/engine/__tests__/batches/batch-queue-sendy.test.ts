import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sendy";

function mockResponse(body: string, status = 200) {
  const map = new Map<string, string>([["content-type", "text/plain"]]);
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(body); },
    async text() { return body; },
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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse("true")) {
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

const CREDS = { sendyApi: { url: "https://sendy.example.com", apiKey: "test-api-key" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue sendy — n8n-nodes-base.sendy", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Sendy");
  });

  // -----------------------------------------------------------------------
  // Subscriber: add
  // -----------------------------------------------------------------------

  it("subscriber:add sends correct form data", async () => {
    installFetch(mockResponse("true"));
    const out = await run({
      resource: "subscriber",
      operation: "add",
      email: "test@example.com",
      listId: "abc123def456",
      additionalFields: { name: "Test User" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://sendy.example.com/subscribe");

    const body = new URLSearchParams(calls[0].body!);
    expect(body.get("email")).toBe("test@example.com");
    expect(body.get("list")).toBe("abc123def456");
    expect(body.get("name")).toBe("Test User");
    expect(body.get("api_key")).toBe("test-api-key");
    expect(body.get("boolean")).toBe("true");

    expect(out[0][0].json).toEqual({ success: true });
  });

  it("subscriber:add accepts acceptance test fixture", async () => {
    installFetch(mockResponse("true"));
    const out = await run({
      resource: "subscriber",
      operation: "add",
      email: "test@example.com",
      listId: "abc123def456",
      additionalFields: { name: "Test User" },
    });

    expect(out[0][0].json).toEqual({ success: true });
  });

  // -----------------------------------------------------------------------
  // Subscriber: count
  // -----------------------------------------------------------------------

  it("subscriber:count returns count from API", async () => {
    installFetch(mockResponse("42"));
    const out = await run({
      resource: "subscriber",
      operation: "count",
      listId: "abc123def456",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sendy.example.com/api/subscribers/active-subscriber-count.php");
    expect(out[0][0].json).toEqual({ count: "42" });
  });

  // -----------------------------------------------------------------------
  // Subscriber: status
  // -----------------------------------------------------------------------

  it("subscriber:status returns status string", async () => {
    installFetch(mockResponse("Subscribed"));
    const out = await run({
      resource: "subscriber",
      operation: "status",
      email: "test@example.com",
      listId: "abc123def456",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sendy.example.com/api/subscribers/subscription-status.php");
    expect(out[0][0].json).toEqual({ status: "Subscribed" });
  });

  // -----------------------------------------------------------------------
  // Subscriber: delete
  // -----------------------------------------------------------------------

  it("subscriber:delete returns success", async () => {
    installFetch(mockResponse("true"));
    const out = await run({
      resource: "subscriber",
      operation: "delete",
      email: "test@example.com",
      listId: "abc123def456",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sendy.example.com/api/subscribers/delete.php");
    expect(out[0][0].json).toEqual({ success: true });
  });

  // -----------------------------------------------------------------------
  // Subscriber: remove (unsubscribe)
  // -----------------------------------------------------------------------

  it("subscriber:remove calls unsubscribe endpoint", async () => {
    installFetch(mockResponse("true"));
    const out = await run({
      resource: "subscriber",
      operation: "remove",
      email: "test@example.com",
      listId: "abc123def456",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sendy.example.com/unsubscribe");
    expect(out[0][0].json).toEqual({ success: true });
  });

  // -----------------------------------------------------------------------
  // Campaign: create
  // -----------------------------------------------------------------------

  it("campaign:create creates campaign draft", async () => {
    installFetch(mockResponse("Campaign created"));
    const out = await run({
      resource: "campaign",
      operation: "create",
      fromName: "Newsletter",
      fromEmail: "newsletter@example.com",
      replyTo: "reply@example.com",
      title: "July Newsletter",
      subject: "Your July Update",
      htmlText: "<h1>Hello</h1>",
      sendCampaign: false,
      brandId: "brand123",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sendy.example.com/api/campaigns/create.php");

    const body = new URLSearchParams(calls[0].body!);
    expect(body.get("from_name")).toBe("Newsletter");
    expect(body.get("from_email")).toBe("newsletter@example.com");
    expect(body.get("reply_to")).toBe("reply@example.com");
    expect(body.get("title")).toBe("July Newsletter");
    expect(body.get("subject")).toBe("Your July Update");
    expect(body.get("html_text")).toBe("<h1>Hello</h1>");
    expect(body.get("send_campaign")).toBe("false");
    expect(body.get("brand_id")).toBe("brand123");

    expect(out[0][0].json).toEqual({ message: "Campaign created" });
  });

  it("campaign:create creates and sends campaign", async () => {
    installFetch(mockResponse("Campaign created and now sending"));
    const out = await run({
      resource: "campaign",
      operation: "create",
      fromName: "Newsletter",
      fromEmail: "newsletter@example.com",
      replyTo: "reply@example.com",
      title: "Urgent",
      subject: "Breaking News",
      htmlText: "<h1>Flash</h1>",
      sendCampaign: true,
    });

    const body = new URLSearchParams(calls[0].body!);
    expect(body.get("send_campaign")).toBe("true");
    expect(body.get("brand_id")).toBeNull();

    expect(out[0][0].json).toEqual({ message: "Campaign created and now sending" });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "subscriber", operation: "add", email: "test@example.com", listId: "abc" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/sendyApi credential is not configured/);
  });

  it("throws when required params are missing", async () => {
    await expect(
      run({ resource: "subscriber", operation: "add" }),
    ).rejects.toThrow(/email and listId are required/);
  });

  it("throws on error response from API", async () => {
    installFetch(mockResponse("Subscriber does not exist"));
    await expect(
      run({
        resource: "subscriber",
        operation: "delete",
        email: "nonexistent@example.com",
        listId: "abc123def456",
      }),
    ).rejects.toThrow("Subscriber does not exist");
  });

  it("throws when brandId missing for draft campaign", async () => {
    await expect(
      run({
        resource: "campaign",
        operation: "create",
        fromName: "N",
        fromEmail: "n@example.com",
        replyTo: "r@example.com",
        title: "T",
        subject: "S",
        htmlText: "<p>H</p>",
        sendCampaign: false,
      }),
    ).rejects.toThrow(/brandId is required/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse("Some error"));
    const out = await run(
      {
        resource: "subscriber",
        operation: "add",
        email: "test@example.com",
        listId: "abc123def456",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});
