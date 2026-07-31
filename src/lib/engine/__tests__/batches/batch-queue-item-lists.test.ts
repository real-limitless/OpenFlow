import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.itemLists";

const OPTS = { resource: "itemList" };

describe("batch-queue itemLists — n8n-nodes-base.itemLists", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Item Lists");
  });

  describe("concatenateItems", () => {
    it("aggregates individual fields into arrays (acceptance: individual fields)", async () => {
      const out = await runNode(
        TYPE,
        {
          ...OPTS,
          operation: "concatenateItems",
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [
              { fieldToAggregate: "name", renameField: false },
              { fieldToAggregate: "val", renameField: false },
            ],
          },
          include: "allFields",
          destinationFieldName: "data",
        },
        [{ json: { name: "a", val: 1 } }, { json: { name: "b", val: 2 } }],
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.name).toEqual(["a", "b"]);
      expect(out[0][0].json.val).toEqual([1, 2]);
    });

    it("aggregates all item data into a single list field", async () => {
      const out = await runNode(
        TYPE,
        { ...OPTS, operation: "concatenateItems", aggregate: "aggregateAllItemData", destinationFieldName: "data" },
        [{ x: 1 }, { y: 2 }],
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.data).toEqual([{ x: 1 }, { y: 2 }]);
    });
  });

  describe("limit", () => {
    it("keeps first N items (acceptance: firstItems)", async () => {
      const out = await runNode(TYPE, { ...OPTS, operation: "limit", maxItems: 2, keep: "firstItems" }, [
        { i: 1 },
        { i: 2 },
        { i: 3 },
        { i: 4 },
      ]);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toEqual({ i: 1 });
      expect(out[0][1].json).toEqual({ i: 2 });
    });

    it("keeps last N items", async () => {
      const out = await runNode(TYPE, { ...OPTS, operation: "limit", maxItems: 2, keep: "lastItems" }, [
        { i: 1 },
        { i: 2 },
        { i: 3 },
      ]);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toEqual({ i: 2 });
      expect(out[0][1].json).toEqual({ i: 3 });
    });
  });

  describe("removeDuplicates", () => {
    it("removes duplicates comparing all fields (acceptance: all fields)", async () => {
      const out = await runNode(
        TYPE,
        { ...OPTS, operation: "removeDuplicates", compare: "allFields" },
        [{ json: { x: 1, y: 2 } }, { json: { x: 1, y: 2 } }, { json: { x: 2, y: 3 } }],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toEqual({ x: 1, y: 2 });
      expect(out[0][1].json).toEqual({ x: 2, y: 3 });
    });

    it("removes duplicates comparing selected fields", async () => {
      const out = await runNode(
        TYPE,
        { ...OPTS, operation: "removeDuplicates", compare: "selectedFields", fieldsToCompare: "x" },
        [{ x: 1, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 30 }],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.x).toBe(1);
      expect(out[0][1].json.x).toBe(2);
    });
  });

  describe("sort", () => {
    it("sorts ascending by field (acceptance: simple)", async () => {
      const out = await runNode(
        TYPE,
        {
          ...OPTS,
          operation: "sort",
          type: "simple",
          sortFieldsUi: { sortField: [{ fieldName: "val", order: "ascending" }] },
        },
        [{ val: 3 }, { val: 1 }, { val: 2 }],
      );
      expect(out[0]).toHaveLength(3);
      expect(out[0][0].json.val).toBe(1);
      expect(out[0][1].json.val).toBe(2);
      expect(out[0][2].json.val).toBe(3);
    });

    it("sorts descending by field", async () => {
      const out = await runNode(
        TYPE,
        {
          ...OPTS,
          operation: "sort",
          type: "simple",
          sortFieldsUi: { sortField: [{ fieldName: "val", order: "descending" }] },
        },
        [{ val: 1 }, { val: 3 }, { val: 2 }],
      );
      expect(out[0][0].json.val).toBe(3);
      expect(out[0][2].json.val).toBe(1);
    });

    it("sorts randomly", async () => {
      const out = await runNode(
        TYPE,
        { ...OPTS, operation: "sort", type: "random" },
        [{ v: 1 }, { v: 2 }, { v: 3 }],
      );
      expect(out[0]).toHaveLength(3);
    });
  });

  describe("splitOutItems", () => {
    it("splits array field into separate items (acceptance: array field)", async () => {
      const out = await runNode(
        TYPE,
        { ...OPTS, operation: "splitOutItems", fieldToSplitOut: "tags", include: "allOtherFields" },
        [{ json: { id: 1, tags: ["a", "b", "c"] } }],
      );
      expect(out[0]).toHaveLength(3);
      expect(out[0][0].json.id).toBe(1);
      expect(out[0][0].json.tags).toBe("a");
      expect(out[0][1].json.tags).toBe("b");
      expect(out[0][2].json.tags).toBe("c");
    });

    it("splits with no other fields", async () => {
      const out = await runNode(
        TYPE,
        { ...OPTS, operation: "splitOutItems", fieldToSplitOut: "items", include: "noOtherFields" },
        [{ json: { name: "x", items: [10, 20] } }],
      );
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.name).toBeUndefined();
      expect(out[0][0].json.items).toBe(10);
    });
  });

  describe("summarize", () => {
    it("groups and sums (acceptance: count grouped by field)", async () => {
      const out = await runNode(
        TYPE,
        {
          ...OPTS,
          operation: "summarize",
          fieldsToSummarize: { values: [{ field: "val", aggregation: "sum" }] },
          fieldsToSplitBy: "cat",
          options: { outputFormat: "separateItems" },
        },
        [{ json: { cat: "x", val: 1 } }, { json: { cat: "x", val: 2 } }, { json: { cat: "y", val: 3 } }],
      );
      expect(out[0]).toHaveLength(2);
      const x = out[0].find((i) => i.json.cat === "x");
      const y = out[0].find((i) => i.json.cat === "y");
      expect(x?.json.val).toBe(3);
      expect(y?.json.val).toBe(3);
    });

    it("counts grouped items", async () => {
      const out = await runNode(
        TYPE,
        {
          ...OPTS,
          operation: "summarize",
          fieldsToSummarize: { values: [{ field: "val", aggregation: "count" }] },
          fieldsToSplitBy: "cat",
        },
        [{ cat: "x", val: 1 }, { cat: "x", val: 2 }, { cat: "y", val: 3 }],
      );
      expect(out[0]).toHaveLength(2);
      const x = out[0].find((i) => i.json.cat === "x");
      const y = out[0].find((i) => i.json.cat === "y");
      expect(x?.json.count).toBe(2);
      expect(y?.json.count).toBe(1);
    });
  });

  it("empty input returns empty output", async () => {
    const out = await runNode(TYPE, { ...OPTS, operation: "limit", maxItems: 5 }, []);
    expect(out[0]).toEqual([]);
  });

  it("unknown operation passes through items unchanged", async () => {
    const out = await runNode(TYPE, { ...OPTS, operation: "nonexistent" }, [{ a: 1 }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ a: 1 });
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.itemLists")).toBe(canonical);
  });
});