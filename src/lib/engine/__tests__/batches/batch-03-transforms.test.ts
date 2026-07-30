import { describe, it, expect } from "vitest";
import { hasExecutor, seedBuiltinExecutors } from "../../index";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

const BATCH_TYPES = [
  "n8n-nodes-base.splitOut",
  "n8n-nodes-base.aggregate",
  "n8n-nodes-base.removeDuplicates",
  "n8n-nodes-base.itemLists",
] as const;

describe("batch-03 transforms", () => {
  seedBuiltinExecutors();
  seedBuiltinDescriptions();

  it("registers all four batch types", () => {
    for (const t of BATCH_TYPES) {
      expect(hasExecutor(t), t).toBe(true);
      expect(getNodeType(t).placeholder).not.toBe(true);
    }
  });

  describe("splitOut", () => {
    it("splits an array of primitives", async () => {
      const out = await runNode("n8n-nodes-base.splitOut", { fieldToSplitOut: "names" }, [
        { names: ["a", "b", "c"] },
      ]);
      expect(out[0]).toHaveLength(3);
      expect(out[0].map((i) => i.json.names ?? i.json.value)).toEqual(["a", "b", "c"]);
    });

    it("splits an array of objects", async () => {
      const out = await runNode("n8n-nodes-base.splitOut", { fieldToSplitOut: "users" }, [
        { users: [{ id: 1 }, { id: 2 }], keep: true },
      ]);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.id).toBe(1);
      expect(out[0][1].json.id).toBe(2);
    });

    it("includes other fields when requested", async () => {
      const out = await runNode(
        "n8n-nodes-base.splitOut",
        { fieldToSplitOut: "tags", include: "allOtherFields" },
        [{ tags: ["x", "y"], owner: "me" }],
      );
      expect(out[0][0].json.owner).toBe("me");
      expect(out[0][0].json.tags).toBe("x");
    });
  });

  describe("aggregate", () => {
    it("aggregates all item data into one list", async () => {
      const out = await runNode(
        "n8n-nodes-base.aggregate",
        { aggregate: "allFields", destinationFieldName: "data" },
        [{ a: 1 }, { a: 2 }, { a: 3 }],
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.data).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    });

    it("aggregates individual fields", async () => {
      const out = await runNode(
        "n8n-nodes-base.aggregate",
        {
          aggregate: "individualFields",
          includeFields: {
            fields: [{ fieldToAggregate: "id" }, { fieldToAggregate: "name" }],
          },
        },
        [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      );
      expect(out[0][0].json.id).toEqual([1, 2]);
      expect(out[0][0].json.name).toEqual(["a", "b"]);
    });
  });

  describe("removeDuplicates", () => {
    it("removes full-item duplicates", async () => {
      const out = await runNode("n8n-nodes-base.removeDuplicates", { compare: "allFields" }, [
        { email: "a@x.com" },
        { email: "a@x.com" },
        { email: "b@x.com" },
      ]);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.email).toBe("a@x.com");
      expect(out[0][1].json.email).toBe("b@x.com");
    });

    it("dedupes on selected fields", async () => {
      const out = await runNode(
        "n8n-nodes-base.removeDuplicates",
        {
          compare: "selectedFields",
          fieldsToCompare: "email",
        },
        [
          { email: "a@x.com", n: 1 },
          { email: "a@x.com", n: 2 },
          { email: "b@x.com", n: 3 },
        ],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.n).toBe(1);
      expect(out[0][1].json.email).toBe("b@x.com");
    });
  });

  describe("itemLists", () => {
    it("splitOutItems unpacks array", async () => {
      const out = await runNode(
        "n8n-nodes-base.itemLists",
        { mode: "splitOutItems", arrayFieldName: "data" },
        [{ data: [{ x: 1 }, { x: 2 }] }],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.x).toBe(1);
    });

    it("aggregateItems packs items", async () => {
      const out = await runNode(
        "n8n-nodes-base.itemLists",
        { mode: "aggregateItems", fieldName: "rows" },
        [{ a: 1 }, { a: 2 }],
      );
      expect(out[0][0].json.rows).toEqual([{ a: 1 }, { a: 2 }]);
    });
  });

  it("splitOut → aggregate round-trip workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Split",
          type: "n8n-nodes-base.splitOut",
          parameters: { fieldToSplitOut: "ids" },
        }),
        makeNode({
          id: "3",
          name: "Agg",
          type: "n8n-nodes-base.aggregate",
          parameters: { aggregate: "allFields", destinationFieldName: "data" },
        }),
      ],
      {
        Start: { main: [[{ node: "Split", type: "main", index: 0 }]] },
        Split: { main: [[{ node: "Agg", type: "main", index: 0 }]] },
      },
    );

    const { executeWorkflow } = await import("../../runner");
    const { getExecutorMap } = await import("../../index");
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: { Start: [{ json: { ids: [10, 20] } }] },
    });
    expect(result.success).toBe(true);
    const data = result.runData.Agg?.items?.[0]?.[0]?.json.data as Array<{ ids: number }>;
    expect(data).toHaveLength(2);
  });
});
