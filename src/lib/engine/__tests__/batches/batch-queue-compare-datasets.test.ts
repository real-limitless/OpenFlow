import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, getExecutorMap, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.compareDatasets";

function makeCtx(parameters: Record<string, unknown>, inputs: INodeExecutionData[][]) {
  const node = makeNode({ name: "CompareDatasets", type: TYPE, parameters });
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: (_n, inputIndex) => inputs[inputIndex] ?? [],
    continueOnFail: false,
  });
  return { ctx, node };
}

const matchId = {
  mergeByFields: { values: [{ field1: "id", field2: "id" }] },
};

describe("batch-queue compareDatasets — n8n-nodes-base.compareDatasets", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Compare Datasets");
  });

  it("same branch — identical paired items", async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeCtx(matchId, [
      [{ json: { id: 1, name: "Ada" } }],
      [{ json: { id: 1, name: "Ada" } }],
    ]);
    const out = await exec(ctx, node);
    expect(out[0]).toEqual([]);
    expect(out[1]).toHaveLength(1);
    expect(out[1][0].json).toEqual({ id: 1, name: "Ada" });
    expect(out[2]).toEqual([]);
    expect(out[3]).toEqual([]);
  });

  it("different branch — prefer Input B", async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeCtx({ ...matchId, resolve: "preferInput2" }, [
      [{ json: { id: 1, v: "a" } }],
      [{ json: { id: 1, v: "b" } }],
    ]);
    const out = await exec(ctx, node);
    expect(out[2]).toHaveLength(1);
    expect(out[2][0].json).toEqual({ id: 1, v: "b" });
    expect(out[1]).toEqual([]);
  });

  it("in A only / in B only — no match", async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeCtx(matchId, [
      [{ json: { id: 1 } }, { json: { id: 2 } }],
      [{ json: { id: 3 } }],
    ]);
    const out = await exec(ctx, node);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ id: 1 });
    expect(out[0][1].json).toEqual({ id: 2 });
    expect(out[3]).toHaveLength(1);
    expect(out[3][0].json).toEqual({ id: 3 });
    expect(out[1]).toEqual([]);
    expect(out[2]).toEqual([]);
  });

  it('fuzzy compare treats 3 and "3" as equal', async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeCtx({ ...matchId, fuzzyCompare: true }, [
      [{ json: { id: 3, v: "x" } }],
      [{ json: { id: "3", v: "x" } }],
    ]);
    const out = await exec(ctx, node);
    expect(out[1]).toHaveLength(1);
    expect(out[0]).toEqual([]);
    expect(out[3]).toEqual([]);
  });

  it('without fuzzyCompare, numeric 3 != string "3" (unpaired)', async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeCtx(matchId, [
      [{ json: { id: 3, v: "x" } }],
      [{ json: { id: "3", v: "x" } }],
    ]);
    const out = await exec(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[3]).toHaveLength(1);
    expect(out[1]).toEqual([]);
  });

  it('skipFields makes a differing pair "same"', async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeCtx({ ...matchId, options: { skipFields: "name" } }, [
      [{ json: { id: 1, name: "Stefan", lang: "de" } }],
      [{ json: { id: 1, name: "Sara", lang: "de" } }],
    ]);
    const out = await exec(ctx, node);
    expect(out[1]).toHaveLength(1);
    expect(out[2]).toEqual([]);
  });

  it("empty inputs produce empty branches", async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeCtx(matchId, [[], []]);
    const out = await exec(ctx, node);
    expect(out).toEqual([[], [], [], []]);
  });

  it("empty Input B sends every A item to In A only", async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeCtx(matchId, [[{ json: { id: 1 } }, { json: { id: 2 } }], []]);
    const out = await exec(ctx, node);
    expect(out[0]).toHaveLength(2);
    expect(out[3]).toEqual([]);
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.compareDatasets")).toBe(canonical);
  });
});
