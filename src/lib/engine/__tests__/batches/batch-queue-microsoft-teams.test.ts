import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftTeams";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ id: "msg-1" })) {
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

async function run(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>>,
  continueOnFail = false,
): Promise<INodeExecutionData[]> {
  const node = makeNode({ type: TYPE, parameters: params });
  const ctx = createExecutionContext({
    node,
    workflow: { id: "wf-test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => toItems(inputItems),
    continueOnFail,
    getCredential: async (_name: string) => ({ accessToken: "mock-token" }),
  });
  const executor = getExecutor(TYPE);
  expect(executor).toBeDefined();
  const result = await executor!(ctx, node);
  return result[0] ?? [];
}

describe("Microsoft Teams node", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should have an executor registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("should have a description registered", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc?.name).toBe(TYPE);
  });

  describe("channel resource", () => {
    it("should list channels (getAll)", async () => {
      const channelList = {
        value: [
          { id: "ch-1", displayName: "General" },
          { id: "ch-2", displayName: "Random" },
        ],
      };
      nextResponse = mockResponse(channelList);
      const result = await run(
        { resource: "channel", operation: "getAll", teamId: "team-123", returnAll: true },
        [{ json: { teamId: "team-123" } }],
      );
      expect(result).toHaveLength(2);
      expect(result[0].json.id).toBe("ch-1");
      expect(result[1].json.displayName).toBe("Random");
      expect(calls[0].url).toContain("/teams/team-123/channels");
    });

    it("should create a channel", async () => {
      const created = { id: "ch-3", displayName: "New Channel", description: "Test channel" };
      nextResponse = mockResponse(created);
      const result = await run(
        {
          resource: "channel",
          operation: "create",
          teamId: "team-123",
          displayName: "New Channel",
          description: "Test channel",
        },
        [{}],
      );
      expect(result[0].json.id).toBe("ch-3");
      expect(calls[0].method).toBe("POST");
    });

    it("should delete a channel and pass through input", async () => {
      nextResponse = mockResponse(null, { status: 204 });
      const result = await run(
        { resource: "channel", operation: "delete", teamId: "team-123", channelId: "ch-1" },
        [{ json: { teamId: "team-123" } }],
      );
      expect(result[0].json).toEqual({ teamId: "team-123" });
      expect(calls[0].method).toBe("DELETE");
    });

    it("should get a channel by id", async () => {
      const channel = { id: "ch-1", displayName: "General" };
      nextResponse = mockResponse(channel);
      const result = await run(
        { resource: "channel", operation: "get", teamId: "team-123", channelId: "ch-1" },
        [{}],
      );
      expect(result[0].json.id).toBe("ch-1");
    });

    it("should update a channel", async () => {
      const updated = { id: "ch-1", displayName: "Updated Channel" };
      nextResponse = mockResponse(updated);
      const result = await run(
        {
          resource: "channel",
          operation: "update",
          teamId: "team-123",
          channelId: "ch-1",
          displayName: "Updated Channel",
        },
        [{}],
      );
      expect(result[0].json.displayName).toBe("Updated Channel");
      expect(calls[0].method).toBe("PATCH");
    });
  });

  describe("channelMessage resource", () => {
    it("should create a channel message", async () => {
      const createdMsg = {
        id: "msg-1",
        messageType: "message",
        body: { content: "Hello from n8n" },
      };
      nextResponse = mockResponse(createdMsg);
      const result = await run(
        {
          resource: "channelMessage",
          operation: "create",
          teamId: "{{ $json.teamId }}",
          channelId: "{{ $json.channelId }}",
          messageType: "text",
          messageText: "{{ $json.body }}",
        },
        [{ json: { teamId: "team-123", channelId: "channel-456", body: "Hello from n8n" } }],
      );
      expect(result[0].json.id).toBe("msg-1");
      expect(result[0].json.messageType).toBe("message");
      expect(result[0].json.body.content).toBe("Hello from n8n");
      expect(calls[0].url).toContain("/teams/team-123/channels/channel-456/messages");
      expect(calls[0].method).toBe("POST");
    });

    it("should list channel messages (getAll paginated)", async () => {
      const page1 = {
        value: [
          { id: "m1", body: { content: "First" } },
          { id: "m2", body: { content: "Second" } },
        ],
        "@odata.nextLink": `${callGraphBase}/teams/team-123/channels/ch-1/messages?$skip=2`,
      };
      // Tease the paginated helper into getting a second page within limit
      const page2 = { value: [{ id: "m3", body: { content: "Third" } }] };
      nextResponse = mockResponse(page1);
      // Override inline below for two calls
      vi.restoreAllMocks();
      let callCount = 0;
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
          callCount++;
          return callCount === 1 ? mockResponse(page1) : mockResponse(page2);
        }),
      );
      const result = await run(
        {
          resource: "channelMessage",
          operation: "getAll",
          teamId: "team-123",
          channelId: "ch-1",
          returnAll: true,
        },
        [{ json: { teamId: "team-123", channelId: "ch-1" } }],
      );
      // Should have all 3 messages from both pages
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("chatMessage resource", () => {
    it("should create a chat message", async () => {
      const created = { id: "cm-1", body: { content: "Hello" } };
      nextResponse = mockResponse(created);
      const result = await run(
        {
          resource: "chatMessage",
          operation: "create",
          chatId: "chat-789",
          messageText: "Hello",
        },
        [{}],
      );
      expect(result[0].json.id).toBe("cm-1");
      expect(calls[0].url).toContain("/chats/chat-789/messages");
    });

    it("should get a chat message by id", async () => {
      const msg = { id: "cm-1", body: { content: "Hello" } };
      nextResponse = mockResponse(msg);
      const result = await run(
        { resource: "chatMessage", operation: "get", chatId: "chat-789", messageId: "cm-1" },
        [{}],
      );
      expect(result[0].json.id).toBe("cm-1");
    });

    it("should list chat messages", async () => {
      const list = { value: [{ id: "cm-1" }, { id: "cm-2" }] };
      nextResponse = mockResponse(list);
      const result = await run(
        { resource: "chatMessage", operation: "getAll", chatId: "chat-789", returnAll: true },
        [{}],
      );
      expect(result).toHaveLength(2);
    });
  });

  describe("task resource", () => {
    it("should create a task", async () => {
      const created = { id: "task-1", title: "Ship release" };
      nextResponse = mockResponse(created);
      const result = await run(
        {
          resource: "task",
          operation: "create",
          teamId: "{{ $json.teamId }}",
          taskTitle: "{{ $json.title }}",
          dueDateTime: "{{ $json.due }}",
        },
        [{ json: { teamId: "team-123", title: "Ship release", due: "2026-08-20" } }],
      );
      expect(result[0].json.id).toBe("task-1");
      expect(result[0].json.title).toBe("Ship release");
      expect(calls[0].url).toContain("/planner/tasks");
      expect(calls[0].method).toBe("POST");
    });

    it("should delete a task", async () => {
      nextResponse = mockResponse(null, { status: 204 });
      const result = await run(
        { resource: "task", operation: "delete", taskId: "task-1" },
        [{ json: { taskId: "task-1" } }],
      );
      expect(result[0].json).toEqual({ taskId: "task-1" });
      expect(calls[0].method).toBe("DELETE");
    });

    it("should get a task by id", async () => {
      const task = { id: "task-1", title: "Ship release" };
      nextResponse = mockResponse(task);
      const result = await run(
        { resource: "task", operation: "get", taskId: "task-1" },
        [{}],
      );
      expect(result[0].json.id).toBe("task-1");
    });
  });

  describe("sendAndWait placeholder", () => {
    it("should emit a placeholder outcome without hanging", async () => {
      const result = await run(
        {
          resource: "chatMessage",
          operation: "sendAndWait",
          chatId: "chat-789",
          messageText: "Approve the release?",
          responseType: "approval",
        },
        [{ json: { chatId: "chat-789", approver: "manager@example.com" } }],
      );
      // Must not emit bare success — spec says placeholder with approved/timeout flags
      expect(result[0].json).not.toHaveProperty("success");
      expect(result[0].json).not.toHaveProperty("_sendAndWait");
      expect(result[0].json).toHaveProperty("approved");
      expect(result[0].json).toHaveProperty("timeout");
    });
  });

  describe("error handling", () => {
    it("should emit error item with continueOnFail", async () => {
      nextResponse = mockResponse(
        { error: { message: "Resource not found" } },
        { status: 404 },
      );
      const result = await run(
        {
          resource: "channel",
          operation: "delete",
          teamId: "team-123",
          channelId: "NONEXISTENT",
          continueOnFail: true,
        },
        [{ json: { teamId: "team-123", channelId: "NONEXISTENT" } }],
        true,
      );
      expect(result[0].json).toHaveProperty("error");
      expect(typeof result[0].json.error).toBe("string");
    });

    it("should throw when continueOnFail is false", async () => {
      nextResponse = mockResponse(
        { error: { message: "Not found" } },
        { status: 404 },
      );
      await expect(
        run(
          { resource: "channel", operation: "delete", teamId: "team-123", channelId: "bad-id" },
          [{ json: { teamId: "team-123", channelId: "bad-id" } }],
          false,
        ),
      ).rejects.toThrow();
    });
  });
});

const callGraphBase = "https://graph.microsoft.com/v1.0";
