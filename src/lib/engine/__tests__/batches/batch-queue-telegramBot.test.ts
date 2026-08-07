import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.telegramBot";
const CANONICAL = "n8n-nodes-base.telegram";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: () => "application/json",
      entries: () => new Map([["content-type", "application/json"]]).entries(),
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

describe("batch-queue telegramBot — n8n-nodes-base.telegramBot", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => mockResponse({ ok: true, result: { message_id: 42, text: "Hello from OpenFlow", chat: { id: -1001234 } } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Telegram");
  });

  it("shares the same executor function as telegram canonical type", () => {
    const botExecutor = getExecutor(TYPE);
    const telExecutor = getExecutor(CANONICAL);
    expect(botExecutor).toBe(telExecutor);
  });

  it("sends a plain text message and returns the API response", async () => {
    const node = {
      id: "1",
      name: "N",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0] as [number, number],
      parameters: {
        resource: "message",
        operation: "sendMessage",
        chatId: "@mychannel",
        text: "Hello from OpenFlow",
        additionalFields: { appendAttribution: false },
      },
    };
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ accessToken: "123456:ABC-DEF" }),
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ message_id: 42, text: "Hello from OpenFlow" });
  });

  it("throws when credential is missing", async () => {
    const node = {
      id: "1",
      name: "N",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0] as [number, number],
      parameters: {
        resource: "message",
        operation: "sendMessage",
        chatId: "@mychannel",
        text: "hi",
      },
    };
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    await expect(executor(ctx, node)).rejects.toThrow("credential");
  });

  it("returns error item on continueOnFail", async () => {
    const node = {
      id: "1",
      name: "N",
      type: TYPE,
      typeVersion: 1,
      position: [0, 0] as [number, number],
      parameters: {
        resource: "message",
        operation: "sendMessage",
        chatId: "@mychannel",
        text: "hi",
      },
    };
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
  });
});
