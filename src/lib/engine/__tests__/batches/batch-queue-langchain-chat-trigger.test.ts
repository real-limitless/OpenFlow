import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { resolveInputs } from "@/lib/nodes/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { extractChatResponseText } from "../../executors/langchain-chat-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.chatTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeChatCtx(
  items: INodeExecutionData[],
  node: INode,
  connections: IConnections = {},
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections,
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

function makeRootConnection(triggerName: string, rootName = "Agent"): IConnections {
  return {
    [triggerName]: {
      main: [[{ node: rootName, type: "main", index: 0 }]],
    },
  };
}

async function runChat(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { connections?: IConnections; nodeName?: string } = {},
) {
  const name = opts.nodeName ?? "ChatTrigger";
  const node = makeNode({ name, type: TYPE, parameters });
  const items = toItems(inputItems);
  const connections = opts.connections ?? makeRootConnection(name);
  const ctx = makeChatCtx(items, node, connections);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue chatTrigger — @n8n/n8n-nodes-langchain.chatTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Chat Trigger");
  });

  it("incoming message maps to output item with chatInput/sessionId/action", async () => {
    const { out } = await runChat(
      { public: true, mode: "hosted", options: { responseMode: "whenLastNode" } },
      [{ chatInput: "Hello", sessionId: "s1", action: "sendMessage" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      chatInput: "Hello",
      sessionId: "s1",
      action: "sendMessage",
    });
  });

  it("embedded chat metadata appears in output", async () => {
    const { out } = await runChat(
      { public: true, mode: "embedded", options: {} },
      [{ chatInput: "Hi", sessionId: "s2", metadata: { userId: "u-42" } }],
    );

    expect(out[0][0].json).toEqual({
      chatInput: "Hi",
      sessionId: "s2",
      action: "sendMessage",
      metadata: { userId: "u-42" },
    });
  });

  it("omits metadata when not provided", async () => {
    const { out } = await runChat(
      { options: {} },
      [{ chatInput: "Hello", sessionId: "s1" }],
    );

    expect(out[0][0].json).not.toHaveProperty("metadata");
  });

  it("defaults action to sendMessage when absent", async () => {
    const { out } = await runChat(
      { options: {} },
      [{ chatInput: "Hello", sessionId: "s1" }],
    );

    expect(out[0][0].json.action).toBe("sendMessage");
  });

  it("preserves binary data from input item", async () => {
    const { out } = await runChat(
      { options: {} },
      [
        {
          json: { chatInput: "See this", sessionId: "s3" },
          binary: { data: { data: "aGVsbG8=", mimeType: "text/plain" } },
        },
      ],
    );

    expect(out[0][0].binary).toEqual({
      data: { data: "aGVsbG8=", mimeType: "text/plain" },
    });
  });

  it("empty input emits a single empty item", async () => {
    const { out } = await runChat({ options: {} }, []);

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("responseNodes mode emits item without error (defers to downstream)", async () => {
    const { out } = await runChat(
      { options: { responseMode: "responseNodes" } },
      [{ chatInput: "Hi", sessionId: "s4" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.chatInput).toBe("Hi");
  });

  it("no root node connected throws configuration error", async () => {
    const node = makeNode({ name: "ChatTrigger", type: TYPE, parameters: { options: {} } });
    const items = toItems([{ chatInput: "Hello", sessionId: "s1" }]);
    const ctx = makeChatCtx(items, node, {});
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(
      /must connect to an agent or chain root node/i,
    );
  });

  describe("extractChatResponseText — whenLastNode response extraction", () => {
    it("extracts output field from last node", () => {
      const result = extractChatResponseText([
        { json: { output: "The answer is 42" } },
      ]);

      expect(result.text).toBe("The answer is 42");
      expect(result.isWholeObject).toBe(false);
    });

    it("falls back to text field when output is absent", () => {
      const result = extractChatResponseText([
        { json: { text: "Hello back" } },
      ]);

      expect(result.text).toBe("Hello back");
      expect(result.isWholeObject).toBe(false);
    });

    it("sends whole object when neither output nor text present", () => {
      const result = extractChatResponseText([
        { json: { reply: "custom" } },
      ]);

      expect(result.isWholeObject).toBe(true);
      expect(result.text).toBe(JSON.stringify({ reply: "custom" }));
    });

    it("returns empty string for empty items", () => {
      const result = extractChatResponseText([]);

      expect(result.text).toBe("");
      expect(result.isWholeObject).toBe(false);
    });

    it("prefers output over text when both present", () => {
      const result = extractChatResponseText([
        { json: { output: "primary", text: "secondary" } },
      ]);

      expect(result.text).toBe("primary");
    });
  });

  describe("memory connector gating — dynamicInputs", () => {
    it("no ai_memory input when loadPreviousSession is off", () => {
      const desc = getNodeType(TYPE);
      const inputs = resolveInputs(desc, { options: { loadPreviousSession: "off" } });

      expect(inputs).not.toContain("ai_memory");
      expect(inputs).toEqual([]);
    });

    it("ai_memory input appears when loadPreviousSession is fromMemory", () => {
      const desc = getNodeType(TYPE);
      const inputs = resolveInputs(desc, { options: { loadPreviousSession: "fromMemory" } });

      expect(inputs).toContain("ai_memory");
    });

    it("no ai_memory input when loadPreviousSession is absent", () => {
      const desc = getNodeType(TYPE);
      const inputs = resolveInputs(desc, { options: {} });

      expect(inputs).not.toContain("ai_memory");
    });
  });
});