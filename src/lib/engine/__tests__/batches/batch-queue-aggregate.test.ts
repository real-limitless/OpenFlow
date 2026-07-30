import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, makeNode, makeWorkflow } from "../helpers";
import { executeWorkflow } from "../../runner";
import { getExecutorMap } from "../../index";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.aggregate";

describe("batch-queue aggregate — n8n-nodes-base.aggregate", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Aggregate");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.aggregate")).toBe(canonical);
  });

  describe("all item data (aggregateAllItemData)", () => {
    it("packs all items into a single list", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateAllItemData",
          destinationFieldName: "data",
          include: "allFields",
        },
        [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
          { id: 3, name: "c" },
        ],
      );
      expect(out[0]).toEqual([
        {
          json: {
            data: [
              { id: 1, name: "a" },
              { id: 2, name: "b" },
              { id: 3, name: "c" },
            ],
          },
        },
      ]);
    });

    it("keeps only specified fields", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateAllItemData",
          destinationFieldName: "rows",
          include: "specifiedFields",
          fieldsToInclude: "id",
        },
        [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
          { id: 3, name: "c" },
        ],
      );
      expect(out[0]).toEqual([
        { json: { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] } },
      ]);
    });

    it("drops excluded fields (allFieldsExcept)", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateAllItemData",
          destinationFieldName: "data",
          include: "allFieldsExcept",
          fieldsToExclude: "name",
        },
        [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      );
      expect(out[0][0].json.data).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("defaults destinationFieldName to data", async () => {
      const out = await runNode(
        TYPE,
        { aggregate: "aggregateAllItemData", include: "allFields" },
        [{ a: 1 }],
      );
      expect(out[0][0].json.data).toEqual([{ a: 1 }]);
    });

    it("empty input yields one item with an empty array", async () => {
      const out = await runNode(
        TYPE,
        { aggregate: "aggregateAllItemData", include: "allFields" },
        [],
      );
      expect(out[0]).toEqual([{ json: { data: [] } }]);
    });
  });

  describe("individual fields (aggregateIndividualFields)", () => {
    it("collects a field into an array", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [{ fieldToAggregate: "id", renameField: false }],
          },
        },
        [{ id: 1 }, { id: 2 }, { id: 3 }],
      );
      expect(out[0]).toEqual([{ json: { id: [1, 2, 3] } }]);
    });

    it("renames the output field", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [
              {
                fieldToAggregate: "id",
                renameField: true,
                outputFieldName: "ids",
              },
            ],
          },
        },
        [{ id: 1 }, { id: 2 }, { id: 3 }],
      );
      expect(out[0][0].json).toEqual({ ids: [1, 2, 3] });
    });

    it("aggregates multiple fields into separate arrays", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [
              { fieldToAggregate: "id", renameField: false },
              { fieldToAggregate: "name", renameField: false },
            ],
          },
        },
        [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      );
      expect(out[0][0].json).toEqual({ id: [1, 2], name: ["a", "b"] });
    });

    it("resolves dot-notation paths by default", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [{ fieldToAggregate: "data.value", renameField: false }],
          },
        },
        [{ data: { value: 1 } }, { data: { value: 2 } }],
      );
      expect(out[0][0].json).toEqual({ value: [1, 2] });
    });

    it("treats field names literally when disableDotNotation is on", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [{ fieldToAggregate: "data.value", renameField: false }],
          },
          options: { disableDotNotation: true },
        },
        [{ "data.value": 1 }, { "data.value": 2 }],
      );
      expect(out[0][0].json).toEqual({ "data.value": [1, 2] });
    });

    it("empty input yields one item with empty arrays per field", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [{ fieldToAggregate: "id", renameField: false }],
          },
        },
        [],
      );
      expect(out[0]).toEqual([{ json: { id: [] } }]);
    });
  });

  describe("keepMissing", () => {
    const items = [{ v: 1 }, {}, { v: null }, { v: 4 }];

    it("omits null/missing values by default", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [{ fieldToAggregate: "v", renameField: false }],
          },
          options: { keepMissing: false },
        },
        items,
      );
      expect(out[0][0].json.v).toEqual([1, 4]);
    });

    it("keeps null placeholders when keepMissing is on", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [{ fieldToAggregate: "v", renameField: false }],
          },
          options: { keepMissing: true },
        },
        items,
      );
      expect(out[0][0].json.v).toEqual([1, null, null, 4]);
    });
  });

  describe("mergeLists", () => {
    const items = [{ tags: ["a", "b"] }, { tags: ["c"] }];

    it("nests arrays as elements when mergeLists is off", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [{ fieldToAggregate: "tags", renameField: false }],
          },
          options: { mergeLists: false },
        },
        items,
      );
      expect(out[0][0].json.tags).toEqual([["a", "b"], ["c"]]);
    });

    it("flattens into one list when mergeLists is on", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateIndividualFields",
          fieldsToAggregate: {
            fieldToAggregate: [{ fieldToAggregate: "tags", renameField: false }],
          },
          options: { mergeLists: true },
        },
        items,
      );
      expect(out[0][0].json.tags).toEqual(["a", "b", "c"]);
    });
  });

  describe("binaries", () => {
    it("omits binary by default", async () => {
      const out = await runNode(
        TYPE,
        { aggregate: "aggregateAllItemData", include: "allFields" },
        [
          { json: { a: 1 }, binary: { file: { data: "x" } } },
          { json: { a: 2 }, binary: { file: { data: "y" } } },
        ],
      );
      expect(out[0][0].binary).toBeUndefined();
    });

    it("carries binaries onto the single output item when includeBinaries is on", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateAllItemData",
          include: "allFields",
          options: { includeBinaries: true },
        },
        [
          { json: { a: 1 }, binary: { file: { data: "x" } } },
          { json: { a: 2 }, binary: { file: { data: "y" } } },
        ],
      );
      expect(Object.keys(out[0][0].binary ?? {})).toHaveLength(2);
    });

    it("keeps only unique binaries when keepOnlyUnique is on", async () => {
      const out = await runNode(
        TYPE,
        {
          aggregate: "aggregateAllItemData",
          include: "allFields",
          options: { includeBinaries: true, keepOnlyUnique: true },
        },
        [
          {
            json: { a: 1 },
            binary: { file: { data: "x", fileMimeType: "txt", size: 1 } },
          },
          {
            json: { a: 2 },
            binary: { file: { data: "y", fileMimeType: "txt", size: 1 } },
          },
        ],
      );
      expect(Object.keys(out[0][0].binary ?? {})).toHaveLength(1);
    });
  });

  describe("shorthand compatibility", () => {
    it("accepts shorthand allFields mode", async () => {
      const out = await runNode(
        TYPE,
        { aggregate: "allFields", destinationFieldName: "data" },
        [{ a: 1 }, { a: 2 }, { a: 3 }],
      );
      expect(out[0][0].json.data).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    });

    it("accepts shorthand individualFields mode with includeFields", async () => {
      const out = await runNode(
        TYPE,
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

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Agg",
          type: TYPE,
          parameters: {
            aggregate: "aggregateAllItemData",
            destinationFieldName: "data",
            include: "allFields",
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Agg", type: "main", index: 0 }]] },
      },
    );

    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: {
        Start: [
          { json: { id: 1 } },
          { json: { id: 2 } },
        ],
      },
    });
    expect(result.success).toBe(true);
    expect(result.runData.Agg?.status).toBe("success");
    expect(result.runData.Agg?.items?.[0]).toHaveLength(1);
    expect(result.runData.Agg?.items?.[0]?.[0]?.json.data).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });
});