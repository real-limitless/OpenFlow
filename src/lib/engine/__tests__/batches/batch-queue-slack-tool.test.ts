import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.slackTool";

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
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ ok: true })) {
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

const CREDS = { slackApi: { accessToken: "xoxb-token-123" } };

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

describe("batch-queue slackTool — n8n-nodes-base.slackTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Slack (AI Tool)");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.slackTool")).toBe(canonical);
  });

  it("posts a message to a channel", async () => {
    installFetch(
      mockResponse({
        ok: true,
        channel: "C1234567890",
        ts: "1699999999.123456",
        message: { text: "Hello from AI tool!", user: "U1234567890", type: "message" },
      }),
    );
    const out = await run({
      resource: "message",
      operation: "post",
      select: "channel",
      channelId: "C1234567890",
      text: "Hello from AI tool!",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://slack.com/api/chat.postMessage");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ channel: "C1234567890", text: "Hello from AI tool!" });
    expect(out[0][0].json).toMatchObject({
      ok: true,
      channel: "C1234567890",
      ts: "1699999999.123456",
    });
  });

  it("creates a public channel via conversations.create", async () => {
    installFetch(
      mockResponse({
        ok: true,
        channel: {
          id: "C1234567890",
          name: "test-channel",
          is_channel: true,
          is_private: false,
          created: 1699999999,
        },
      }),
    );
    const out = await run({
      resource: "channel",
      operation: "create",
      channelId: "test-channel",
      channelVisibility: "public",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://slack.com/api/conversations.create");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ name: "test-channel", is_private: false });
    expect(out[0][0].json).toMatchObject({
      id: "C1234567890",
      name: "test-channel",
    });
  });

  it("gets user info", async () => {
    installFetch(
      mockResponse({
        ok: true,
        user: {
          id: "U1234567890",
          name: "testuser",
          real_name: "Test User",
        },
      }),
    );
    const out = await run({
      resource: "user",
      operation: "info",
      user: "U1234567890",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("users.info");
    expect(out[0][0].json).toMatchObject({ id: "U1234567890", name: "testuser" });
  });

  it("lists users", async () => {
    installFetch(
      mockResponse({
        ok: true,
        members: [
          { id: "U1", name: "user1" },
          { id: "U2", name: "user2" },
        ],
      }),
    );
    const out = await run({
      resource: "user",
      operation: "getAll",
      returnAll: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("users.list");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "U1", name: "user1" });
    expect(out[0][1].json).toMatchObject({ id: "U2", name: "user2" });
  });

  it("deletes a message", async () => {
    installFetch(
      mockResponse({
        ok: true,
        channel: "C1234567890",
        ts: "1699999999.123456",
      }),
    );
    const out = await run({
      resource: "message",
      operation: "delete",
      channelId: "C1234567890",
      ts: "1699999999.123456",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://slack.com/api/chat.delete");
    expect(out[0][0].json).toMatchObject({ ok: true });
  });

  it("updates a message", async () => {
    installFetch(
      mockResponse({
        ok: true,
        channel: "C1234567890",
        ts: "1699999999.123456",
        message: { text: "Updated text" },
      }),
    );
    const out = await run({
      resource: "message",
      operation: "update",
      channelId: "C1234567890",
      ts: "1699999999.123456",
      text: "Updated text",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://slack.com/api/chat.update");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ channel: "C1234567890", ts: "1699999999.123456", text: "Updated text" });
  });

  it("searches messages", async () => {
    installFetch(
      mockResponse({
        ok: true,
        messages: {
          matches: [
            { text: "result 1", channel: "C1" },
            { text: "result 2", channel: "C2" },
          ],
        },
      }),
    );
    const out = await run({
      resource: "message",
      operation: "search",
      query: "quarterly report",
      sort: "timestamp",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("search.messages");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.text).toBe("result 1");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "message",
          operation: "post",
          channelId: "C123",
          text: "Hello",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/slackApi credential is not configured/);
  });

  it("continues on fail when continueOnFail is set", async () => {
    installFetch(
      mockResponse({ ok: false, error: "channel_not_found" }, { status: 200 }),
    );
    const out = await run(
      {
        resource: "message",
        operation: "post",
        channelId: "C123",
        text: "Hello",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("channel_not_found") });
  });
});
