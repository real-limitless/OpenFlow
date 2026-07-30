import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.slack";

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

const CREDS = { slackApi: { accessToken: "xoxb-token-123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue slack — n8n-nodes-base.slack", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Slack");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.slack")).toBe(canonical);
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
    expect(calls[0].headers["Authorization"]).toBe("Bearer xoxb-token-123");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ name: "test-channel", is_private: false });
    expect(out[0][0].json).toMatchObject({
      id: "C1234567890",
      name: "test-channel",
      is_channel: true,
      is_private: false,
      created: 1699999999,
    });
  });

  it("sends a text message via chat.postMessage", async () => {
    installFetch(
      mockResponse({
        ok: true,
        channel: "C1234567890",
        ts: "1699999999.123456",
        message: { text: "Hello from n8n!", user: "U1234567890", type: "message" },
      }),
    );
    const out = await run(
      {
        resource: "message",
        operation: "post",
        select: "channel",
        channelId: { mode: "id", value: "C1234567890" },
        messageType: "text",
        text: "Hello from n8n!",
        otherOptions: {},
      },
      [{ message: "Hello from n8n!" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://slack.com/api/chat.postMessage");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ text: "Hello from n8n!", channel: "C1234567890" });
    expect(out[0][0].json).toMatchObject({
      ok: true,
      channel: "C1234567890",
      ts: "1699999999.123456",
      message: { text: "Hello from n8n!", user: "U1234567890", type: "message" },
    });
  });

  it("sends a Block Kit message via chat.postMessage", async () => {
    installFetch(
      mockResponse({
        ok: true,
        channel: "C1234567890",
        ts: "1699999999.123456",
        message: {
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: "*Hello* from Block Kit!" } },
          ],
        },
      }),
    );
    const out = await run({
      resource: "message",
      operation: "post",
      select: "channel",
      channelId: { mode: "id", value: "C1234567890" },
      messageType: "block",
      blocksUi:
        '[{"type":"section","text":{"type":"mrkdwn","text":"*Hello* from Block Kit!"}}]',
      text: "Fallback notification text",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.channel).toBe("C1234567890");
    expect(sentBody.text).toBe("Fallback notification text");
    expect(sentBody.blocks).toEqual([
      { type: "section", text: { type: "mrkdwn", text: "*Hello* from Block Kit!" } },
    ]);
    expect(out[0][0].json).toMatchObject({
      ok: true,
      channel: "C1234567890",
      ts: "1699999999.123456",
    });
  });

  it("uploads a binary file via files.upload", async () => {
    installFetch(
      mockResponse({
        ok: true,
        file: {
          id: "F1234567890",
          name: "test.txt",
          title: "Test File",
          mimetype: "text/plain",
          size: 123,
        },
      }),
    );
    const out = await run(
      {
        resource: "file",
        operation: "upload",
        binaryData: true,
        binaryPropertyName: "data",
        options: {
          channelIds: ["C1234567890"],
          initialComment: "Uploaded via n8n",
          title: "Test File",
        },
      },
      [
        {
          json: {},
          binary: {
            data: {
              fileName: "test.txt",
              mimeType: "text/plain",
              data: btoa("file content here"),
            },
          },
        },
      ],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://slack.com/api/files.upload");
    expect(calls[0].headers["Authorization"]).toBe("Bearer xoxb-token-123");
    expect(out[0][0].json).toMatchObject({
      id: "F1234567890",
      name: "test.txt",
      title: "Test File",
      mimetype: "text/plain",
      size: 123,
    });
  });

  it("adds a reaction to a message via reactions.add", async () => {
    installFetch(mockResponse({ ok: true }));
    const out = await run(
      {
        resource: "reaction",
        operation: "add",
        channelId: { mode: "id", value: "C1234567890" },
        timestamp: "={{ $json.ts }}",
        name: "+1",
      },
      [{ ts: "1699999999.123456" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://slack.com/api/reactions.add");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({
      channel: "C1234567890",
      timestamp: "1699999999.123456",
      name: "+1",
    });
    expect(out[0][0].json).toEqual({ ok: true });
  });

  it("gets user info via users.info", async () => {
    installFetch(
      mockResponse({
        ok: true,
        user: {
          id: "U1234567890",
          name: "john.doe",
          real_name: "John Doe",
          profile: { display_name: "John", email: "john@example.com" },
        },
      }),
    );
    const out = await run({
      resource: "user",
      operation: "info",
      user: { mode: "id", value: "U1234567890" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("https://slack.com/api/users.info?");
    expect(calls[0].url).toContain("user=U1234567890");
    expect(out[0][0].json).toMatchObject({
      id: "U1234567890",
      name: "john.doe",
      real_name: "John Doe",
      profile: { display_name: "John", email: "john@example.com" },
    });
  });

  it("creates a user group via usergroups.create", async () => {
    installFetch(
      mockResponse({
        ok: true,
        usergroup: {
          id: "S1234567890",
          name: "engineering-team",
          handle: "eng-team",
          description: "All engineers",
          users: [],
          channel_count: 1,
        },
      }),
    );
    const out = await run({
      resource: "userGroup",
      operation: "create",
      name: "engineering-team",
      Options: {
        handle: "eng-team",
        description: "All engineers",
        channelIds: ["C1234567890"],
        include_count: true,
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://slack.com/api/usergroups.create");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({
      name: "engineering-team",
      handle: "eng-team",
      description: "All engineers",
      channels: "C1234567890",
      include_count: true,
    });
    expect(out[0][0].json).toMatchObject({
      id: "S1234567890",
      name: "engineering-team",
      handle: "eng-team",
      description: "All engineers",
      users: [],
      channel_count: 1,
    });
  });

  it("gets all channels with filters via conversations.list", async () => {
    installFetch(
      mockResponse({
        ok: true,
        channels: [
          { id: "C1234567890", name: "general", is_channel: true, is_private: false },
          { id: "C0987654321", name: "random", is_channel: true, is_private: false },
        ],
        response_metadata: { next_cursor: "" },
      }),
    );
    const out = await run({
      resource: "channel",
      operation: "getAll",
      returnAll: true,
      filters: {
        types: ["public_channel", "private_channel"],
        excludeArchived: true,
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("https://slack.com/api/conversations.list?");
    expect(calls[0].url).toContain("types=public_channel%2Cprivate_channel");
    expect(calls[0].url).toContain("exclude_archived=true");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({
      id: "C1234567890",
      name: "general",
      is_channel: true,
      is_private: false,
    });
    expect(out[0][1].json).toMatchObject({
      id: "C0987654321",
      name: "random",
      is_channel: true,
      is_private: false,
    });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "message",
          operation: "post",
          select: "channel",
          channelId: { mode: "id", value: "C1234567890" },
          messageType: "text",
          text: "Hello",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/slackApi credential is not configured/);
  });

  it("throws on Slack API error (ok: false)", async () => {
    installFetch(mockResponse({ ok: false, error: "channel_not_found" }));
    await expect(
      run({
        resource: "message",
        operation: "post",
        select: "channel",
        channelId: { mode: "id", value: "C_INVALID" },
        messageType: "text",
        text: "Hello",
      }),
    ).rejects.toThrow(/channel_not_found/);
  });

  it("continueOnFail emits error item on API error and continues", async () => {
    const responses = [
      mockResponse({ ok: false, error: "channel_not_found" }),
      mockResponse({ ok: true, channel: "C1234567890", ts: "1699999999.123456", message: {} }),
    ];
    let idx = 0;
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
        return responses[idx++] ?? responses[responses.length - 1];
      }),
    );

    const out = await run(
      {
        resource: "message",
        operation: "post",
        select: "channel",
        channelId: "={{ $json.channel }}",
        messageType: "text",
        text: "Hello",
      },
      [{ channel: "C_INVALID" }, { channel: "C1234567890" }],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toContain("channel_not_found");
    expect(out[0][1].json).toMatchObject({ ok: true, channel: "C1234567890" });
  });

  it("throws on invalid JSON in blocks", async () => {
    await expect(
      run({
        resource: "message",
        operation: "post",
        select: "channel",
        channelId: { mode: "id", value: "C1234567890" },
        messageType: "block",
        blocksUi: "{invalid json",
        text: "Fallback",
      }),
    ).rejects.toThrow(/invalid JSON in blocks/);
  });

  it("deletes a message via chat.delete", async () => {
    installFetch(mockResponse({ ok: true, channel: "C1234567890", ts: "1699999999.123456" }));
    const out = await run({
      resource: "message",
      operation: "delete",
      select: "channel",
      channelId: { mode: "id", value: "C1234567890" },
      timestamp: "1699999999.123456",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://slack.com/api/chat.delete");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody).toEqual({ channel: "C1234567890", ts: "1699999999.123456" });
    expect(out[0][0].json).toMatchObject({ ok: true });
  });

  it("uses OAuth2 credential when authentication is oAuth2", async () => {
    installFetch(mockResponse({ ok: true, user: { id: "U123", name: "test" } }));
    await run(
      {
        resource: "user",
        operation: "info",
        authentication: "oAuth2",
        user: { mode: "id", value: "U123" },
      },
      [{}],
      { credentials: { slackOAuth2Api: { accessToken: "xoxp-oauth-token" } } },
    );

    expect(calls[0].headers["Authorization"]).toBe("Bearer xoxp-oauth-token");
  });
});