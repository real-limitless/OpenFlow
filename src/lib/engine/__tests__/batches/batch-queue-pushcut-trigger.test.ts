import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.pushcutTrigger";

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
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runPushcutTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
) {
  const node = makeNode({
    name: "Pushcut Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

const WEBHOOK_PAYLOAD = {
  body: { notification: "My Alert", triggeredAt: "2026-08-06T12:00:00Z" },
  headers: { "content-type": "application/json", "api-key": "test-key" },
  query: {},
  webhookUrl: "https://n8n.example.com/webhook/pushcut/MyIntegrationAction",
  executionMode: "production",
};

describe("batch-queue pushcutTrigger — n8n-nodes-base.pushcutTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Pushcut Trigger");
  });

  it("emits one item with webhook body, headers, query, and actionName", async () => {
    const { out } = await runPushcutTrigger(
      { actionName: "MyIntegrationAction" },
      [WEBHOOK_PAYLOAD],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.body).toEqual({ notification: "My Alert", triggeredAt: "2026-08-06T12:00:00Z" });
    expect(out[0][0].json.headers).toEqual({ "content-type": "application/json", "api-key": "test-key" });
    expect(out[0][0].json.query).toEqual({});
    expect(out[0][0].json.params).toEqual({});
    expect(out[0][0].json.actionName).toBe("MyIntegrationAction");
    expect(out[0][0].json.webhookUrl).toBe("https://n8n.example.com/webhook/pushcut/MyIntegrationAction");
    expect(out[0][0].json.executionMode).toBe("production");
  });

  it("emits one item with empty body when request body is empty", async () => {
    const { out } = await runPushcutTrigger(
      { actionName: "EmptyBodyTest" },
      [{ body: null, headers: { "content-type": "application/json" }, query: {} }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.body).toEqual({});
    expect(out[0][0].json.headers).toEqual({ "content-type": "application/json" });
    expect(out[0][0].json.actionName).toBe("EmptyBodyTest");
  });

  it("emits empty item for empty input", async () => {
    const { out } = await runPushcutTrigger(
      { actionName: "Test" },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("preserves binary data from input item", async () => {
    const { out } = await runPushcutTrigger(
      { actionName: "WithBinary" },
      [
        {
          json: WEBHOOK_PAYLOAD,
          binary: { attachment: { data: "aGVsbG8=", mimeType: "text/plain" } },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toEqual({
      attachment: { data: "aGVsbG8=", mimeType: "text/plain" },
    });
  });
});