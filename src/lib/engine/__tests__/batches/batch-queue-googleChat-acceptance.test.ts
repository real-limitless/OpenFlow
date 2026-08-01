import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleChat";
const CREDS = { googleChatOAuth2Api: { accessToken: "tok_chat" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return text ? JSON.parse(text) : {};
    },
    async text() {
      return text;
    },
  };
}

type Handler = (url: string, method: string, body?: unknown) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
  lastMethod = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleChatOAuth2Api: { name: "googleChatOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleChat executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("create message", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/messages")) {
        return mockResponse({
          name: "spaces/AAA/messages/msg1",
          text: (body as Record<string, unknown>)?.text ?? "",
          sender: { name: "users/me", displayName: "Bot" },
          createTime: "2026-01-01T00:00:00Z",
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "message",
        operation: "create",
        spaceId: "={{ $json.spaceId }}",
        messageUi: { text: "={{ $json.messageText }}" },
      },
      [{ spaceId: "spaces/AAA", messageText: "Hello from workflow" }],
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    const item = out[0][0];
    expect((item.json.data as Record<string, unknown>).name).toMatch(/^spaces\/AAA\/messages\//);
    expect((item.json.data as Record<string, unknown>).text).toBe("Hello from workflow");
    expect((item.json.data as Record<string, unknown>).sender).toBeDefined();
  });

  it("list spaces", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/spaces")) {
        return mockResponse({
          spaces: [
            { name: "spaces/AAA", displayName: "Engineering", spaceType: "ROOM" },
            { name: "spaces/BBB", displayName: "Marketing", spaceType: "ROOM" },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "space",
        operation: "getAll",
        returnAll: true,
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    const items = out[0];
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.json.name).toBeDefined();
      expect(item.json.displayName).toBeDefined();
    }
  });

  it("sendAndWait approval", async () => {
    installFetch((url, method, body) => {
      if (method === "POST" && url.includes("/messages")) {
        const b = body as Record<string, unknown>;
        return mockResponse({
          name: "spaces/AAA/messages/msg2",
          text: b.text ?? "",
          cardsV2: b.cardsV2,
          sender: { name: "users/me", displayName: "Bot" },
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "message",
        operation: "sendAndWait",
        spaceId: "={{ $json.spaceId }}",
        message: "Please approve this request",
        responseType: "approval",
        approvalOptions: {
          values: {
            approvalType: "double",
            approveLabel: "✅ Approve",
            disapproveLabel: "❌ Decline",
          },
        },
        options: { appendAttribution: true },
      },
      [{ spaceId: "spaces/AAA" }],
    );

    expect(out).toHaveLength(1);
    const item = out[0][0];
    expect(item.json.data).toBeDefined();
  });

  it("sendAndWait freeText", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/messages")) {
        return mockResponse({ name: "spaces/AAA/messages/msg3" });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "message",
        operation: "sendAndWait",
        spaceId: "spaces/AAA",
        message: "Reply here",
        responseType: "freeText",
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0][0].json.data).toBeDefined();
  });

  it("sendAndWait customForm", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/messages")) {
        return mockResponse({ name: "spaces/AAA/messages/msg4" });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "message",
        operation: "sendAndWait",
        spaceId: "spaces/AAA",
        message: "Fill form",
        responseType: "customForm",
        options: { responseFormTitle: "Feedback", responseFormDescription: "Tell us" },
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0][0].json.data).toBeDefined();
  });

  it("delete message", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("spaces/AAA/messages/123")) {
        return mockResponse("", 204);
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "message",
        operation: "delete",
        messageId: "={{ $json.messageId }}",
      },
      [{ spaceId: "spaces/AAA", messageId: "spaces/AAA/messages/123", originalData: "keep" }],
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.originalData).toBe("keep");
    expect(out[0][0].json.spaceId).toBe("spaces/AAA");
    expect(out[0][0].json.messageId).toBe("spaces/AAA/messages/123");
  });

  it("get single membership", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("spaces/AAA/members/123")) {
        return mockResponse({
          name: "spaces/AAA/members/123",
          member: { name: "users/me", displayName: "Alice" },
          role: "ROLE_MEMBER",
          createTime: "2026-01-01T00:00:00Z",
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "member",
        operation: "get",
        memberId: "={{ $json.memberId }}",
      },
      [{ memberId: "spaces/AAA/members/123" }],
    );

    expect(out).toHaveLength(1);
    const item = out[0][0];
    expect((item.json.data as Record<string, unknown>).name).toBe("spaces/AAA/members/123");
    expect((item.json.data as Record<string, unknown>).role).toBe("ROLE_MEMBER");
    expect((item.json.data as Record<string, unknown>).member).toBeDefined();
    expect(((item.json.data as Record<string, unknown>).member as Record<string, unknown>).displayName).toBe("Alice");
  });

  it("getAll members", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("spaces/AAA/members")) {
        return mockResponse({
          memberships: [
            {
              name: "spaces/AAA/members/1",
              member: { name: "users/1", displayName: "Alice" },
              role: "ROLE_MEMBER",
            },
            {
              name: "spaces/AAA/members/2",
              member: { name: "users/2", displayName: "Bob" },
              role: "ROLE_MEMBER",
            },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        resource: "member",
        operation: "getAll",
        spaceId: "spaces/AAA",
        returnAll: true,
      },
      [{}],
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2);
    expect((out[0][0].json as Record<string, unknown>).name).toBe("spaces/AAA/members/1");
    expect(((out[0][0].json as Record<string, unknown>).member as Record<string, unknown>).displayName).toBe("Alice");
    expect((out[0][1].json as Record<string, unknown>).name).toBe("spaces/AAA/members/2");
  });

  it("continue on fail", async () => {
    installFetch(() => {
      return mockResponse({ error: { message: "not found" } }, 404);
    });

    const out = await run(
      {
        resource: "space",
        operation: "get",
        spaceId: "spaces/UNKNOWN",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });
});
