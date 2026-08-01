import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.kafka";

describe("batch-queue kafka — n8n-nodes-base.kafka", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const nodeType = getNodeType(TYPE);
    expect(nodeType.placeholder).not.toBe(true);
    expect(nodeType.displayName).toBe("Kafka");
  });

  it("passes items through unchanged (acceptance: basic)", async () => {
    const out = await runNode(TYPE, {}, [{ json: { test: true } }]);
    expect(out[0]).toEqual([{ json: { test: true } }]);
  });

  it("receives parameters without error (acceptance: param parsing)", async () => {
    const out = await runNode(TYPE, {
      topic: "test-topic",
      sendInputData: true,
    }, [{ json: { test: false } }]);
    expect(out[0]).toEqual([{ json: { test: false } }]);
  });

  it("handles unknown parameters gracefully (acceptance: edge case)", async () => {
    const out = await runNode(TYPE, { unknownParam: 123 }, [{ json: { test: true } }]);
    expect(out[0]).toEqual([{ json: { test: true } }]);
  });

  it("runs end-to-end in a workflow", async () => {
    const { makeWorkflow, makeNode } = await import("../helpers");
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Kafka",
          type: TYPE,
          parameters: {
            topic: "test-topic",
            sendInputData: true,
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Kafka", type: "main", index: 0 }]] },
      },
    );

    const { runWorkflowFixture } = await import("../helpers");
    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData[TYPE]?.status).toBe("success");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.kafka")).toBe(canonical);
  });
});