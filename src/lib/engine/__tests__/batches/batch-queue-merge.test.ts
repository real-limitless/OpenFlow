import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, getExecutorMap, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.merge";

function makeMergeCtx(parameters: Record<string, unknown>, inputs: INodeExecutionData[][]) {
  const node = makeNode({ name: "Merge", type: TYPE, parameters });
  const ctx = createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: (_n, inputIndex) => inputs[inputIndex] ?? [],
    continueOnFail: false,
  });
  return { ctx, node };
}

describe("batch-queue merge — n8n-nodes-base.merge", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Merge");
  });

  it("appends two input streams (acceptance: [a],[b] → [a,b])", async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeMergeCtx({ mode: "append", numberInputs: 2 }, [
      [{ json: { a: 1 } }],
      [{ json: { b: 2 } }],
    ]);
    const out = await exec(ctx, node);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ a: 1 });
    expect(out[0][1].json).toEqual({ b: 2 });
  });

  it("combines by matching field language (acceptance: name+greeting)", async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeMergeCtx(
      {
        mode: "combine",
        combineBy: "combineByFields",
        fieldsToMatchString: "language",
        numberInputs: 2,
      },
      [
        [{ json: { name: "Stefan", language: "de" } }, { json: { name: "Jim", language: "en" } }],
        [
          { json: { greeting: "Hello", language: "en" } },
          { json: { greeting: "Hallo", language: "de" } },
        ],
      ],
    );
    const out = await exec(ctx, node);
    const byName = Object.fromEntries(out[0].map((i) => [i.json.name as string, i.json]));
    expect(byName.Stefan.greeting).toBe("Hallo");
    expect(byName.Jim.greeting).toBe("Hello");
  });

  it("chooseBranch picks only the selected input index (edge)", async () => {
    const exec = getExecutorMap()[TYPE]!;
    const { ctx, node } = makeMergeCtx({ mode: "chooseBranch", output: "1", numberInputs: 2 }, [
      [{ json: { a: 1 } }],
      [{ json: { b: 2 } }],
    ]);
    const out = await exec(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ b: 2 });
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.merge")).toBe(canonical);
  });
});
