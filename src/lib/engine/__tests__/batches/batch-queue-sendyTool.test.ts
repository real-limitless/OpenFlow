import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sendyTool";

function mockResponse(body: string, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(_name: string) { return "text/plain"; },
      entries() { return new Map([["content-type", "text/plain"]]).entries(); },
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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse("1")) {
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

describe("batch-queue sendyTool — n8n-nodes-base.sendyTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Sendy (AI Tool)");
  });

  // -----------------------------------------------------------------------
  // Acceptance test: subscriber add via AI tool
  // -----------------------------------------------------------------------

  it("subscriber:add returns raw response string (acceptance test)", async () => {
    installFetch(mockResponse("1"));
    const out = await run({
      resource: "subscriber",
      operation: "add",
      email: "user@example.com",
      listId: "abc123",
      additionalFields: { name: "Test User" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://sendy.example.com/subscribe");

    const body = new URLSearchParams(calls[0].body!);
    expect(body.get("email")).toBe("user@example.com");
    expect(body.get("list")).toBe("abc123");
    expect(body.get("name")).toBe("Test User");

    expect(out[0][0].json).toEqual({ response: "1" });
  });

  // -----------------------------------------------------------------------
  // Acceptance test: campaign create with sendCampaign
  // -----------------------------------------------------------------------

  it("campaign:create returns raw response string (acceptance test)", async () => {
    installFetch(mockResponse("1"));
    const out = await run({
      resource: "campaign",
      operation: "create",
      fromName: "Newsletter",
      fromEmail: "news@example.com",
      replyTo: "reply@example.com",
      title: "August Updates",
      subject: "August 2026",
      htmlText: "<h1>Updates</h1>",
      sendCampaign: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sendy.example.com/api/campaigns/create.php");

    const body = new URLSearchParams(calls[0].body!);
    expect(body.get("send_campaign")).toBe("true");

    expect(out[0][0].json).toEqual({ response: "1" });
  });

  // -----------------------------------------------------------------------
  // Acceptance test: subscriber status lookup
  // -----------------------------------------------------------------------

  it("subscriber:status returns raw status string (acceptance test)", async () => {
    installFetch(mockResponse("Subscribed"));
    const out = await run({
      resource: "subscriber",
      operation: "status",
      email: "={{ $json.email }}",
      listId: "abc123",
    }, [{ email: "test@example.com" }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sendy.example.com/api/subscribers/subscription-status.php");
    expect(out[0][0].json).toEqual({ response: "Subscribed" });
  });

  // -----------------------------------------------------------------------
  // Acceptance test: error handling with continueOnFail
  // -----------------------------------------------------------------------

  it("produces error items with continueOnFail", async () => {
    const responses = [mockResponse("Some fields missing."), mockResponse("1")];
    let callIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const resp = responses[callIndex];
        callIndex++;
        return resp;
      }),
    );

    const out = await run(
      {
        resource: "subscriber",
        operation: "add",
        email: "={{ $json.email }}",
        listId: "abc123",
      },
      [{ email: "bad" }, { email: "good@example.com" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ error: "Sendy: Some fields missing." });
    expect(out[0][1].json).toEqual({ response: "1" });
  });

  // -----------------------------------------------------------------------
  // Additional operations
  // -----------------------------------------------------------------------

  it("subscriber:count returns raw response", async () => {
    installFetch(mockResponse("42"));
    const out = await run({
      resource: "subscriber",
      operation: "count",
      listId: "abc123",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sendy.example.com/api/subscribers/active-subscriber-count.php");
    expect(out[0][0].json).toEqual({ response: "42" });
  });

  it("subscriber:delete returns raw response", async () => {
    installFetch(mockResponse("1"));
    const out = await run({
      resource: "subscriber",
      operation: "delete",
      email: "test@example.com",
      listId: "abc123",
    });

    expect(calls[0].url).toBe("https://sendy.example.com/api/subscribers/delete.php");
    expect(out[0][0].json).toEqual({ response: "1" });
  });

  it("subscriber:remove returns raw response", async () => {
    installFetch(mockResponse("1"));
    const out = await run({
      resource: "subscriber",
      operation: "remove",
      email: "test@example.com",
      listId: "abc123",
    });

    expect(calls[0].url).toBe("https://sendy.example.com/unsubscribe");
    expect(out[0][0].json).toEqual({ response: "1" });
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
        listId: "abc123",
      }),
    ).rejects.toThrow("Sendy: Subscriber does not exist");
  });
});
