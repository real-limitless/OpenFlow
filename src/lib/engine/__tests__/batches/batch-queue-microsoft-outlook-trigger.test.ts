import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext, type NodeExecutor } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { _clearPollStatesForTest } from "../../executors/microsoft-outlook-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftOutlookTrigger";

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

const CREDS = { microsoftOutlookOAuth2Api: { accessToken: "mock-token" } };

function makeCtx(
  node: INode,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  const creds = credentials ?? CREDS;
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
    getNodeInputItems: () => [],
    continueOnFail: false,
    getCredential: async (name) => creds[name] ?? null,
  });
}

describe("microsoftOutlookTrigger", () => {
  beforeEach(() => {
    _clearPollStatesForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft Outlook Trigger");
  });

  it("returns empty output when Graph returns no messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      mockResponse({ value: [] }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node: INode = {
      id: "1",
      name: "Outlook Trigger",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        event: "messageReceived",
        pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
        folders: ["Inbox"],
        simplify: false,
      },
    };
    const ctx = makeCtx(node);
    const result = await executor(ctx, node);
    expect(result).toEqual([[]]);
  });

  it("emits one item per new message with full Graph resource", async () => {
    const messages = [
      { id: "msg-1", subject: "Hello", receivedDateTime: "2026-08-01T10:00:00Z", from: { emailAddress: { address: "alice@example.com", name: "Alice" } }, toRecipients: [{ emailAddress: { address: "me@example.com" } }], bodyPreview: "Hi", webLink: "https://outlook.office.com/mail/msg-1" },
      { id: "msg-2", subject: "Re: Hello", receivedDateTime: "2026-08-01T11:00:00Z", from: { emailAddress: { address: "bob@example.com", name: "Bob" } } },
    ];

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("inbox/messages")) {
        return mockResponse({ value: messages });
      }
      return mockResponse({ value: [] });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node: INode = {
      id: "2",
      name: "Outlook Trigger",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        event: "messageReceived",
        pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
        folders: ["Inbox"],
        simplify: false,
      },
    };
    const ctx = makeCtx(node);
    const result = await executor(ctx, node);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].json.id).toBe("msg-1");
    expect(result[0][0].json.subject).toBe("Hello");
    expect(result[0][1].json.id).toBe("msg-2");
  });

  it("deduplicates messages across consecutive poll cycles", async () => {
    const messages = [
      { id: "msg-1", subject: "Hello", receivedDateTime: "2026-08-01T10:00:00Z", from: { emailAddress: { address: "alice@example.com" } } },
    ];

    vi.stubGlobal("fetch", vi.fn(async () =>
      mockResponse({ value: messages }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node: INode = {
      id: "3",
      name: "Outlook Trigger",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        event: "messageReceived",
        pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
        folders: ["Inbox"],
        simplify: true,
      },
    };

    // First poll — emit the message
    const r1 = await executor(makeCtx(node), node);
    expect(r1[0]).toHaveLength(1);
    expect(r1[0][0].json.id).toBe("msg-1");

    // Second poll — same message, should be deduplicated
    const r2 = await executor(makeCtx(node), node);
    expect(r2[0]).toHaveLength(0);
  });

  it("emits simplified output when simplify is true", async () => {
    const msg = {
      id: "msg-simple",
      subject: "Test",
      receivedDateTime: "2026-08-01T12:00:00Z",
      from: { emailAddress: { address: "charlie@example.com", name: "Charlie" } },
      toRecipients: [{ emailAddress: { address: "me@example.com" } }],
      bodyPreview: "Short preview",
      webLink: "https://outlook.office.com/mail/msg-simple",
      extraField: "should be stripped",
    };

    vi.stubGlobal("fetch", vi.fn(async () =>
      mockResponse({ value: [msg] }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node: INode = {
      id: "4",
      name: "Outlook Trigger",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        event: "messageReceived",
        pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
        simplify: true,
      },
    };
    const ctx = makeCtx(node);
    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(1);
    const json = result[0][0].json;
    expect(json.id).toBe("msg-simple");
    expect(json.subject).toBe("Test");
    expect(json.from).toBe("charlie@example.com");
    expect(json.receivedDateTime).toBe("2026-08-01T12:00:00Z");
    expect(json.extraField).toBeUndefined();
  });

  it("respects folder scoping — no messages in SentItems", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("mailFolders/SentItems")) {
        return mockResponse({ value: [] });
      }
      return mockResponse({ value: [{ id: "inbox-msg", subject: "Inbox only" }] });
    }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node: INode = {
      id: "5",
      name: "Outlook Trigger",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        event: "messageReceived",
        pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
        folders: ["SentItems"],
        simplify: true,
      },
    };
    const ctx = makeCtx(node);
    const result = await executor(ctx, node);
    expect(result[0]).toHaveLength(0);
  });

  it("errors when no credential is configured", async () => {
    const executor = getExecutor(TYPE) as NodeExecutor;
    const node: INode = {
      id: "6",
      name: "Outlook Trigger",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        event: "messageReceived",
        pollTimes: { mode: "everyX", value: 5, unit: "minutes" },
      },
    };
    const ctx = makeCtx(node, {});
    await expect(executor(ctx, node)).rejects.toThrow("no valid credential found");
  });
});
