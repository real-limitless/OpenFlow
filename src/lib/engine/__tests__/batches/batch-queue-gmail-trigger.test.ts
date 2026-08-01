import { describe, it, expect, afterEach, vi } from "vitest";
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
});
