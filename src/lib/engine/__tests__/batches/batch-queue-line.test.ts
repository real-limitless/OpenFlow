import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.line";

function makeCtx(
  items: INodeExecutionData[],
  parameters: Record<string, unknown>,
  continueOnFail = false,
): ExecutionContext {
  const node = makeNode({ name: "LineTest", type: TYPE, parameters });
  return createExecutionContext({
    node,
    workflow: {
      id: "test",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async () => null,
  });
}

function runLine(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  continueOnFail = false,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = inputItems.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
  const ctx = makeCtx(items, parameters, continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue line — n8n-nodes-base.line", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Line");
  });

  it("throws deprecation error on execution by default", async () => {
    await expect(
      runLine({ message: "Hello" }, [{ json: {} }]),
    ).rejects.toThrow(/LINE Notify service ended on 2025-04-01/);
  });

  it("returns error item on continueOnFail", async () => {
    const out = await runLine(
      { message: "Hello" },
      [{ json: {} }],
      true,
    );
    expect(out[0][0].json).toHaveProperty("message");
    expect((out[0][0].json as Record<string, unknown>).message).toContain(
      "LINE Notify service ended",
    );
    expect(out[0][0].json).toHaveProperty("status", 200);
  });

  it("returns empty for empty input on continueOnFail", async () => {
    const executor = getExecutor(TYPE)!;
    const node = makeNode({ name: "N", type: TYPE, parameters: { message: "Hello" } });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [],
      continueOnFail: true,
      getCredential: async () => null,
    });
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(0);
  });

  it("throws even with message parameter set", async () => {
    await expect(
      runLine({ message: "Hello from OpenFlow" }, [{ json: {} }]),
    ).rejects.toThrow(/LINE Notify service ended/);
  });
});
