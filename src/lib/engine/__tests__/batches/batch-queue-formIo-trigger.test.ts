import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions, getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext } from "@/sdk";
import type { ExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.formIoTrigger";

function makeCtx(
  items: Array<Record<string, unknown>>,
  node: ReturnType<typeof makeNode>,
): ExecutionContext {
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
    workflow: workflow as any,
    getNodeInputItems: () =>
      items.map((i) => ({ json: i, binary: {} })),
    continueOnFail: false,
  });
}

async function runFormIoTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>>,
) {
  const node = makeNode({
    name: "Form.io Trigger",
    type: TYPE,
    parameters,
  });
  const ctx = makeCtx(inputItems, node);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue formIoTrigger — n8n-nodes-base.formIoTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Form.io Trigger");
  });

  it("emits a form submission payload (happy path)", async () => {
    const payload = {
      data: { field1: "value1", field2: 42 },
      submission: { _id: "sub-123", state: "completed" },
      form: { _id: "form-456", name: "Contact Form" },
      event: { type: "submission.create" },
    };

    const { out } = await runFormIoTrigger(
      { project: "proj-abc", form: "form-456", events: ["submission.create"] },
      [payload],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(payload);
  });

  it("emits empty defaults when body fields are missing", async () => {
    const { out } = await runFormIoTrigger(
      { project: "proj-abc", form: "form-456", events: ["submission.create"] },
      [{ event: { type: "form.create" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      data: {},
      submission: {},
      form: {},
      event: { type: "form.create" },
    });
  });

  it("handles empty input by emitting single empty item (edge)", async () => {
    const { out } = await runFormIoTrigger(
      { project: "proj-abc", form: "form-456", events: ["submission.create"] },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });
});
