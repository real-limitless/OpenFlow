import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  clearMemoryBufferWindowStore,
  type MemoryBufferWindowHandle,
  type MemoryChatMessage,
} from "../../executors/memory-buffer-window";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.memoryBufferWindow";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(items: INodeExecutionData[], node: INode): ExecutionContext {
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
    continueOnFail: false,
  });
}

async function runMemory(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Memory", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): MemoryBufferWindowHandle {
  return out[0][0].json as unknown as MemoryBufferWindowHandle;
}

function user(content: string): MemoryChatMessage {
  return { role: "user", content };
}
function assistant(content: string): MemoryChatMessage {
  return { role: "assistant", content };
}

beforeEach(() => clearMemoryBufferWindowStore());

describe("batch-queue memoryBufferWindow — @n8n/n8n-nodes-langchain.memoryBufferWindow", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Simple Memory");
  });

  it("wire shape — session key + window: handle exposes sessionId + contextWindowLength", async () => {
    const out = await runMemory({
      sessionId: "my_test_session",
      contextWindowLength: 5,
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.sessionId).toBe("my_test_session");
    expect(handle.contextWindowLength).toBe(5);
    expect(typeof handle.loadMessages).toBe("function");
    expect(typeof handle.saveMessages).toBe("function");
    expect(typeof handle.appendTurn).toBe("function");
  });

  it("sessionId auto from Chat Trigger: blank param falls back to first item sessionId", async () => {
    const out = await runMemory({ contextWindowLength: 3 }, [
      { sessionId: "abc-123", chatInput: "hi" },
    ]);

    const handle = getHandle(out);
    expect(handle.sessionId).toBe("abc-123");
  });

  it("window truncates to last N interactions", async () => {
    const out = await runMemory({ sessionId: "sess", contextWindowLength: 2 });
    const handle = getHandle(out);

    handle.appendTurn(user("u1"), assistant("a1"));
    handle.appendTurn(user("u2"), assistant("a2"));
    handle.appendTurn(user("u3"), assistant("a3"));
    handle.appendTurn(user("u4"), assistant("a4"));

    expect(handle.loadMessages()).toEqual([
      user("u3"),
      assistant("a3"),
      user("u4"),
      assistant("a4"),
    ]);
  });

  it("new turn appended after a run: load returns both interactions", async () => {
    const out = await runMemory({ sessionId: "sess", contextWindowLength: 5 });
    const handle = getHandle(out);

    handle.appendTurn(user("u1"), assistant("a1"));
    handle.appendTurn(user("u2"), assistant("a2"));

    expect(handle.loadMessages()).toEqual([
      user("u1"),
      assistant("a1"),
      user("u2"),
      assistant("a2"),
    ]);
  });

  it("No sessionId error: blank param + no trigger sessionId throws", async () => {
    await expect(runMemory({ contextWindowLength: 5 }, [{}])).rejects.toThrow(/No sessionId/i);
  });

  it("No sessionId error: blank param + empty input throws", async () => {
    await expect(runMemory({ contextWindowLength: 5 }, [])).rejects.toThrow(/No sessionId/i);
  });

  it("separate sessions stay isolated", async () => {
    const outA = await runMemory({ sessionId: "a", contextWindowLength: 5 });
    const outB = await runMemory({ sessionId: "b", contextWindowLength: 5 });
    const handleA = getHandle(outA);
    const handleB = getHandle(outB);

    handleA.appendTurn(user("ua1"), assistant("aa1"));

    expect(handleB.loadMessages()).toEqual([]);
    expect(handleA.loadMessages()).toEqual([user("ua1"), assistant("aa1")]);
  });

  it("contextWindowLength 0: load returns no prior context", async () => {
    const out = await runMemory({ sessionId: "sess", contextWindowLength: 0 });
    const handle = getHandle(out);

    handle.appendTurn(user("u1"), assistant("a1"));
    handle.appendTurn(user("u2"), assistant("a2"));

    expect(handle.loadMessages()).toEqual([]);
  });

  it("saveMessages pairs user+assistant turns into interactions", async () => {
    const out = await runMemory({ sessionId: "sess", contextWindowLength: 5 });
    const handle = getHandle(out);

    handle.saveMessages([user("u1"), assistant("a1"), user("u2"), assistant("a2")]);

    expect(handle.loadMessages()).toEqual([
      user("u1"),
      assistant("a1"),
      user("u2"),
      assistant("a2"),
    ]);
  });

  it("sessionId expression: resolved against first item", async () => {
    const out = await runMemory({ sessionId: "={{ $json.s }}", contextWindowLength: 5 }, [
      { s: "expr-session" },
    ]);

    expect(getHandle(out).sessionId).toBe("expr-session");
  });

  it("contextWindowLength expression: resolved against first item", async () => {
    const out = await runMemory({ sessionId: "sess", contextWindowLength: "={{ $json.w }}" }, [
      { w: 3 },
    ]);

    expect(getHandle(out).contextWindowLength).toBe(3);
  });

  it("default contextWindowLength from definition: 5 when param absent", async () => {
    const out = await runMemory({ sessionId: "sess" });
    expect(getHandle(out).contextWindowLength).toBe(5);
  });

  it("handle is consumable by AI Agent: loadMessages returns flat message list", async () => {
    const out = await runMemory({ sessionId: "sess", contextWindowLength: 5 });
    const handle = getHandle(out);

    handle.appendTurn(user("hi"), assistant("hello"));

    const messages = handle.loadMessages();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages[0]).toEqual({ role: "user", content: "hi" });
    expect(messages[1]).toEqual({ role: "assistant", content: "hello" });
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
