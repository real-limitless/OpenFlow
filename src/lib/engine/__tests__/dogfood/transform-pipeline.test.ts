import { describe, it, expect } from "vitest";
import { executeWorkflow } from "../../runner";
import { getExecutorMap, seedBuiltinExecutors } from "../../index";
import { loadDogfoodFixture } from "./load-fixture";

describe("dogfood WF4 transform-pipeline", () => {
  seedBuiltinExecutors();

  it("sorts, renames, dedupes, and aggregates", async () => {
    const workflow = loadDogfoodFixture("transform-pipeline");

    const result = await executeWorkflow({
      workflow,
      nodeExecutors: getExecutorMap(),
    });

    expect(result.success).toBe(true);

    const sorted = result.runData.Sort?.items?.[0] ?? [];
    expect(sorted.map((i) => i.json.score)).toEqual([9, 9, 5, 1]);

    const renamed = result.runData.Rename?.items?.[0] ?? [];
    expect(renamed[0].json.points).toBe(9);
    expect(renamed[0].json.score).toBeUndefined();

    const deduped = result.runData.Dedupe?.items?.[0] ?? [];
    // two items had points=9 — keep first only
    expect(deduped).toHaveLength(3);
    expect(deduped.map((i) => i.json.points)).toEqual([9, 5, 1]);

    const agg = result.runData.Aggregate?.items?.[0]?.[0]?.json.data as unknown[];
    expect(Array.isArray(agg)).toBe(true);
    expect(agg).toHaveLength(3);
  });
});
