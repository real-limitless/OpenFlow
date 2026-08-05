import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.amqpTrigger";

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
  executionId = "exec-amqp",
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

async function runAmqpTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string } = {},
) {
  const node = makeNode({
    name: "AMQP Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-amqp");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue amqpTrigger — n8n-nodes-base.amqpTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AMQP Trigger");
  });

  it("emits full message envelope by default (happy path)", async () => {
    const { out } = await runAmqpTrigger(
      { sink: "my-queue" },
      [{ json: { body: "hello", applicationProperties: {}, deliveryAnnotations: {}, messageAnnotations: {}, properties: {} } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      body: "hello",
      applicationProperties: {},
      deliveryAnnotations: {},
      messageAnnotations: {},
      properties: {},
    });
  });

  it("JSON-parses message body when jsonParseBody is enabled", async () => {
    const { out } = await runAmqpTrigger(
      {
        sink: "events",
        options: { jsonParseBody: true },
      },
      [{ json: { body: '{"temp":22.5,"unit":"C"}' } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      body: { temp: 22.5, unit: "C" },
    });
  });

  it("emits only body when onlyBody is enabled", async () => {
    const { out } = await runAmqpTrigger(
      {
        sink: "notifications",
        options: { onlyBody: true },
      },
      [{ json: { body: "alert" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ body: "alert" });
  });

  it("handles multiple messages in one firing", async () => {
    const { out } = await runAmqpTrigger(
      { sink: "telemetry", options: { pullMessagesNumber: 200 } },
      [
        { json: { body: "a" } },
        { json: { body: "b" } },
        { json: { body: "c" } },
      ],
    );

    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toMatchObject({ body: "a" });
    expect(out[0][1].json).toMatchObject({ body: "b" });
    expect(out[0][2].json).toMatchObject({ body: "c" });
  });

  it("handles empty input by emitting single empty item (edge)", async () => {
    const { out } = await runAmqpTrigger(
      { sink: "test" },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("converts byte array to string when jsonConvertByteArrayToString is enabled", async () => {
    const { out } = await runAmqpTrigger(
      {
        sink: "azure",
        options: { jsonConvertByteArrayToString: true },
      },
      [{ json: { body: [72, 101, 108, 108, 111] } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ body: "Hello" });
  });

  it("preserves raw string when JSON parse fails", async () => {
    const { out } = await runAmqpTrigger(
      {
        sink: "test",
        options: { jsonParseBody: true },
      },
      [{ json: { body: "not-valid-json" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ body: "not-valid-json" });
  });
});
