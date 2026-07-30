import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sort";

describe("batch-queue sort — n8n-nodes-base.sort", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Sort");
  });

  it("simple ascending numbers use JS string-sort semantics ([1, 10, 2] not [1, 2, 10])", async () => {
    const out = await runNode(
      TYPE,
      {
        type: "simple",
        fieldToSortBy: [{ fieldName: "n", order: "ascending" }],
      },
      [{ n: 2 }, { n: 10 }, { n: 1 }],
    );
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toEqual({ n: 1 });
    expect(out[0][1].json).toEqual({ n: 10 });
    expect(out[0][2].json).toEqual({ n: 2 });
  });

  it("simple descending strings", async () => {
    const out = await runNode(
      TYPE,
      {
        type: "simple",
        fieldToSortBy: [{ fieldName: "name", order: "descending" }],
      },
      [{ name: "c" }, { name: "a" }, { name: "b" }],
    );
    expect(out[0][0].json).toEqual({ name: "c" });
    expect(out[0][1].json).toEqual({ name: "b" });
    expect(out[0][2].json).toEqual({ name: "a" });
  });

  it("dot notation resolves nested field", async () => {
    const out = await runNode(
      TYPE,
      {
        type: "simple",
        fieldToSortBy: [{ fieldName: "user.age", order: "ascending" }],
      },
      [{ user: { age: 3 } }, { user: { age: 1 } }, { user: { age: 2 } }],
    );
    expect(out[0][0].json).toEqual({ user: { age: 1 } });
    expect(out[0][1].json).toEqual({ user: { age: 2 } });
    expect(out[0][2].json).toEqual({ user: { age: 3 } });
  });

  it("disable dot notation treats field name literally", async () => {
    const out = await runNode(
      TYPE,
      {
        type: "simple",
        disableDotNotation: true,
        fieldToSortBy: [{ fieldName: "user.age", order: "ascending" }],
      },
      [{ "user.age": 3 }, { "user.age": 1 }],
    );
    expect(out[0][0].json).toEqual({ "user.age": 1 });
    expect(out[0][1].json).toEqual({ "user.age": 3 });
  });

  it("random produces a permutation of the input", async () => {
    const input = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }];
    const out = await runNode(TYPE, { type: "random" }, input);
    expect(out[0]).toHaveLength(5);
    const values = out[0].map((i) => i.json.n as number).sort((a, b) => a - b);
    expect(values).toEqual([1, 2, 3, 4, 5]);
  });

  it("code comparator sorts numerically", async () => {
    const out = await runNode(TYPE, { type: "code", code: "return a.json.n - b.json.n;" }, [
      { n: 3 },
      { n: 1 },
      { n: 2 },
    ]);
    expect(out[0][0].json).toEqual({ n: 1 });
    expect(out[0][1].json).toEqual({ n: 2 });
    expect(out[0][2].json).toEqual({ n: 3 });
  });

  it("empty input produces empty output", async () => {
    const out = await runNode(
      TYPE,
      {
        type: "simple",
        fieldToSortBy: [{ fieldName: "n", order: "ascending" }],
      },
      [],
    );
    expect(out[0]).toEqual([]);
  });

  it("multi-field sort: primary key breaks ties via secondary key", async () => {
    const out = await runNode(
      TYPE,
      {
        type: "simple",
        fieldToSortBy: [
          { fieldName: "group", order: "ascending" },
          { fieldName: "rank", order: "descending" },
        ],
      },
      [
        { group: "b", rank: 1 },
        { group: "a", rank: 2 },
        { group: "a", rank: 5 },
        { group: "b", rank: 3 },
      ],
    );
    expect(out[0].map((i) => i.json)).toEqual([
      { group: "a", rank: 5 },
      { group: "a", rank: 2 },
      { group: "b", rank: 3 },
      { group: "b", rank: 1 },
    ]);
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.sort")).toBe(canonical);
  });
});
