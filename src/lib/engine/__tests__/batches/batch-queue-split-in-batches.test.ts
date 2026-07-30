import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeCtx, makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.splitInBatches";

async function runSplit(
  items: Array<Record<string, unknown>>,
  parameters: Record<string, unknown>,
  typeVersion: number,
) {
  const executor = getExecutor(TYPE)!;
  const node = makeNode({ name: "N", type: TYPE, typeVersion, parameters });
  const ctx = makeCtx(items, node);
  return executor(ctx, node);
}

describe("batch-queue split-in-batches — n8n-nodes-base.splitInBatches", () => {
  it("is registered as executor + description (v3)", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const def = getNodeType(TYPE);
    expect(def.placeholder).not.toBe(true);
    expect(def.version).toBe(3);
    // v3 descriptor order: done = 0, loop = 1
    expect(def.outputNames).toEqual(["done", "loop"]);
  });

  it("first batch only (items remain): done empty, loop has first batch", async () => {
    const out = await runSplit(
      [{ i: 1 }, { i: 2 }, { i: 3 }, { i: 4 }, { i: 5 }],
      { batchSize: 2 },
      3,
    );
    expect(out[0]).toEqual([]); // done
    expect(out[1]).toHaveLength(2); // loop
    expect(out[1][0].json).toEqual({ i: 1 });
    expect(out[1][1].json).toEqual({ i: 2 });
  });

  it("exact single batch: loop gets all items, done empty (gap: done needs loop-back)", async () => {
    const out = await runSplit([{ i: 1 }, { i: 2 }], { batchSize: 2 }, 3);
    expect(out[0]).toEqual([]); // done — empty until multi-run accumulation
    expect(out[1]).toHaveLength(2); // loop — both items
    expect(out[1][0].json).toEqual({ i: 1 });
    expect(out[1][1].json).toEqual({ i: 2 });
  });

  it("batch size 1: loop emits a single item", async () => {
    const out = await runSplit(
      [{ url: "https://a.example" }, { url: "https://b.example" }],
      { batchSize: 1, options: {} },
      3,
    );
    expect(out[0]).toEqual([]); // done
    expect(out[1]).toHaveLength(1); // loop
    expect(out[1][0].json).toEqual({ url: "https://a.example" });
  });

  it("empty input: both outputs empty", async () => {
    const out = await runSplit([], { batchSize: 10 }, 3);
    expect(out[0]).toEqual([]); // done
    expect(out[1]).toEqual([]); // loop
  });

  it("reset=true re-seeds from current input (single-pass: no-op, batches current input)", async () => {
    // Single-pass has no prior state; reset is a no-op. Loop still emits first batch
    // of the current input set.
    const out = await runSplit([{ page: 2 }], { batchSize: 1, options: { reset: true } }, 3);
    expect(out[0]).toEqual([]); // done
    expect(out[1]).toHaveLength(1); // loop — the new page item
    expect(out[1][0].json).toEqual({ page: 2 });
  });

  it("v2 output index swap: loop=output[0], done=output[1]", async () => {
    const out = await runSplit(
      [{ i: 1 }, { i: 2 }, { i: 3 }, { i: 4 }, { i: 5 }],
      { batchSize: 2 },
      2,
    );
    // v2: labels swapped vs v3 — loop is index 0, done is index 1
    expect(out[0]).toHaveLength(2); // loop
    expect(out[0][0].json).toEqual({ i: 1 });
    expect(out[0][1].json).toEqual({ i: 2 });
    expect(out[1]).toEqual([]); // done
  });

  it("clamps invalid batchSize to 1", async () => {
    const out = await runSplit([{ a: 1 }, { a: 2 }], { batchSize: 0 }, 3);
    expect(out[1]).toHaveLength(1); // loop — single item (clamped to 1)
    expect(out[0]).toEqual([]); // done
  });

  it("defaults batchSize to 1 for v3 when omitted", async () => {
    const out = await runSplit([{ a: 1 }, { a: 2 }, { a: 3 }], {}, 3);
    expect(out[1]).toHaveLength(1); // loop — single item (default 1)
    expect(out[1][0].json).toEqual({ a: 1 });
  });

  it("defaults batchSize to 10 for v2 when omitted", async () => {
    const items = Array.from({ length: 12 }, (_, k) => ({ n: k }));
    const out = await runSplit(items, {}, 2);
    // v2 default is 10 → loop (output[0]) gets first 10, done (output[1]) empty
    expect(out[0]).toHaveLength(10);
    expect(out[1]).toEqual([]);
  });
});
