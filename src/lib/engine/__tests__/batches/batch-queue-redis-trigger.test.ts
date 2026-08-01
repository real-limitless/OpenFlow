import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.redisTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  executionId = "exec-redis-trigger",
): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
    __executionId: executionId,
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runRedisTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string } = {},
) {
  const node = makeNode({
    name: "Redis Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-redis-trigger");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue redisTrigger — n8n-nodes-base.redisTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Redis Trigger");
  });

  it("emits channel and message for basic subscription (happy path)", async () => {
    const { out } = await runRedisTrigger(
      { channels: "test:events" },
      [
        { channel: "test:events", message: "hello" },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      channel: "test:events",
      message: "hello",
    });
  });

  it("emits only message when onlyMessage option is enabled", async () => {
    const { out } = await runRedisTrigger(
      { channels: "test:onlymsg", options: { onlyMessage: true } },
      [
        { channel: "test:onlymsg", message: "hello" },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ message: "hello" });
    expect(out[0][0].json).not.toHaveProperty("channel");
  });

  it("parses JSON message when jsonParseBody is enabled (happy)", async () => {
    const { out } = await runRedisTrigger(
      { channels: "test:json", options: { jsonParseBody: true } },
      [
        { channel: "test:json", message: '{"count":5}' },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      channel: "test:json",
      message: { count: 5 },
    });
  });

  it("falls back to raw string when jsonParseBody fails (edge)", async () => {
    const { out } = await runRedisTrigger(
      { channels: "test:json", options: { jsonParseBody: true } },
      [
        { channel: "test:json", message: "not-json" },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      channel: "test:json",
      message: "not-json",
    });
  });

  it("emits multiple items from multiple channel messages", async () => {
    const { out } = await runRedisTrigger(
      { channels: "test:a, test:b" },
      [
        { channel: "test:a", message: "msg-a" },
        { channel: "test:b", message: "msg-b" },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ channel: "test:a", message: "msg-a" });
    expect(out[0][1].json).toEqual({ channel: "test:b", message: "msg-b" });
  });

  it("handles empty input by emitting single empty item", async () => {
    const { out } = await runRedisTrigger(
      { channels: "test:events" },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("throws on missing channels parameter", async () => {
    const node = makeNode({
      name: "Redis Trigger",
      type: TYPE,
      parameters: {},
    });
    const ctx = makeCtx([], node);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow("Channels parameter is required");
  });
});
