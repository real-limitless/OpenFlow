import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.manualChatTrigger";

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
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

async function runManualChat(
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { nodeName?: string } = {},
) {
  const name = opts.nodeName ?? "ManualChatTrigger";
  const node = makeNode({ name, type: TYPE, parameters: {} });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue manualChatTrigger — @n8n/n8n-nodes-langchain.manualChatTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Manual Chat Trigger");
  });

  it("emits chatInput/content/message from input item", async () => {
    const { out } = await runManualChat([{ chatInput: "Hello, world!" }]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      chatInput: "Hello, world!",
      content: "Hello, world!",
      message: "Hello, world!",
    });
  });

  it("preserves binary data from input item", async () => {
    const { out } = await runManualChat([
      {
        json: { chatInput: "with binary" },
        binary: { data: { data: "dGVzdA==", mimeType: "text/plain" } },
      },
    ]);

    expect(out[0][0].json.chatInput).toBe("with binary");
    expect(out[0][0].binary).toEqual({
      data: { data: "dGVzdA==", mimeType: "text/plain" },
    });
  });

  it("empty input emits a single empty item", async () => {
    const { out } = await runManualChat([]);

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("numeric chatInput is coerced to string", async () => {
    const { out } = await runManualChat([{ chatInput: 42 }]);

    expect(out[0][0].json).toEqual({
      chatInput: "42",
      content: "42",
      message: "42",
    });
  });

  it("no formatting applied — preserves special characters", async () => {
    const { out } = await runManualChat([
      { chatInput: "Line 1\nLine 2\nSpecial: !@#$%^&*()" },
    ]);

    expect(out[0][0].json.chatInput).toBe("Line 1\nLine 2\nSpecial: !@#$%^&*()");
    expect(out[0][0].json.chatInput).toBe(out[0][0].json.content);
    expect(out[0][0].json.chatInput).toBe(out[0][0].json.message);
  });
});
