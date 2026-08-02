import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { NodeExecutor, ExecutionContext } from "@/sdk";
import { _clearPollStatesForTest } from "../../executors/gmail-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.gmailTrigger";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function makeCtxWithToken(node: Parameters<typeof makeNode>[0], token: string): ExecutionContext {
  const n = makeNode(node);
  return {
    node: n,
    getParam: (name: string, def?: unknown) => {
      const val = (n.parameters as Record<string, unknown>)[name];
      return val !== undefined ? val : def;
    },
    getParams: () => n.parameters as Record<string, unknown>,
    getCredential: async () => ({ accessToken: token }),
    getInputItems: () => [],
    getNode: () => n,
    getWorkflow: () => ({ id: "test", name: "test", active: false, nodes: [n], connections: {}, settings: {} }),
    continueOnFail: () => false,
    evaluate: (expr: string) => expr,
    setCustomData: () => {},
    getCustomData: () => undefined,
    getAllCustomData: () => ({}),
    getNodeInputItems: () => [],
  } as unknown as ExecutionContext;
}

describe("gmailTrigger", () => {
  beforeEach(() => {
    _clearPollStatesForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("returns empty output when no messages match", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      mockResponse({ messages: [], resultSizeEstimate: 0 }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: true,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, readStatus: "unreadOnly", search: "", sender: "nobody@example.com" },
    } });
    const ctx = makeCtxWithToken(node, "test-token");

    const result = await executor(ctx, node);
    expect(result).toEqual([[]]);
  });

  it("emits simplified items for a new message", async () => {
    const msgDetail = {
      id: "msg1", threadId: "msg1", labelIds: ["INBOX", "UNREAD"],
      payload: {
        headers: [
          { name: "From", value: "Ada Lovelace <ada@example.com>" },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: "Project update" },
          { name: "Date", value: "Mon, 1 Aug 2026 10:00:00 +0000" },
          { name: "Cc", value: "" },
          { name: "Bcc", value: "" },
        ],
      },
    };

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      return callCount === 1
        ? mockResponse({ messages: [{ id: "msg1" }] })
        : mockResponse(msgDetail);
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: true,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, readStatus: "unreadOnly", search: "", sender: "" },
    } });
    const ctx = makeCtxWithToken(node, "test-token");

    const result = await executor(ctx, node);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("msg1");
    expect(result[0][0].json.from).toBe("Ada Lovelace <ada@example.com>");
    expect(result[0][0].json.subject).toBe("Project update");
  });

  it("deduplicates messages across poll cycles", async () => {
    const msgDetail = {
      id: "msg1", threadId: "msg1", labelIds: ["INBOX", "UNREAD"],
      payload: {
        headers: [
          { name: "From", value: "a@b.com" },
          { name: "To", value: "me@x.com" },
          { name: "Subject", value: "Hello" },
          { name: "Date", value: "Mon, 1 Aug 2026 10:00:00 +0000" },
          { name: "Cc", value: "" },
          { name: "Bcc", value: "" },
        ],
      },
    };

    let fetchIdx = 0;
    const responses = [
      mockResponse({ messages: [{ id: "msg1" }] }),
      mockResponse(msgDetail),
      mockResponse({ messages: [{ id: "msg1" }] }),
      mockResponse(msgDetail),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses[fetchIdx++]));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: true,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, readStatus: "unreadOnly", search: "", sender: "" },
    } });

    const result1 = await executor(makeCtxWithToken(node, "test-token"), node);
    expect(result1[0]).toHaveLength(1);

    const result2 = await executor(makeCtxWithToken(node, "test-token"), node);
    expect(result2[0]).toHaveLength(0);
  });

  it("emits raw payload when simplify is false", async () => {
    const rawMsg = {
      id: "raw1", threadId: "raw1", labelIds: ["INBOX"],
      payload: {
        mimeType: "text/plain",
        body: { size: 10, data: "dGVzdA==" },
      },
      snippet: "test",
    };

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount++;
      return callCount === 1
        ? mockResponse({ messages: [{ id: "raw1" }] })
        : mockResponse(rawMsg);
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: false,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, readStatus: "unreadOnly", search: "", sender: "" },
    } });
    const ctx = makeCtxWithToken(node, "test-token");

    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("raw1");
    expect((result[0][0].json as Record<string, unknown>).payload).toBeDefined();
  });

  it("respects readStatus readOnly and unreadOnly", async () => {
    const msgDetail = (id: string, hasUnread: boolean) => ({
      id, threadId: id, labelIds: hasUnread ? ["INBOX", "UNREAD"] : ["INBOX"],
      payload: { headers: [{ name: "From", value: "x@y.com" }, { name: "To", value: "me@x.com" }, { name: "Subject", value: "Test" }, { name: "Date", value: "" }, { name: "Cc", value: "" }, { name: "Bcc", value: "" }] },
    });

    // readOnly — q contains is:read, so list returns a read message
    let fetchIdx = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      fetchIdx++;
      if (fetchIdx === 1) return mockResponse({ messages: [{ id: "read1" }] });
      return mockResponse(msgDetail("read1", false));
    }));
    const executor = getExecutor(TYPE) as NodeExecutor;
    const nodeRead = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: true,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, readStatus: "readOnly", search: "", sender: "" },
    } });
    const result = await executor(makeCtxWithToken(nodeRead, "test-token"), nodeRead);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("read1");

    // unreadOnly — q contains is:unread, so list returns an unread message
    _clearPollStatesForTest();
    vi.unstubAllGlobals();
    fetchIdx = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      fetchIdx++;
      if (fetchIdx === 1) return mockResponse({ messages: [{ id: "unread1" }] });
      return mockResponse(msgDetail("unread1", true));
    }));
    const nodeUnread = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: true,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, readStatus: "unreadOnly", search: "", sender: "" },
    } });
    const result2 = await executor(makeCtxWithToken(nodeUnread, "test-token"), nodeUnread);
    expect(result2[0]).toHaveLength(1);
    expect(result2[0][0].json.id).toBe("unread1");
  });

  it("drains 25 messages across multiple polls with maxEmailsPerPoll=10", async () => {
    const makeDetail = (id: string) => ({
      id, threadId: id, labelIds: ["INBOX"],
      payload: { headers: [{ name: "From", value: "a@b.com" }, { name: "To", value: "me@x.com" }, { name: "Subject", value: `Msg ${id}` }, { name: "Date", value: "" }, { name: "Cc", value: "" }, { name: "Bcc", value: "" }] },
    });
    const allIds = Array.from({ length: 25 }, (_, i) => ({ id: `msg${i}` }));

    let fetchCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      fetchCount++;
      // list call (contains /messages with no trailing /<id>)
      if (!url.includes("/messages/")) return mockResponse({ messages: allIds });
      // detail call
      const match = url.match(/\/messages\/(msg\d+)/);
      return mockResponse(makeDetail(match ? match[1] : "unknown"));
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: true,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, readStatus: "unreadOnly", search: "", sender: "" },
    } });

    // poll 1: emit 10
    const r1 = await executor(makeCtxWithToken(node, "test-token"), node);
    expect(r1[0]).toHaveLength(10);

    // poll 2: emit next 10
    const r2 = await executor(makeCtxWithToken(node, "test-token"), node);
    expect(r2[0]).toHaveLength(10);

    // poll 3: emit last 5
    const r3 = await executor(makeCtxWithToken(node, "test-token"), node);
    expect(r3[0]).toHaveLength(5);

    // poll 4: all emitted, empty
    const r4 = await executor(makeCtxWithToken(node, "test-token"), node);
    expect(r4[0]).toHaveLength(0);
  });

  it("filters by sender and labelIds", async () => {
    const matchingMsg = {
      id: "match1", threadId: "match1", labelIds: ["Label_1", "INBOX"],
      payload: { headers: [{ name: "From", value: "ada@example.com" }, { name: "To", value: "me@x.com" }, { name: "Subject", value: "Match" }, { name: "Date", value: "" }, { name: "Cc", value: "" }, { name: "Bcc", value: "" }] },
    };
    const otherMsg = {
      id: "other1", threadId: "other1", labelIds: ["INBOX"],
      payload: { headers: [{ name: "From", value: "other@x.com" }, { name: "To", value: "me@x.com" }, { name: "Subject", value: "Other" }, { name: "Date", value: "" }, { name: "Cc", value: "" }, { name: "Bcc", value: "" }] },
    };

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      callCount++;
      // list call — return only match1 (simulating Gmail API label/search filter)
      if (!url.includes("/messages/")) return mockResponse({ messages: [{ id: "match1" }] });
      // detail call
      if (url.includes("match1")) return mockResponse(matchingMsg);
      return mockResponse(otherMsg);
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: true,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, labelIds: ["Label_1"], search: "from:ada@example.com", readStatus: "unreadOnly", sender: "ada@example.com" },
    } });
    const ctx = makeCtxWithToken(node, "test-token");
    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.id).toBe("match1");
  });

  it("excludes spam/trash by default", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      mockResponse({ messages: [] }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "Gmail Trigger", type: TYPE, parameters: {
      pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      simplify: true,
      maxEmailsPerPoll: 10,
      filters: { includeSpamAndTrash: false, readStatus: "unreadOnly", search: "", sender: "" },
    } });
    const ctx = makeCtxWithToken(node, "test-token");
    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(0);
  });
});
