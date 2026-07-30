import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sseTrigger";

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
  executionId = "exec-sse",
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

async function runSseTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string } = {},
) {
  const node = makeNode({
    name: "SSE Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-sse");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue sseTrigger — n8n-nodes-base.sseTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("SSE Trigger");
  });

  it("emits item with data and event fields from basic SSE event (happy path)", async () => {
    const { out } = await runSseTrigger(
      { url: "http://test.example.com/events" },
      [
        {
          event: "message",
          data: { hello: "world" },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      data: '{"hello":"world"}',
      event: "message",
    });
    expect(out[0][0].binary).toEqual({});
  });

  it("emits item with empty event when SSE event has no event type", async () => {
    const { out } = await runSseTrigger(
      { url: "http://test.example.com/events" },
      [
        {
          data: "plain text event",
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      data: "plain text event",
      event: "",
    });
  });

  it("concatenates multiple data lines with newline separator", async () => {
    const { out } = await runSseTrigger(
      { url: "http://test.example.com/events" },
      [
        {
          event: "multi",
          data: ["line 1", "line 2", "line 3"],
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      data: "line 1\nline 2\nline 3",
      event: "multi",
    });
  });

  it("handles empty input by emitting single empty item (edge)", async () => {
    const { out } = await runSseTrigger(
      { url: "http://test.example.com/events" },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("preserves binary data from input item", async () => {
    const { out } = await runSseTrigger(
      { url: "http://test.example.com/events" },
      [
        {
          json: {
            event: "file",
            data: "some data",
          },
          binary: { file: { data: "aGVsbG8=", mimeType: "text/plain" } },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toEqual({
      file: { data: "aGVsbG8=", mimeType: "text/plain" },
    });
  });

  it("handles null/undefined data gracefully", async () => {
    const { out } = await runSseTrigger(
      { url: "http://test.example.com/events" },
      [
        {
          event: "test",
          data: null,
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      data: "",
      event: "test",
    });
  });

  it("handles undefined event gracefully", async () => {
    const { out } = await runSseTrigger(
      { url: "http://test.example.com/events" },
      [
        {
          data: "test data",
          event: undefined,
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      data: "test data",
      event: "",
    });
  });
});