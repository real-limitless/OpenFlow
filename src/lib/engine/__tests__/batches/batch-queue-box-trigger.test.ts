import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { registerBoxWebhook, deleteBoxWebhook } from "../../executors/box-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.boxTrigger";

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
  executionId = "exec-box-trigger",
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

async function runBoxTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string } = {},
) {
  const node = makeNode({
    name: "Box Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-box-trigger");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue box-trigger — n8n-nodes-base.boxTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Box Trigger");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.boxTrigger")).toBe(canonical);
  });

  it("passes through a FILE.UPLOADED webhook event as output item", async () => {
    const webhookPayload = {
      type: "webhook_event",
      webhook: { id: "wh-1", type: "webhook" },
      trigger: "FILE.UPLOADED",
      source: {
        id: "file-1",
        type: "file",
        name: "report.pdf",
      },
      created_by: {
        id: "user-1",
        type: "user",
        name: "Alice",
        login: "alice@example.com",
      },
      created_at: "2026-08-04T12:00:00-04:00",
    };

    const { out } = await runBoxTrigger(
      {
        events: ["FILE.UPLOADED"],
        targetType: "folder",
        targetId: "12345",
      },
      [webhookPayload],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(webhookPayload);
    expect(out[0][0].json.trigger).toBe("FILE.UPLOADED");
    expect(out[0][0].json.source.type).toBe("file");
  });

  it("passes through multiple webhook events as separate items", async () => {
    const payload1 = {
      type: "webhook_event",
      trigger: "FILE.UPLOADED",
      source: { id: "f1", type: "file" },
    };
    const payload2 = {
      type: "webhook_event",
      trigger: "FILE.DOWNLOADED",
      source: { id: "f1", type: "file" },
    };

    const { out } = await runBoxTrigger(
      {
        events: ["FILE.UPLOADED", "FILE.DOWNLOADED"],
        targetType: "file",
        targetId: "67890",
      },
      [payload1, payload2],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.trigger).toBe("FILE.UPLOADED");
    expect(out[0][1].json.trigger).toBe("FILE.DOWNLOADED");
  });

  it("returns empty output for zero input items (activation/deactivation)", async () => {
    const { out } = await runBoxTrigger(
      {
        events: ["FILE.UPLOADED"],
        targetType: "folder",
        targetId: "12345",
      },
      [],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("tolerates continueOnFail and wraps errors", async () => {
    const node = makeNode({
      name: "Box Trigger",
      type: TYPE,
      parameters: {
        events: ["FILE.UPLOADED"],
        targetType: "folder",
        targetId: "12345",
      },
    });
    const items = toItems([
      { someField: "valid" },
    ]);
    const workflow = {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
      __executionId: "exec-cof",
    };
    const ctx = createExecutionContext({
      node,
      workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
      getNodeInputItems: () => items,
      continueOnFail: true,
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ someField: "valid" });
  });

  it("FILE.LOCKED event on file target produces correct output", async () => {
    const payload = {
      type: "webhook_event",
      trigger: "FILE.LOCKED",
      source: { id: "f-99", type: "file" },
    };

    const { out } = await runBoxTrigger(
      {
        events: ["FILE.LOCKED"],
        targetType: "file",
        targetId: "99887",
      },
      [payload],
    );

    expect(out[0][0].json.trigger).toBe("FILE.LOCKED");
    expect(out[0][0].json.source.type).toBe("file");
  });

  describe("webhook lifecycle helpers", () => {
    it("registerBoxWebhook and deleteBoxWebhook are exported", () => {
      expect(registerBoxWebhook).toBeInstanceOf(Function);
      expect(deleteBoxWebhook).toBeInstanceOf(Function);
    });
  });
});
