import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions, STICKY_NOTE_TYPE } from "@/lib/nodes/registry";
import { runNode, makeNode, makeWorkflow, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.stickyNote";

describe("batch-queue stickyNote — n8n-nodes-base.stickyNote", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(STICKY_NOTE_TYPE).toBe(TYPE);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Sticky Note");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.stickyNote")).toBe(canonical);
  });

  it("is a no-op: produces no output runs", async () => {
    const out = await runNode(
      TYPE,
      { content: "## Note\nhello", width: 320, height: 180, color: 1 },
      [],
    );
    expect(out).toEqual([]);
  });

  it("does not propagate data when placed in a workflow branch", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Note",
          type: TYPE,
          parameters: { content: "just a note", width: 200, height: 100, color: 2 },
        }),
      ],
      { Start: { main: [[{ node: "Note", type: "main", index: 0 }]] } },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Note?.status).toBe("success");
    expect(result.runData.Note?.items ?? []).toEqual([]);
  });
});