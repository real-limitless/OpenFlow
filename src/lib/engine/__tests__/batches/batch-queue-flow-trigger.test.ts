import { describe, it, expect } from "vitest";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

const TYPE = "n8n-nodes-base.flowTrigger";

describe("batch-queue flowTrigger — n8n-nodes-base.flowTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("Flow Trigger");
  });

  it("emits a single empty item on isolated run (no parent, no webhook event)", async () => {
    const out = await runNode(TYPE, { resource: "list", listIds: "12345" }, []);
    expect(out).toEqual([[{ json: {} }]]);
  });

  it("passes through webhook payload items when present", async () => {
    const payload = { json: { event: "task.created", task: { id: 555, name: "Test" } } };
    const out = await runNode(
      TYPE,
      { resource: "task", taskIds: "555" },
      [payload],
    );
    expect(out).toEqual([[payload]]);
  });

  it("handles multiple webhook events in a single batch", async () => {
    const items = [
      { json: { event: "task.created", task: { id: 1 } } },
      { json: { event: "task.updated", task: { id: 2 } } },
    ];
    const out = await runNode(TYPE, { resource: "task", taskIds: "1,2" }, items);
    expect(out).toEqual([items]);
  });
});
