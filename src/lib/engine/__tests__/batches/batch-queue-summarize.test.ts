import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, makeNode, makeWorkflow } from "../helpers";
import { executeWorkflow } from "../../runner";
import { getExecutorMap } from "../../index";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.summarize";

describe("batch-queue summarize — n8n-nodes-base.summarize", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Summarize");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.summarize")).toBe(canonical);
  });

  describe("count", () => {
    it("counts all items without a field", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "count" }] } },
        [{ a: 1 }, { a: 2 }, { a: 3 }],
      );
      expect(out[0]).toEqual([{ json: { count: 3 } }]);
    });

    it("counts non-null field values by default", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "count", field: "v" }] } },
        [{ v: 1 }, { v: null }, { v: 3 }, {}],
      );
      expect(out[0][0].json.count).toBe(2);
    });

    it("counts all values when includeEmpty is true", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: {
            values: [{ aggregation: "count", field: "v", includeEmpty: true }],
          },
        },
        [{ v: 1 }, { v: null }, { v: 3 }, {}],
      );
      expect(out[0][0].json.count).toBe(4);
    });
  });

  describe("sum", () => {
    it("sums numerical values", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "sum", field: "cost" }] } },
        [{ cost: 10 }, { cost: 20 }, { cost: 5 }],
      );
      expect(out[0]).toEqual([{ json: { cost: 35 } }]);
    });

    it("ignores null and empty strings", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "sum", field: "cost" }] } },
        [{ cost: 10 }, { cost: null }, { cost: "" }, { cost: 20 }],
      );
      expect(out[0][0].json.cost).toBe(30);
    });

    it("coerces numeric strings", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "sum", field: "cost" }] } },
        [{ cost: "10" }, { cost: "20" }],
      );
      expect(out[0][0].json.cost).toBe(30);
    });
  });

  describe("average", () => {
    it("averages numerical values", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "average", field: "cost" }] } },
        [{ cost: 10 }, { cost: 20 }, { cost: 30 }],
      );
      expect(out[0][0].json.cost).toBe(20);
    });

    it("returns null for empty input", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "average", field: "cost" }] } },
        [],
      );
      expect(out[0][0].json.cost).toBeNull();
    });
  });

  describe("min / max", () => {
    it("finds min", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "min", field: "v" }] } },
        [{ v: 3 }, { v: 1 }, { v: 2 }],
      );
      expect(out[0][0].json.v).toBe(1);
    });

    it("finds max", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "max", field: "v" }] } },
        [{ v: 3 }, { v: 1 }, { v: 2 }],
      );
      expect(out[0][0].json.v).toBe(3);
    });

    it("returns null for empty input", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "max", field: "v" }] } },
        [],
      );
      expect(out[0][0].json.v).toBeNull();
    });
  });

  describe("append", () => {
    it("collects values into an array", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "append", field: "name" }] } },
        [{ name: "a" }, { name: "b" }, { name: "c" }],
      );
      expect(out[0][0].json.name).toEqual(["a", "b", "c"]);
    });

    it("skips empty values by default", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "append", field: "name" }] } },
        [{ name: "a" }, { name: null }, { name: "c" }],
      );
      expect(out[0][0].json.name).toEqual(["a", "c"]);
    });

    it("includes empty values when includeEmpty is true", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: {
            values: [{ aggregation: "append", field: "name", includeEmpty: true }],
          },
        },
        [{ name: "a" }, { name: null }, { name: "c" }],
      );
      expect(out[0][0].json.name).toEqual(["a", null, "c"]);
    });
  });

  describe("concatenate", () => {
    it("joins values with default comma separator", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "concatenate", field: "name" }] } },
        [{ name: "a" }, { name: "b" }, { name: "c" }],
      );
      expect(out[0][0].json.name).toBe("a,b,c");
    });

    it("joins with custom separator", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: {
            values: [{ aggregation: "concatenate", field: "name", separateBy: ", " }],
          },
        },
        [{ name: "a" }, { name: "b" }, { name: "c" }],
      );
      expect(out[0][0].json.name).toBe("a, b, c");
    });

    it("supports custom separator via other", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: {
            values: [
              {
                aggregation: "concatenate",
                field: "name",
                separateBy: "other",
                customSeparator: " | ",
              },
            ],
          },
        },
        [{ name: "a" }, { name: "b" }],
      );
      expect(out[0][0].json.name).toBe("a | b");
    });
  });

  describe("countUnique", () => {
    it("counts unique field values", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "countUnique", field: "cat" }] } },
        [{ cat: "a" }, { cat: "b" }, { cat: "a" }, { cat: "c" }, { cat: "b" }],
      );
      expect(out[0][0].json.countUnique).toBe(3);
    });
  });

  describe("grouping (fieldsToSplitBy)", () => {
    it("sums grouped by a field", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: { values: [{ aggregation: "sum", field: "cost" }] },
          fieldsToSplitBy: "country",
        },
        [
          { country: "US", cost: 10 },
          { country: "US", cost: 20 },
          { country: "UK", cost: 5 },
        ],
      );
      expect(out[0]).toHaveLength(2);
      const us = out[0].find((i) => i.json.country === "US");
      const uk = out[0].find((i) => i.json.country === "UK");
      expect(us?.json.cost).toBe(30);
      expect(uk?.json.cost).toBe(5);
    });

    it("groups by multiple fields", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: { values: [{ aggregation: "count" }] },
          fieldsToSplitBy: "country, city",
        },
        [
          { country: "US", city: "NYC" },
          { country: "US", city: "LA" },
          { country: "US", city: "NYC" },
        ],
      );
      expect(out[0]).toHaveLength(2);
      const nyc = out[0].find((i) => i.json.country === "US" && i.json.city === "NYC");
      expect(nyc?.json.count).toBe(2);
    });

    it("supports dot notation in split fields", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: { values: [{ aggregation: "count" }] },
          fieldsToSplitBy: "data.region",
        },
        [{ data: { region: "east" } }, { data: { region: "west" } }, { data: { region: "east" } }],
      );
      expect(out[0]).toHaveLength(2);
      const east = out[0].find((i) => i.json.region === "east");
      expect(east?.json.count).toBe(2);
    });
  });

  describe("outputFormat: singleItem", () => {
    it("packs all groups into a single item", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: { values: [{ aggregation: "sum", field: "cost" }] },
          fieldsToSplitBy: "country",
          options: { outputFormat: "singleItem" },
        },
        [
          { country: "US", cost: 10 },
          { country: "UK", cost: 5 },
        ],
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.country).toEqual(["US", "UK"]);
      expect(out[0][0].json.cost).toEqual([10, 5]);
    });
  });

  describe("skipEmptySplitFields", () => {
    it("skips items missing split-by field values", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: { values: [{ aggregation: "count" }] },
          fieldsToSplitBy: "country",
          options: { skipEmptySplitFields: true },
        },
        [{ country: "US", cost: 1 }, { cost: 2 }, { country: "UK", cost: 3 }],
      );
      expect(out[0]).toHaveLength(2);
      const us = out[0].find((i) => i.json.country === "US");
      const uk = out[0].find((i) => i.json.country === "UK");
      expect(us?.json.count).toBe(1);
      expect(uk?.json.count).toBe(1);
    });
  });

  describe("disableDotNotation", () => {
    it("treats field names literally", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: { values: [{ aggregation: "sum", field: "data.value" }] },
          options: { disableDotNotation: true },
        },
        [{ "data.value": 10 }, { "data.value": 20 }],
      );
      expect(out[0][0].json["data.value"]).toBe(30);
    });
  });

  describe("edge cases", () => {
    it("empty input with no split fields yields one item", async () => {
      const out = await runNode(
        TYPE,
        { fieldsToSummarize: { values: [{ aggregation: "count" }] } },
        [],
      );
      expect(out[0]).toEqual([{ json: { count: 0 } }]);
    });

    it("empty input with split fields yields zero items", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: { values: [{ aggregation: "count" }] },
          fieldsToSplitBy: "country",
        },
        [],
      );
      expect(out[0]).toEqual([]);
    });

    it("multiple aggregations produce multiple output fields", async () => {
      const out = await runNode(
        TYPE,
        {
          fieldsToSummarize: {
            values: [
              { aggregation: "sum", field: "cost" },
              { aggregation: "count" },
              { aggregation: "max", field: "price" },
            ],
          },
        },
        [
          { cost: 10, price: 100 },
          { cost: 20, price: 50 },
          { cost: 5, price: 200 },
        ],
      );
      expect(out[0][0].json.cost).toBe(35);
      expect(out[0][0].json.count).toBe(3);
      expect(out[0][0].json.price).toBe(200);
    });
  });

  it("runs end-to-end in a workflow", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Summarize",
          type: TYPE,
          parameters: {
            fieldsToSummarize: { values: [{ aggregation: "sum", field: "cost" }] },
            fieldsToSplitBy: "country",
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Summarize", type: "main", index: 0 }]] },
      },
    );

    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: {
        Start: [
          { json: { country: "US", cost: 10 } },
          { json: { country: "US", cost: 20 } },
          { json: { country: "UK", cost: 5 } },
        ],
      },
    });
    expect(result.success).toBe(true);
    expect(result.runData.Summarize?.status).toBe("success");
    expect(result.runData.Summarize?.items?.[0]).toHaveLength(2);
  });
});
