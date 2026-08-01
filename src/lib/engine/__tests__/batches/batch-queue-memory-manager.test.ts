import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { clearMemoryBufferWindowStore } from "../../executors/memory-buffer-window";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.memoryManager";
const MEMORY_NODE_NAME = "SimpleMemory";

interface MemoryStore {
  loadMessages(): Array<{ role: string; content: string }>;
  saveMessages(msgs: Array<{ role: string; content: string }>): void;
}

function makeNode(
  name: string,
  parameters: Record<string, unknown>,
  type = TYPE,
  overrides: Partial<INode> = {},
): INode {
  return {
    id: "1",
    name,
    type,
    typeVersion: 1,
    position: [0, 0],
    parameters,
    ...overrides,
  };
}

function makeMemoryStore(): MemoryStore {
  let messages: Array<{ role: string; content: string }> = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
    { role: "user", content: "How are you?" },
  ];
  return {
    loadMessages: () => messages,
    saveMessages: (msgs: Array<{ role: string; content: string }>) => {
      messages = msgs;
    },
  };
}

function toItems(data: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return data.map((d) =>
    d && typeof d === "object" && "json" in d ? (d as INodeExecutionData) : { json: d as Record<string, unknown> },
  );
}

async function runManager(
  parameters: Record<string, unknown>,
  mainInput: Array<Record<string, unknown>> = [{}],
  memoryStore?: MemoryStore,
): Promise<INodeExecutionData[][]> {
  const store = memoryStore ?? makeMemoryStore();
  const node = makeNode("MemoryManager", parameters);
  const memoryNode = makeNode(MEMORY_NODE_NAME, {}, "@n8n/n8n-nodes-langchain.memoryBufferWindow");

  const memoryHandleData: Record<string, unknown> = {
    loadMessages: store.loadMessages,
    saveMessages: store.saveMessages,
    appendTurn: () => {},
  };

  const memoryInput = [{ json: memoryHandleData }];

  const inputItemsBySource: Record<string, INodeExecutionData[]> = {};
  inputItemsBySource[MEMORY_NODE_NAME] = memoryInput;

  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node, memoryNode],
      connections: {
        [MEMORY_NODE_NAME]: {
          ai_memory: [[{ node: "MemoryManager", type: "ai_memory", index: 0 }]],
        },
      },
      settings: {},
    },
    getNodeInputItems: (sourceName: string) => {
      if (sourceName === MEMORY_NODE_NAME) return memoryInput;
      return toItems(mainInput);
    },
    continueOnFail: false,
    getCredential: async () => null,
  });

  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  clearMemoryBufferWindowStore();
});

describe("batch-queue memoryManager — @n8n/n8n-nodes-langchain.memoryManager", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Chat Memory Manager");
  });

  it("load messages simplified and grouped (default)", async () => {
    const out = await runManager({ mode: "load" });
    expect(out.length).toBe(1);
    expect(out[0].length).toBe(1);
    const json = out[0][0].json as { messages: Array<{ sender: string; text: string }> };
    expect(json.messages).toHaveLength(3);
    expect(json.messages[0]).toEqual({ sender: "user", text: "Hello" });
    expect(json.messages[1]).toEqual({ sender: "AI", text: "Hi there!" });
    expect(json.messages[2]).toEqual({ sender: "user", text: "How are you?" });
  });

  it("load messages without simplification returns full structure", async () => {
    const out = await runManager({ mode: "load", simplifyOutput: false });
    const json = out[0][0].json as { messages: Array<{ role: string; content: string }> };
    expect(json.messages).toHaveLength(3);
    expect(json.messages[0]).toEqual({ role: "user", content: "Hello" });
  });

  it("load messages without grouping returns one item per message", async () => {
    const out = await runManager({
      mode: "load",
      simplifyOutput: true,
      "options.groupMessages": false,
    });
    expect(out[0].length).toBe(3);
    expect(out[0][0].json).toEqual({ sender: "user", text: "Hello" });
    expect(out[0][1].json).toEqual({ sender: "AI", text: "Hi there!" });
  });

  it("insert messages appends to existing memory", async () => {
    const out = await runManager({
      mode: "insert",
      insertMode: "insert",
      messages: {
        messageValues: [
          { type: "user", message: "Hello", hideFromUI: false },
          { type: "ai", message: "Hi there!", hideFromUI: false },
        ],
      },
    });
    expect(out[0].length).toBe(1);
    expect(out[0][0].json).toEqual({});
  });

  it("override mode replaces all messages", async () => {
    const out = await runManager({
      mode: "insert",
      insertMode: "override",
      messages: {
        messageValues: [
          { type: "system", message: "You are a helpful assistant.", hideFromUI: true },
        ],
      },
    });
    expect(out[0].length).toBe(1);
  });

  it("delete last N messages", async () => {
    const out = await runManager({ mode: "delete", deleteMode: "lastN", lastMessagesCount: 2 });
    expect(out[0].length).toBe(1);
  });

  it("delete all messages", async () => {
    const out = await runManager({ mode: "delete", deleteMode: "all" });
    expect(out[0].length).toBe(1);
  });

  it("throws when lastMessagesCount is zero", async () => {
    await expect(
      runManager({ mode: "delete", deleteMode: "lastN", lastMessagesCount: 0 }),
    ).rejects.toThrow(/lastMessagesCount/);
  });

  it("throws when lastMessagesCount is negative", async () => {
    await expect(
      runManager({ mode: "delete", deleteMode: "lastN", lastMessagesCount: -1 }),
    ).rejects.toThrow(/lastMessagesCount/);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
