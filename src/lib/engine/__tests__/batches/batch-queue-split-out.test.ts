import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, makeNode, makeWorkflow } from "../helpers";
import { executeWorkflow } from "../../runner";
import { getExecutorMap } from "../../index";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.splitOut";

describe("batch-queue splitOut — n8n-nodes-base.splitOut", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Split Out");
  });

  it("splits a primitive array (no other fields)", async () => {
    const out = await runNode(TYPE, { fieldToSplitOut: "names", include: "noOtherFields" }, [
      { names: ["a", "b"], keep: 1 },
    ]);
    expect(out[0]).toEqual([{ json: { names: "a" } }, { json: { names: "b" } }]);
  });

  it("splits an object array with all other fields", async () => {
    const out = await runNode(TYPE, { fieldToSplitOut: "users", include: "allOtherFields" }, [
      { users: [{ id: 1 }, { id: 2 }], batch: "B1" },
    ]);
    expect(out[0]).toEqual([{ json: { id: 1, batch: "B1" } }, { json: { id: 2, batch: "B1" } }]);
  });

  it("copies only selected other fields", async () => {
    const out = await runNode(
      TYPE,
      {
        fieldToSplitOut: "tags",
        include: "selectedOtherFields",
        fieldsToInclude: "email",
      },
      [{ tags: ["x", "y"], email: "a@b.c", secret: "no" }],
    );
    expect(out[0]).toEqual([
      { json: { tags: "x", email: "a@b.c" } },
      { json: { tags: "y", email: "a@b.c" } },
    ]);
  });

  it("wraps each element under destinationFieldName", async () => {
    const out = await runNode(
      TYPE,
      {
        fieldToSplitOut: "items",
        include: "noOtherFields",
        options: { destinationFieldName: "row" },
      },
      [{ items: [{ sku: "A" }, { sku: "B" }] }],
    );
    expect(out[0]).toEqual([{ json: { row: { sku: "A" } } }, { json: { row: { sku: "B" } } }]);
  });

  it("resolves nested dot-notation paths and skips empty arrays", async () => {
    const out = await runNode(
      TYPE,
      {
        fieldToSplitOut: "data.ids",
        include: "allOtherFields",
        options: { disableDotNotation: false },
      },
      [
        { data: { ids: [] }, n: 1 },
        { data: { ids: [10] }, n: 2 },
      ],
    );
    expect(out[0]).toEqual([{ json: { ids: 10, n: 2 } }]);
  });

  it("omits binary by default (includeBinary off)", async () => {
    const out = await runNode(TYPE, { fieldToSplitOut: "names" }, [
      { json: { names: ["a"] }, binary: { file: { data: "x" } } },
    ]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toBeUndefined();
  });

  it("copies binary onto each output item when includeBinary is on", async () => {
    const out = await runNode(
      TYPE,
      { fieldToSplitOut: "names", options: { includeBinary: true } },
      [{ json: { names: ["a", "b"] }, binary: { file: { data: "x" } } }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].binary).toEqual({ file: { data: "x" } });
    expect(out[0][1].binary).toEqual({ file: { data: "x" } });
  });

  it("empty input and empty arrays produce empty output (not an error)", async () => {
    const out = await runNode(TYPE, { fieldToSplitOut: "names" }, [{ names: [] }, { names: [] }]);
    expect(out[0]).toEqual([]);
  });

  it("non-array / missing field contributes nothing", async () => {
    const out = await runNode(TYPE, { fieldToSplitOut: "names" }, [
      { other: 1 },
      { names: "scalar" },
    ]);
    expect(out[0]).toEqual([]);
  });

  it("spreads object elements when destination is empty", async () => {
    const out = await runNode(TYPE, { fieldToSplitOut: "users" }, [
      { users: [{ id: 1, name: "a" }] },
    ]);
    expect(out[0]).toEqual([{ json: { id: 1, name: "a" } }]);
  });

  it("runs end-to-end in a workflow and preserves pairedItem", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Split",
          type: TYPE,
          parameters: {
            fieldToSplitOut: "users",
            include: "allOtherFields",
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Split", type: "main", index: 0 }]] },
      },
    );

    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: {
        Start: [{ json: { users: [{ id: 1 }, { id: 2 }], batch: "B1" } }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.runData.Split?.status).toBe("success");
    expect(result.runData.Split?.items?.[0]).toHaveLength(2);
    expect(result.runData.Split?.items?.[0][0].json).toEqual({
      id: 1,
      batch: "B1",
    });
    expect(result.runData.Split?.items?.[0][0].pairedItem).toBeDefined();
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.splitOut")).toBe(canonical);
  });
});
